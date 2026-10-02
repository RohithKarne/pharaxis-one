/**
 * mimsCloseSync — the portal follows its MIMS cases (B1 close-sync; bridge row 4).
 *
 * Pull model (CP → MIMS): for each active integration, ask MIMS once "which of my
 * cases changed since my checkpoint" and apply each change to the linked request:
 *   - case finished (MIMS's fixed closed marker)  → request 'closed'
 *   - a finished case reopened in MIMS            → request back with the medical team
 * Each change writes the person's status history and an attributable audit entry (A1).
 *
 * Replaces asking about every open request one call at a time. That only ever
 * reached the oldest 100 per client (request 101 onwards never closed), ran into
 * MIMS's rate limit, read "closed" from a state NAME an organisation can rename, and
 * never noticed a reopen.
 *
 * Same SSRF-guarded, authenticated channel as the outbound sync.
 */
const { pool } = require('../database/db');
const { getAuthHeaders, invalidateAuth } = require('./mimsAuth');
const { safeFetch } = require('../utils/networkGuard');
const { systemAudit } = require('../utils/audit');
const { recordStatusEvent } = require('../utils/submissionStatus');
const log = require('../utils/logger');

const PAGE = 200;
const MAX_PAGES_PER_TICK = 10;
// Each tick starts a few seconds before the checkpoint: MIMS change times are whole
// seconds, so a case changed in the same second as the last one read could otherwise
// be skipped. Re-reading a change is harmless — applying it is idempotent.
const OVERLAP_SECONDS = 5;

function isClosedStatus(name) {
  return typeof name === 'string' && /^closed/i.test(name.trim());
}

async function buildHeaders(integ) {
  const headers = { 'Content-Type': 'application/json', ...(await getAuthHeaders(integ)) };
  if (integ.extra_headers) { try { Object.assign(headers, JSON.parse(integ.extra_headers)); } catch (_) {} }
  return headers;
}

function minusSeconds(ts, seconds) {
  const d = new Date(`${ts.replace(' ', 'T')}Z`);
  return new Date(d.getTime() - seconds * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

/** Apply one MIMS change to the request linked to that case. Returns 'closed', 'reopened' or null. */
async function applyChange(integ, change) {
  const [[sub]] = await pool.execute(
    `SELECT id, status FROM cp_submissions WHERE client_id = ? AND external_ref = ? LIMIT 1`,
    [integ.client_id, String(change.id)]);
  if (!sub) return null;

  if (change.closed && sub.status === 'synced') {
    const [upd] = await pool.execute(
      `UPDATE cp_submissions SET status='closed', updated_at=NOW() WHERE id=? AND status='synced'`, [sub.id]);
    if (!upd.affectedRows) return null;
    await recordStatusEvent({ submissionId: sub.id, clientId: integ.client_id, status: 'closed', source: 'mims-close-sync' });
    systemAudit('MIMS integration', integ.client_id, 'CLOSED_AUTO', 'submission', sub.id,
      { mims_case_id: change.id, mims_status: change.status, source: 'mims-close-sync' });
    return 'closed';
  }

  if (!change.closed && sub.status === 'closed') {
    const [upd] = await pool.execute(
      `UPDATE cp_submissions SET status='synced', updated_at=NOW() WHERE id=? AND status='closed'`, [sub.id]);
    if (!upd.affectedRows) return null;
    await recordStatusEvent({ submissionId: sub.id, clientId: integ.client_id, status: 'reopened', source: 'mims-close-sync' });
    systemAudit('MIMS integration', integ.client_id, 'REOPENED_AUTO', 'submission', sub.id,
      { mims_case_id: change.id, mims_status: change.status, source: 'mims-close-sync' });
    return 'reopened';
  }
  return null;
}

// First run for a connection: tell MIMS which of its cases this portal created, so
// requests sent before MIMS recorded the creating connection are followed too. The
// portal knows exactly which cases are its own — it stores each one's MIMS id.
async function claimExistingCases(integ, headers) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT external_ref FROM cp_submissions WHERE client_id = ? AND external_ref IS NOT NULL`, [integ.client_id]);
  const ids = rows.map(r => Number(r.external_ref)).filter(n => Number.isInteger(n) && n > 0);
  let claimed = 0;
  for (let i = 0; i < ids.length; i += 1000) {
    const r = await safeFetch(new URL('/api/v1/cases/claim', integ.api_base_url).toString(), {
      method: 'POST', headers, body: JSON.stringify({ ids: ids.slice(i, i + 1000) }),
    });
    if (!r.ok) throw new Error(`MIMS refused to link this portal's existing cases (HTTP ${r.status}).`);
    claimed += (await r.json().catch(() => ({}))).claimed || 0;
  }
  systemAudit('MIMS integration', integ.client_id, 'MIMS_CASES_CLAIMED', 'integration', integ.id, { sent: ids.length, claimed });
  return claimed;
}

/** Read and apply the changes for one integration, page by page, moving its checkpoint. */
async function followIntegration(integ) {
  const result = { closed: 0, reopened: 0, read: 0 };
  let headers = await buildHeaders(integ);
  if (!integ.changes_read_at) await claimExistingCases(integ, headers);
  let since = integ.changes_since ? minusSeconds(integ.changes_since, OVERLAP_SECONDS) : null;
  let afterId = integ.changes_since ? 0 : null;

  for (let page = 0; page < MAX_PAGES_PER_TICK; page++) {
    const url = new URL('/api/v1/cases/changes', integ.api_base_url);
    url.searchParams.set('limit', String(PAGE));
    if (since) { url.searchParams.set('since', since); url.searchParams.set('after_id', String(afterId || 0)); }

    let r = await safeFetch(url.toString(), { method: 'GET', headers });
    if (r.status === 401 && integ.auth_type === 'oauth') {
      await invalidateAuth(integ.id);
      headers = await buildHeaders(integ);
      r = await safeFetch(url.toString(), { method: 'GET', headers });
    }
    if (!r.ok) {
      const body = await r.json().catch(() => null);
      throw new Error(`MIMS refused the change list (HTTP ${r.status}${body?.error ? `: ${body.error}` : ''}).`);
    }
    const data = await r.json();
    for (const change of data.changes || []) {
      result.read++;
      const applied = await applyChange(integ, change);
      if (applied) result[applied]++;
    }
    if (data.next) {
      since = data.next.since;
      afterId = data.next.after_id;
      await pool.execute(
        'UPDATE cp_integration_config SET changes_since = ?, changes_after_id = ?, changes_read_at = NOW() WHERE id = ?',
        [since, afterId, integ.id]);
    } else {
      await pool.execute('UPDATE cp_integration_config SET changes_read_at = NOW() WHERE id = ?', [integ.id]);
    }
    if (!data.has_more) break;
  }
  return result;
}

// Follow every active integration once. Returns the number of requests auto-closed.
async function pollOnce() {
  const [integrations] = await pool.execute('SELECT * FROM cp_integration_config WHERE is_active = 1');
  let closedCount = 0;
  for (const integ of integrations) {
    try {
      const r = await followIntegration(integ);
      closedCount += r.closed;
      if (r.closed || r.reopened) log.info('mims.close_sync.applied', { client_id: integ.client_id, ...r });
    } catch (err) {
      // One client's MIMS being down must not stop the others; the checkpoint has not
      // moved past anything unread, so the next tick picks up where this one stopped.
      log.warn('mims.close_sync.failed', { client_id: integ.client_id, error: err.message });
    }
  }
  return closedCount;
}

module.exports = { pollOnce, isClosedStatus, applyChange };
