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
const { eraseSubmissionIdentity } = require('./dataSubject');
const { recordStatusEvent } = require('../utils/submissionStatus');
const { queueEmail } = require('../utils/emailOutbox');
const log = require('../utils/logger');
const { recordConnectionResult } = require('./adminAlerts');

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

// Bridge row 8: the person's progress, and the answer MIMS approved and sent.
async function applyProgress(integ, sub, change) {
  if (change.owner_assigned && sub.status !== 'closed') {
    const [[seen]] = await pool.execute(
      "SELECT 1 AS x FROM cp_submission_status_events WHERE submission_id = ? AND status = 'in_review' LIMIT 1", [sub.id]);
    if (!seen) await recordStatusEvent({ submissionId: sub.id, clientId: integ.client_id, status: 'in_review', source: 'mims-close-sync' });
  }
  const a = change.answer;
  if (!a) return false;
  const [[existing]] = await pool.execute('SELECT id, mims_response_id FROM cp_submission_answers WHERE submission_id = ?', [sub.id]);
  if (existing && Number(existing.mims_response_id) === Number(a.id)) return false;
  // Only an answer addressed to the person who asked carries its text here; one sent to
  // someone else (a colleague, a pharmacist) is recorded as sent, without the text.
  const body = a.text || 'An answer was sent by the medical information team. It was addressed to a different recipient, so it is not shown here — contact us if you need a copy.';
  if (existing) {
    await pool.execute(
      `UPDATE cp_submission_answers SET body = ?, status = 'sent', source = 'mims', mims_response_id = ?, sent_at = ?, send_error = NULL WHERE id = ?`,
      [body, a.id, a.sent_at, existing.id]);
  } else {
    await pool.execute(
      `INSERT INTO cp_submission_answers (submission_id, client_id, body, status, source, mims_response_id, approved_at, sent_at)
       VALUES (?, ?, ?, 'sent', 'mims', ?, ?, ?)`,
      [sub.id, integ.client_id, body, a.id, a.sent_at, a.sent_at]);
  }
  await recordStatusEvent({ submissionId: sub.id, clientId: integ.client_id, status: 'answered', source: 'mims-close-sync' });
  systemAudit('MIMS integration', integ.client_id, 'ANSWER_RECEIVED', 'submission', sub.id,
    { mims_case_id: change.id, mims_response_id: a.id, to_reporter: !!a.to_reporter });
  // Tell the person where to read it. MIMS emails the answer itself; this email carries
  // no medical content, only the pointer to their signed-in history.
  const [[who]] = await pool.execute(
    `SELECT s.submitter_email, u.email AS user_email, c.code FROM cp_submissions s
       JOIN cp_clients c ON c.id = s.client_id LEFT JOIN cp_portal_users u ON u.id = s.user_id WHERE s.id = ?`, [sub.id]);
  const to = who?.user_email || who?.submitter_email;
  if (to && to.includes('@')) {
    const ref = `CP-${String(sub.id).padStart(6, '0')}`;
    queueEmail(integ.client_id, {
      to, subject: `Your answer is ready — ${ref}`,
      text: `The medical information team has answered your request ${ref}.${who.user_email ? ' Sign in and open My Submissions to read it.' : ' It has been sent to you by email.'}`,
      html: `<p>The medical information team has answered your request <strong>${ref}</strong>.</p><p>${who.user_email ? 'Sign in and open <em>My Submissions</em> to read it.' : 'It has been sent to you by email.'}</p>`,
    }, { kind: 'answer_ready', relatedType: 'submission', relatedId: sub.id });
  }
  return true;
}

/** Apply one MIMS change to the request linked to that case. Returns 'closed', 'reopened' or null. */
async function applyChange(integ, change) {
  const [[sub]] = await pool.execute(
    `SELECT id, status, identity_erased_at FROM cp_submissions WHERE client_id = ? AND external_ref = ? LIMIT 1`,
    [integ.client_id, String(change.id)]);
  if (!sub) return null;
  // Bridge row 10: the reporter's identity was erased on the MIMS case — blank it on
  // this copy as well, and keep the request (Saad: the safety record stays). Done
  // before anything else here, so an answer email can never go to an erased person.
  if (change.reporter_erased && !sub.identity_erased_at) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await eraseSubmissionIdentity(conn, integ.client_id, [sub.id]);
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
    systemAudit('MIMS integration', integ.client_id, 'REPORTER_ERASED_FROM_MIMS', 'submission', sub.id,
      { mims_case_id: change.id, source: 'mims-close-sync' });
  }
  // Answers always travel — an amended answer can go out after the case closed.
  await applyProgress(integ, sub, change);

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
      await recordConnectionResult(integ, true);
      closedCount += r.closed;
      if (r.closed || r.reopened) log.info('mims.close_sync.applied', { client_id: integ.client_id, ...r });
    } catch (err) {
      // One client's MIMS being down must not stop the others; the checkpoint has not
      // moved past anything unread, so the next tick picks up where this one stopped.
      log.warn('mims.close_sync.failed', { client_id: integ.client_id, error: err.message });
      await recordConnectionResult(integ, false, err.message);
    }
  }
  return closedCount;
}

module.exports = { pollOnce, isClosedStatus, applyChange };
