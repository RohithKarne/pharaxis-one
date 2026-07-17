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

  let retried = 0;
  for (const s of rows) {
    // exponential backoff: base * 2^(attempts-1), measured from the last attempt.
    const backoff = BASE_BACKOFF_MS * Math.pow(2, Math.max(0, (s.sync_attempts || 1) - 1));
    const dueAt = new Date(s.updated_at).getTime() + backoff;
    if (Date.now() < dueAt) continue;

    retried++;
    systemAudit('MIMS integration', s.client_id, 'SYNC_RETRY', 'submission', s.id, { attempt: (s.sync_attempts || 0) + 1 });
    await syncToIntegration(s.client_id, s.id, s.submission_type).catch(() => {});
  }
  return retried;
}

module.exports = { retryOnce };
