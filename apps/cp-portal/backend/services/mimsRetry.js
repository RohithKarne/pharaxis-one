/**
 * mimsRetry — R1 auto-retry with exponential backoff.
 *
 * Re-drives failed_sync submissions through the same syncToIntegration path until
 * they succeed or hit the attempts cap. Safe to retry because MIMS case creation is
 * idempotent on the CP reference (R2) — a retry returns the existing case, never a
 * duplicate. Backoff is derived from sync_attempts + updated_at (no schema change).
 */
const { pool } = require('../database/db');
const { systemAudit } = require('../utils/audit');
const log = require('../utils/logger');

const MAX_ATTEMPTS   = Number(process.env.MIMS_SYNC_MAX_ATTEMPTS || 6);
const BASE_BACKOFF_MS = Number(process.env.MIMS_SYNC_BACKOFF_MS || 60 * 1000);
const BATCH = 50;

async function retryOnce() {
  // Lazy require avoids a load-order cycle with the submit route.
  const { syncToIntegration } = require('../routes/portal/submit');

  // Includes stale `pending_sync` rows: a process crash between the status write
  // and the sync result leaves them stuck forever otherwise (found via the Sync
  // Health dashboard — submission #42 sat in pending_sync for months).
  const [rows] = await pool.execute(
    `SELECT id, client_id, submission_type, sync_attempts, updated_at
       FROM cp_submissions
      WHERE (status = 'failed_sync' AND sync_attempts < ?)
         OR (status = 'pending_sync' AND updated_at < NOW() - INTERVAL 10 MINUTE)
      ORDER BY id ASC LIMIT ${BATCH}`,
    [MAX_ATTEMPTS]
  );

  // CPPM-8: a submission still 'submitted' 10 minutes on was never handed over at
  // all — the process died, or the first attempt crashed before recording
  // anything. Only types MIMS takes, and only those made after this client's
  // integration was set up: older ones were deliberately CP-only.
  const [stranded] = await pool.execute(
    `SELECT s.id, s.client_id, s.submission_type
       FROM cp_submissions s
       JOIN cp_integration_config i ON i.client_id = s.client_id AND i.is_active = 1
      WHERE s.status = 'submitted'
        AND s.submission_type IN ('medical_inquiry', 'adverse_event', 'product_complaint')
        AND s.submitted_at >= i.created_at
        AND s.submitted_at < NOW() - INTERVAL 10 MINUTE
      ORDER BY s.id ASC LIMIT ${BATCH}`);

  let retried = 0;
  for (const s of stranded) {
    retried++;
    systemAudit('MIMS integration', s.client_id, 'SYNC_RETRY', 'submission', s.id, { attempt: 1, reason: 'never handed over' });
    await syncToIntegration(s.client_id, s.id, s.submission_type)
      .catch(err => log.error('mims.retry.sync_crashed', { err, submission_id: s.id }));
  }

  for (const s of rows) {
    // exponential backoff: base * 2^(attempts-1), measured from the last attempt.
    const backoff = BASE_BACKOFF_MS * Math.pow(2, Math.max(0, (s.sync_attempts || 1) - 1));
    const dueAt = new Date(s.updated_at).getTime() + backoff;
    if (Date.now() < dueAt) continue;

    retried++;
    systemAudit('MIMS integration', s.client_id, 'SYNC_RETRY', 'submission', s.id, { attempt: (s.sync_attempts || 0) + 1 });
    await syncToIntegration(s.client_id, s.id, s.submission_type)
      .catch(err => log.error('mims.retry.sync_crashed', { err, submission_id: s.id }));
  }

  // Bridge row 3: files whose report is already in MIMS but which have not reached the
  // case — refused, cut off by a crash part-way through, or never tried. Same backoff
  // as reports; a never-tried file waits two minutes after its report synced so the
  // sync's own send is not raced.
  const [files] = await pool.execute(
    `SELECT a.id, a.forward_attempts, a.last_forward_at
       FROM cp_submission_attachments a
       JOIN cp_submissions s ON s.id = a.submission_id
      WHERE a.forward_status IN ('pending', 'failed') AND a.scan_status = 'clean'
        AND a.forward_attempts < ?
        AND s.status IN ('synced', 'closed') AND s.external_ref IS NOT NULL
        AND (a.forward_attempts > 0 OR s.synced_at < NOW() - INTERVAL 2 MINUTE)
      ORDER BY a.id ASC LIMIT ${BATCH}`,
    [MAX_ATTEMPTS]);
  const { forwardReleasedAttachment } = require('../routes/portal/submit');
  for (const f of files) {
    if (f.forward_attempts > 0) {
      const backoff = BASE_BACKOFF_MS * Math.pow(2, f.forward_attempts - 1);
      if (Date.now() < new Date(f.last_forward_at).getTime() + backoff) continue;
    }
    retried++;
    await forwardReleasedAttachment(f.id)
      .catch(err => log.error('mims.retry.file_crashed', { err, attachment_id: f.id }));
  }

  // Bridge row 9: information a person added to a request that is in MIMS, not yet on
  // the case. Same backoff; a never-tried one waits two minutes so the route's own send
  // and the report's sync are not raced.
  const [followups] = await pool.execute(
    `SELECT f.id, f.forward_attempts, f.last_forward_at
       FROM cp_submission_followups f
       JOIN cp_submissions s ON s.id = f.submission_id
      WHERE f.forward_status IN ('pending', 'failed') AND f.forward_attempts < ?
        AND s.external_ref IS NOT NULL
        AND (f.forward_attempts > 0 OR (f.created_at < NOW() - INTERVAL 2 MINUTE AND s.synced_at < NOW() - INTERVAL 2 MINUTE))
      ORDER BY f.id ASC LIMIT ${BATCH}`,
    [MAX_ATTEMPTS]);
  const { forwardFollowUp } = require('../routes/portal/submit');
  for (const f of followups) {
    if (f.forward_attempts > 0) {
      const backoff = BASE_BACKOFF_MS * Math.pow(2, f.forward_attempts - 1);
      if (Date.now() < new Date(f.last_forward_at).getTime() + backoff) continue;
    }
    retried++;
    await forwardFollowUp(f.id)
      .catch(err => log.error('mims.retry.followup_crashed', { err, followup_id: f.id }));
  }

  // CPPM-11: same sweep drives the erasure redactions that MIMS has not taken yet.
  const { retryDueRedactions } = require('./mimsRedaction');
  await retryDueRedactions().catch(err => log.error('mims.retry.redaction_tick_failed', { err }));

  return retried;
}

module.exports = { retryOnce, MAX_ATTEMPTS };
