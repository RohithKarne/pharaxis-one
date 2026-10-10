/**
 * mimsReconcile — the portal and MIMS compare lists (bridge plan P6).
 *
 * Every hour for side-effect reports and every night for all reports (Rohith,
 * 2026-10-10, decision 4), the portal sends MIMS the key and receipt fingerprint
 * of each report it believes MIMS holds. MIMS answers which keys it has no case
 * for and which it holds from a different version.
 *   - missing   → sent again on its own (MIMS creates the case anew)
 *   - different → an alert; a person compares the request with the case
 * Each run is recorded with its findings, for Sync Health and the monthly export.
 *
 * Before, a report MIMS lost (a restore from an older backup, a case removed in
 * the database) still read "reached MIMS" here, and Sync Health showed 0 failures.
 */
const { pool } = require('../database/db');
const { getAuthHeaders, invalidateAuth } = require('./mimsAuth');
const { safeFetch } = require('../utils/networkGuard');
const { systemAudit } = require('../utils/audit');
const { raiseAlert } = require('./adminAlerts');
const log = require('../utils/logger');

const BATCH = 1000;
// More missing reports than this in one run is not a lost case or two; it is a
// connection pointed at the wrong MIMS or sender. Sending them all again would
// create duplicate cases, so a person is asked to look instead.
const MAX_AUTO_RESEND = 20;
const SCOPES = {
  ae:  ['adverse_event'],
  all: ['adverse_event', 'medical_inquiry', 'product_complaint'],
};

async function buildHeaders(integ) {
  const headers = { 'Content-Type': 'application/json', ...(await getAuthHeaders(integ)) };
  if (integ.extra_headers) { try { Object.assign(headers, JSON.parse(integ.extra_headers)); } catch (_) {} }
  return headers;
}

async function compare(integ, items) {
  let headers = await buildHeaders(integ);
  const post = () => safeFetch(new URL('/api/v1/cases/reconcile', integ.api_base_url).toString(), {
    method: 'POST', headers, body: JSON.stringify({ items }),
  });
  let r = await post();
  if (r.status === 401 && integ.auth_type === 'oauth') {
    await invalidateAuth(integ.id);
    headers = await buildHeaders(integ);
    r = await post();
  }
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`MIMS refused the comparison (HTTP ${r.status}${body?.error ? `: ${body.error}` : ''}).`);
  return body;
}

