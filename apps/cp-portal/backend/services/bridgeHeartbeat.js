/**
 * bridgeHeartbeat — CPPM-157: is each background job of the bridge still running?
 *
 * Every job records when it starts and finishes (recordStart / recordFinish, called
 * by withJobLock in server.js). check() compares that with how often the job runs:
 * three intervals with no finished run and the job is late, and every client with an
 * active MIMS connection gets one alert, which closes itself when the job runs again.
 *
 * Before this, the "cannot reach MIMS" alert was raised by the jobs it reports on,
 * so a job that stopped raised nothing and Sync Health stayed green. check() runs at
 * the end of every job (the jobs watch each other) and whenever Sync Health is
 * opened, so a stopped job is found even when it is the job that would report it.
 *
 * Times are compared in SQL against NOW(), as they are written, so the server's
 * time zone cannot make a job look late or on time.
 */
const { pool } = require('../database/db');
const { raiseAlert, clearAlerts } = require('./adminAlerts');
const log = require('../utils/logger');

const MINUTE = 60 * 1000;
const LATE_AFTER_INTERVALS = 3;
// The jobs server.js runs, under the name of the lock each runs with.
const JOBS = [
  { key: 'cp-portal-mims-retry', label: 'Sending reports to MIMS', everyMs: Number(process.env.MIMS_RETRY_INTERVAL_MS || MINUTE),
    stopped: 'reports that did not reach MIMS are not sent again' },
  { key: 'cp-portal-mims-close-sync', label: 'Reading updates from MIMS', everyMs: Number(process.env.MIMS_CLOSE_SYNC_INTERVAL_MS || 5 * MINUTE),
    stopped: 'answers, questions and closures from MIMS do not reach the portal' },
  { key: 'cp-portal-mims-reconcile', label: 'Comparing lists with MIMS', everyMs: Number(process.env.MIMS_RECONCILE_INTERVAL_MS || 60 * MINUTE),
    stopped: 'nothing checks that MIMS still holds every report' },
  { key: 'cp-portal-content-scheduler', label: 'Alerts, emails and scheduled content', everyMs: MINUTE,
    stopped: 'late reports and waiting safety tasks raise no alert, and failed emails are not retried' },
];
// A job cannot be late before this server has been up for three of its intervals:
// after a restart, or on a new installation, it has not had the chance to run.
const STARTED_AT = Date.now();

async function recordStart(jobKey) {
  try {
    await pool.execute(
      `INSERT INTO cp_job_heartbeats (job_key, last_started_at, runs) VALUES (?, NOW(), 1)
       ON DUPLICATE KEY UPDATE last_started_at = NOW(), runs = runs + 1`, [jobKey]);
  } catch (err) {
    log.error('heartbeat.record_failed', { err, job: jobKey });
  }
}

async function recordFinish(jobKey, err = null) {
  try {
    if (err) {
      await pool.execute('UPDATE cp_job_heartbeats SET last_finished_at = NOW(), last_error = ? WHERE job_key = ?',
        [String(err.message || err).slice(0, 1000), jobKey]);
    } else {
      await pool.execute('UPDATE cp_job_heartbeats SET last_finished_at = NOW(), last_ok_at = NOW(), last_error = NULL WHERE job_key = ?', [jobKey]);
    }
  } catch (e) {
    log.error('heartbeat.record_failed', { err: e, job: jobKey });
  }
}

function within(everyMs) {
  return Date.now() - STARTED_AT < LATE_AFTER_INTERVALS * everyMs;
}

/**
 * Where every job stands, and the read of updates from MIMS for each active
 * connection. Raises an alert for each late one and clears those on time again.
 * Returns what it found, for Sync Health. Never throws.
 */
async function check() {
  const out = { jobs: [], connections: [] };
  try {
    const [rows] = await pool.execute(
      `SELECT job_key, last_error, TIMESTAMPDIFF(SECOND, last_finished_at, NOW()) AS finished_ago FROM cp_job_heartbeats`);
    const byKey = Object.fromEntries(rows.map(r => [r.job_key, r]));
    const [active] = await pool.execute(
      `SELECT id, client_id, consecutive_failures, TIMESTAMPDIFF(SECOND, changes_read_at, NOW()) AS read_ago
         FROM cp_integration_config WHERE is_active = 1`);
    const clients = [...new Set(active.map(a => a.client_id))];

    for (const job of JOBS) {
      const hb = byKey[job.key];
      const ago = hb?.finished_ago == null ? null : Number(hb.finished_ago);
      const late = !within(job.everyMs) && (ago == null || ago * 1000 > LATE_AFTER_INTERVALS * job.everyMs);
      const status = late ? 'late' : ago == null ? 'not_yet' : hb.last_error ? 'error' : 'on_time';
      out.jobs.push({ key: job.key, label: job.label, every_seconds: Math.round(job.everyMs / 1000), finished_seconds_ago: ago,
        status, last_error: hb?.last_error || null });
      for (const clientId of clients) {
        if (late) {
          await raiseAlert(clientId, {
            kind: 'job_late', audience: 'integration',
            title: `A bridge job has stopped: ${job.label}`,
            body: `${ago == null ? 'It has not run since this server started' : `It last finished ${describe(ago)} ago`}, and it normally runs every ${describe(job.everyMs / 1000)}. Until it runs again, ${job.stopped}. Restart the portal's server; this alert closes itself when the job runs.`,
            linkPath: `/admin/clients/${clientId}/sync-health`,
            dedupeKey: `heartbeat:${job.key}`,
          });
        } else {
          await clearAlerts(clientId, `heartbeat:${job.key}`, 'system: the job ran again');
        }
      }
    }

    // Each connection's own read of updates from MIMS. The job can be running while one
    // connection's read keeps failing; when MIMS cannot be reached at all the
    // connection alert already says so, so this one is held back.
    const closeSync = JOBS.find(j => j.key === 'cp-portal-mims-close-sync');
    for (const a of active) {
      const ago = a.read_ago == null ? null : Number(a.read_ago);
      const late = !within(closeSync.everyMs) && (ago == null || ago * 1000 > LATE_AFTER_INTERVALS * closeSync.everyMs);
      out.connections.push({ integration_id: a.id, client_id: a.client_id, read_seconds_ago: ago, status: late ? 'late' : ago == null ? 'not_yet' : 'on_time' });
      if (late && Number(a.consecutive_failures) < 3) {
        await raiseAlert(a.client_id, {
          kind: 'return_path_late', audience: 'integration',
          title: 'Updates from MIMS have stopped arriving',
          body: `${ago == null ? 'The portal has not read any updates from MIMS yet' : `The portal last read updates from MIMS ${describe(ago)} ago`}. Answers, questions and closures made in MIMS are not reaching the portal. Check Sync Health and the Integration page.`,
          linkPath: `/admin/clients/${a.client_id}/sync-health`,
          relatedType: 'integration', relatedId: a.id, dedupeKey: `return-path:${a.id}`,
        });
      } else if (!late) {
        await clearAlerts(a.client_id, `return-path:${a.id}`, 'system: updates from MIMS are arriving again');
      }
    }
  } catch (err) {
    log.error('heartbeat.check_failed', { err });
  }
  return out;
}

// "3 minutes", "2 hours", "1 day" — whole units, plain words.
function describe(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 90) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.round(s / 3600);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`;
  const d = Math.round(s / 86400);
  return `${d} day${d === 1 ? '' : 's'}`;
}

module.exports = { recordStart, recordFinish, check, describe, JOBS };
