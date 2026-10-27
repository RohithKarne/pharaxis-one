/**
 * otherRequests — CPPM-160: an "Other request" has a holder from the moment it
 * arrives, and someone is told when it waits too long (Rohith, 27 Oct 2026, decision 6).
 *
 * Other requests never go to MIMS, by design, so nothing outside the portal watches
 * them: one could sit with nobody holding it and nobody told. A client can name a
 * default holder (Alert settings); a new Other request is handed to them on arrival,
 * on the same terms as a hand-over (active staff of that client, not a viewer), with
 * an audit line. One that is neither answered nor closed after the client's wait
 * (48 hours unless set) raises one alert to the client's admins and its holder,
 * which closes itself once the request is answered or closed.
 */
const { pool } = require('../database/db');
const { systemAudit } = require('../utils/audit');
const { raiseAlert, clearAlerts } = require('./adminAlerts');
const { describe } = require('./bridgeHeartbeat');
const log = require('../utils/logger');

const DEFAULT_WAIT_HOURS = 48;

/** Hand a new Other request to the client's default holder, if one is set and able. */
async function assignDefaultOwner(clientId, submissionId) {
  try {
    const [[holder]] = await pool.execute(
      `SELECT u.id, u.name FROM cp_alert_settings s
         JOIN cp_admin_users u ON u.id = s.other_owner_id AND u.client_id = s.client_id AND u.is_active = 1 AND u.role <> 'viewer'
        WHERE s.client_id = ?`, [clientId]);
    if (!holder) return null;
    const [r] = await pool.execute(
      `UPDATE cp_submissions SET owner_id = ?, owner_since = NOW(), updated_at = updated_at
        WHERE id = ? AND client_id = ? AND submission_type = 'other_inquiry' AND owner_id IS NULL`,
      [holder.id, submissionId, clientId]);
    if (!r.affectedRows) return null;
    systemAudit('Portal alerts', clientId, 'SUBMISSION_HANDED', 'submission', submissionId,
      { from_id: null, to_id: holder.id, to: holder.name, reason: 'default holder for Other requests' });
    return holder.id;
  } catch (err) {
    log.error('other_requests.assign_failed', { err, client_id: clientId, submission_id: submissionId });
    return null;
  }
}

/** Scheduler sweep: Other requests past the client's wait, and those since dealt with. */
async function sweepWaitingOtherRequests() {
  try {
    const [rows] = await pool.execute(
      `SELECT s.id, s.client_id, s.owner_id, u.name AS owner_name, u.email AS owner_email,
              COALESCE(a.other_wait_hours, ${DEFAULT_WAIT_HOURS}) AS wait_hours,
              TIMESTAMPDIFF(HOUR, s.submitted_at, NOW()) AS age_hours
         FROM cp_submissions s
         LEFT JOIN cp_alert_settings a ON a.client_id = s.client_id
         LEFT JOIN cp_admin_users u ON u.id = s.owner_id AND u.is_active = 1
        WHERE s.submission_type = 'other_inquiry' AND s.status <> 'closed'
          AND NOT EXISTS (SELECT 1 FROM cp_submission_answers ans WHERE ans.submission_id = s.id AND ans.status = 'sent')
          AND s.submitted_at < NOW() - INTERVAL COALESCE(a.other_wait_hours, ${DEFAULT_WAIT_HOURS}) HOUR
        ORDER BY s.id ASC LIMIT 200`);
    for (const s of rows) {
      const ref = `CP-${String(s.id).padStart(6, '0')}`;
      await raiseAlert(s.client_id, {
        kind: 'other_waiting', audience: 'admin',
        title: `Other request ${ref} has waited ${describe(Number(s.age_hours) * 3600)} without an answer`,
        body: `${s.owner_name ? `${s.owner_name} holds it.` : 'Nobody holds it.'} This client's limit is ${s.wait_hours} hours. Other requests do not go to MIMS, so only this portal can answer them. This alert closes when the request is answered or closed.`,
        linkPath: `/admin/clients/${s.client_id}/submissions?search=${ref}`,
        relatedType: 'submission', relatedId: s.id, dedupeKey: `other:${s.id}`,
        alsoTo: s.owner_email ? [s.owner_email] : [],
      });
    }
    // Answered or closed since the alert was raised.
    const [done] = await pool.execute(
      `SELECT a.client_id, a.dedupe_key FROM cp_admin_alerts a JOIN cp_submissions s ON s.id = a.related_id
        WHERE a.kind = 'other_waiting' AND a.resolved_at IS NULL
          AND (s.status = 'closed' OR EXISTS (SELECT 1 FROM cp_submission_answers ans WHERE ans.submission_id = s.id AND ans.status = 'sent'))`);
    for (const a of done) await clearAlerts(a.client_id, a.dedupe_key, 'system: the request was answered or closed');
    return rows.length;
  } catch (err) {
    log.error('other_requests.sweep_failed', { err });
    return 0;
  }
}

module.exports = { assignDefaultOwner, sweepWaitingOtherRequests, DEFAULT_WAIT_HOURS };
