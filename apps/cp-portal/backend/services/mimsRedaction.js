/**
 * mimsRedaction — CPPM-11: an erasure has to reach the case already sent to MIMS.
 *
 * An AE/PC submission is retained when a person asks to be erased (pharmacovigilance
 * legal obligation) and CP severs the reporter identity on its own copy. The copy
 * in MIMS was left alone, so the person's name and email survived there.
 *
 * Every MIMS case an erasure has to reach is recorded in cp_mims_redactions first,
 * inside the erasure transaction, and only then called. If MIMS is unreachable the
 * row stays 'pending' and the scheduler retries it with backoff; after the last
 * attempt it is 'failed' and visible, never quietly dropped. Same outbound channel
 * as the sync (SSRF-guarded fetch, mimsAuth headers), and the MIMS endpoint is
 * idempotent, so a retry is safe.
 */
const { pool } = require('../database/db');
const { getAuthHeaders, invalidateAuth } = require('./mimsAuth');
const { safeFetch } = require('../utils/networkGuard');
const { systemAudit } = require('../utils/audit');
const log = require('../utils/logger');

const MAX_ATTEMPTS    = Number(process.env.MIMS_REDACTION_MAX_ATTEMPTS || 8);
const BACKOFF_MINUTES = [1, 5, 15, 60, 240];   // wait after attempts 1..5, then 240
const TIMEOUT_MS      = Number(process.env.MIMS_REDACTION_TIMEOUT_MS || 10000);
const BATCH = 50;

/** Record the cases this erasure still owes MIMS. Runs on the caller's transaction. */
async function queueRedactions(conn, clientId, portalUserId, submissions) {
  for (const s of submissions) {
    // INSERT IGNORE on the unique submission key: re-running an erasure, or a
    // retry sweep, must not queue the same case twice or reopen a finished one.
    await conn.execute(
      `INSERT IGNORE INTO cp_mims_redactions (client_id, submission_id, external_ref, portal_user_id)
       VALUES (?, ?, ?, ?)`,
      [clientId, s.id, String(s.external_ref), portalUserId || null]
    );
  }
}

// One call to MIMS. Throws with a readable reason on anything that is not a 2xx,
// including "no integration" — a client whose integration was switched off still
// has the identity sitting in MIMS, so that is a failure to retry, not a skip.
async function callMims(row) {
  const [[integration]] = await pool.execute(
    'SELECT * FROM cp_integration_config WHERE client_id = ? AND is_active = 1 LIMIT 1', [row.client_id]);
  if (!integration) throw new Error('No active MIMS integration is configured for this client.');

  const buildHeaders = async () => {
    const headers = { 'Content-Type': 'application/json', ...(await getAuthHeaders(integration)) };
    if (integration.extra_headers) { try { Object.assign(headers, JSON.parse(integration.extra_headers)); } catch (_) {} }
    return headers;
  };
  let headers = await buildHeaders();

  const url = new URL(`/api/v1/cases/${encodeURIComponent(row.external_ref)}/redact-reporter`, integration.api_base_url).toString();
  // A hung MIMS must not hold the admin's erasure request open indefinitely.
  const post = () => safeFetch(url, { method: 'POST', headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  let r = await post();

  // Same as the sync path: a cached OAuth token can be revoked server-side.
  if (r.status === 401 && integration.auth_type === 'oauth') {
    await invalidateAuth(integration.id);
    headers = await buildHeaders();
    r = await post();
  }
  if (!r.ok) throw new Error(`MIMS returned HTTP ${r.status}.`);
}

/** One attempt for a queued row. The outcome is always written back to the row. */
async function attemptRedaction(id) {
  const [[row]] = await pool.execute(`SELECT * FROM cp_mims_redactions WHERE id = ? AND status = 'pending'`, [id]);
  if (!row) return null;
  try {
    await callMims(row);
    await pool.execute(
      `UPDATE cp_mims_redactions SET status='done', attempts=attempts+1, completed_at=NOW(), last_error=NULL WHERE id=?`, [id]);
    systemAudit('MIMS integration', row.client_id, 'MIMS_REPORTER_REDACTED', 'submission', row.submission_id,
      { mims_case_id: row.external_ref });
    return true;
  } catch (err) {
    const attempts = row.attempts + 1;
    const finalAttempt = attempts >= MAX_ATTEMPTS;
    const waitMin = BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length) - 1];
    const reason = String(err.message || err).slice(0, 1000);
    await pool.execute(
      `UPDATE cp_mims_redactions
          SET attempts = ?, last_error = ?, status = ?, next_attempt_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
        WHERE id = ?`,
      [attempts, reason, finalAttempt ? 'failed' : 'pending', waitMin, id]);
    // Audited on every attempt: an erasure that has not reached MIMS is a
    // regulatory exposure, so it belongs in the trail, not only in a log file.
    systemAudit('MIMS integration', row.client_id,
      finalAttempt ? 'MIMS_REDACTION_GAVE_UP' : 'MIMS_REDACTION_FAILED', 'submission', row.submission_id,
      { mims_case_id: row.external_ref, attempt: attempts, error: reason });
    log[finalAttempt ? 'error' : 'warn'](finalAttempt ? 'mims.redaction.gave_up' : 'mims.redaction.retry',
      { submission_id: row.submission_id, mims_case_id: row.external_ref, attempts, error: reason });
    return false;
  }
}

/**
 * Try the queued redactions for these submissions now, so the admin fulfilling
 * the erasure is told what actually happened. Returns the MIMS case ids in each
 * state; anything not done is still queued and will be retried.
 */
async function flushForSubmissions(clientId, submissionIds) {
  const result = { done: [], pending: [] };
  if (!submissionIds.length) return result;
  const ph = submissionIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, external_ref, status FROM cp_mims_redactions WHERE client_id = ? AND submission_id IN (${ph})`,
    [clientId, ...submissionIds]);
  for (const row of rows) {
    if (row.status === 'done') { result.done.push(row.external_ref); continue; }
    const ok = await attemptRedaction(row.id);
    (ok ? result.done : result.pending).push(row.external_ref);
  }
  return result;
}

/** Called by the MIMS retry sweep: everything that is due, oldest first. */
async function retryDueRedactions() {
  const [due] = await pool.execute(
    `SELECT id FROM cp_mims_redactions
      WHERE status = 'pending' AND next_attempt_at <= NOW()
      ORDER BY id ASC LIMIT ${BATCH}`);
  for (const { id } of due) await attemptRedaction(id);
  return due.length;
}

/** One plain-English line for the erasure summary the admin sees. */
function describe({ done, pending }) {
  if (!done.length && !pending.length) return 'MIMS: no case had been sent, so there was nothing to remove there.';
  const list = refs => `${refs.length === 1 ? 'case' : 'cases'} ${refs.join(', ')}`;
  const parts = [];
  if (done.length) parts.push(`reporter identity removed from ${list(done)}`);
  if (pending.length) parts.push(`${list(pending)} could not be reached and ${pending.length === 1 ? 'is' : 'are'} queued for automatic retry`);
  return `MIMS: ${parts.join('; ')}.`;
}

module.exports = { queueRedactions, attemptRedaction, flushForSubmissions, retryDueRedactions, describe, MAX_ATTEMPTS };