/** One comparison for one integration. Returns the run's counts. */
async function reconcileIntegration(integ, scope) {
  const types = SCOPES[scope];
  const [run] = await pool.execute(
    'INSERT INTO cp_mims_reconciliations (client_id, integration_id, scope) VALUES (?, ?, ?)', [integ.client_id, integ.id, scope]);
  const runId = run.insertId;
  const counts = { checked: 0, missing: 0, different: 0, resent: 0 };
  try {
    // Reports MIMS confirmed it has: sent with a key and linked to a case. Older
    // reports sent before keys existed cannot be looked up and are left out.
    const [subs] = await pool.execute(
      `SELECT id, submission_type, sync_key, mims_fingerprint FROM cp_submissions
        WHERE client_id = ? AND sync_key IS NOT NULL AND external_ref IS NOT NULL
          AND status IN ('synced', 'closed') AND submission_type IN (${types.map(() => '?').join(',')})
        ORDER BY id`, [integ.client_id, ...types]);
    const byKey = new Map(subs.map(s => [s.sync_key, s]));
    const missing = [];
    for (let i = 0; i < subs.length; i += BATCH) {
      const items = subs.slice(i, i + BATCH).map(s => ({ key: s.sync_key, fingerprint: s.mims_fingerprint || undefined }));
      const answer = await compare(integ, items);
      counts.checked += Number(answer.checked) || 0;
      for (const key of answer.missing || []) if (byKey.has(key)) missing.push(byKey.get(key));
      for (const d of answer.different || []) {
        const s = byKey.get(d.key);
        if (!s) continue;
        counts.different++;
        const ref = `CP-${String(s.id).padStart(6, '0')}`;
        await pool.execute('INSERT INTO cp_mims_reconciliation_items (run_id, submission_id, problem, action) VALUES (?, ?, ?, ?)',
          [runId, s.id, 'different', `Alert raised; MIMS case ${d.case_number || d.id}`]);
        await raiseAlert(integ.client_id, {
          kind: 'reconcile_different', audience: 'integration',
          title: `MIMS holds a different version of ${ref}`,
          body: `The daily comparison found that MIMS case ${d.case_number || d.id} was created from a different version of this request. Compare the two and update the case by hand if needed.`,
          linkPath: `/admin/clients/${integ.client_id}/sync-health`,
          relatedType: 'submission', relatedId: s.id, dedupeKey: `reconcile-different:${s.id}:${s.mims_fingerprint || ''}`,
        });
      }
    }

    // Lost in MIMS: sent again, as the retry job would. MIMS no longer knows the
    // key, so it creates the case anew and returns a new receipt.
    const { syncToIntegration } = require('../routes/portal/submit');
    if (missing.length > MAX_AUTO_RESEND) {
      counts.missing = missing.length;
      for (const s of missing) {
        await pool.execute('INSERT INTO cp_mims_reconciliation_items (run_id, submission_id, problem, action) VALUES (?, ?, ?, ?)',
          [runId, s.id, 'missing', 'Not sent again: too many missing at once; alert raised']);
      }
      await raiseAlert(integ.client_id, {
        kind: 'reconcile_many_missing', audience: 'integration',
        title: `MIMS says ${missing.length} reports are missing`,
        body: `The comparison with MIMS found ${missing.length} reports MIMS has no case for. That many at once usually means the connection points at a different MIMS or sender, so nothing was sent again. Check the connection settings; once fixed, the next comparison sends any report still missing.`,
        linkPath: `/admin/clients/${integ.client_id}/sync-health`,
        dedupeKey: `reconcile-many-missing:${integ.id}`,
      });
      missing.length = 0;
    }
    for (const s of missing) {
      counts.missing++;
      const reason = 'MIMS no longer has this report; the comparison with MIMS is sending it again.';
      await pool.execute(
        `UPDATE cp_submissions SET status='failed_sync', sync_attempts=0, sync_error=?, mims_fingerprint=NULL WHERE id=?`, [reason, s.id]);
      systemAudit('MIMS integration', integ.client_id, 'RECONCILE_RESENT', 'submission', s.id, { run_id: runId, scope });
      await syncToIntegration(integ.client_id, s.id, s.submission_type)
        .catch(err => log.error('mims.reconcile.resend_crashed', { err, submission_id: s.id }));
      const [[after]] = await pool.execute('SELECT status, external_ref, mims_case_number FROM cp_submissions WHERE id = ?', [s.id]);
      const sent = after?.status === 'synced';
      if (sent) counts.resent++;
      await pool.execute('INSERT INTO cp_mims_reconciliation_items (run_id, submission_id, problem, action) VALUES (?, ?, ?, ?)',
        [runId, s.id, 'missing', sent ? `Sent again; now MIMS case ${after.mims_case_number || after.external_ref}` : 'Sent again; not yet accepted, retrying']);
    }
    await pool.execute(
      'UPDATE cp_mims_reconciliations SET finished_at = NOW(), checked = ?, missing = ?, different = ?, resent = ? WHERE id = ?',
      [counts.checked, counts.missing, counts.different, counts.resent, runId]);
  } catch (err) {
    await pool.execute('UPDATE cp_mims_reconciliations SET finished_at = NOW(), checked = ?, error = ? WHERE id = ?',
      [counts.checked, String(err.message || err).slice(0, 1000), runId]);
    throw err;
  }
  return counts;
}

/** Every active integration once, for one scope ('ae' or 'all'). */
async function reconcileOnce(scope) {
  const [integrations] = await pool.execute('SELECT * FROM cp_integration_config WHERE is_active = 1');
  for (const integ of integrations) {
    try {
      const r = await reconcileIntegration(integ, scope);
      if (r.missing || r.different) log.warn('mims.reconcile.found', { client_id: integ.client_id, scope, ...r });
    } catch (err) {
      log.warn('mims.reconcile.failed', { client_id: integ.client_id, scope, error: err.message });
    }
  }
}

/** The hourly tick: side effects every hour; everything once a night's gap has passed. */
async function reconcileTick() {
  await reconcileOnce('ae');
  const [[last]] = await pool.execute(
    "SELECT MAX(started_at) AS at FROM cp_mims_reconciliations WHERE scope = 'all' AND error IS NULL");
  if (!last?.at || Date.now() - new Date(last.at).getTime() > 23 * 60 * 60 * 1000) await reconcileOnce('all');
}

module.exports = { reconcileTick, reconcileOnce, reconcileIntegration };
