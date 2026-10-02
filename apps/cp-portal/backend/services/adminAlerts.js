/**
 * adminAlerts — tell the client's own team when something needs them.
 *
 * Before this, every email the portal sent went to the visitor. A report MIMS never
 * received, a safety task nobody had opened, an erasure that never reached MIMS —
 * each was recorded somewhere an admin had to go and look, and nobody was told.
 *
 * An alert is raised once per problem (dedupe key), shown on the client Overview,
 * and emailed through the durable outbox. It closes itself when the problem clears
 * (the report later syncs, the task is closed) or when an admin marks it resolved.
 * Never throws: an alert failing must not fail the work that raised it.
 *
 * Emails carry a reference and a link, never what a person reported — health detail
 * is read inside the portal, after sign-in (Saad, compliance, 2 Oct 2026).
 */
const { pool } = require('../database/db');
const { queueEmail } = require('../utils/emailOutbox');
const { systemAudit } = require('../utils/audit');
const log = require('../utils/logger');

const FRONTEND_BASE_URL = (process.env.CP_FRONTEND_BASE_URL || 'http://localhost:5174').replace(/\/+$/, '');
const SAFETY_ROLES = ['safety_reviewer'];

function splitEmails(text) {
  return String(text || '').split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
}

// Who is told. Named recipients if the client set any; otherwise its own active
// admins — and, for safety work, anyone holding the safety reviewer role.
async function recipients(clientId, audience) {
  const [[settings]] = await pool.execute('SELECT * FROM cp_alert_settings WHERE client_id = ?', [clientId]);
  const named = splitEmails(audience === 'safety' ? settings?.safety_emails : settings?.integration_emails);
  if (named.length) return named;
  const roles = audience === 'safety' ? ['admin', ...SAFETY_ROLES] : ['admin'];
  const [rows] = await pool.execute(
    `SELECT email FROM cp_admin_users WHERE client_id = ? AND is_active = 1 AND role IN (${roles.map(() => '?').join(',')})`,
    [clientId, ...roles]);
  return [...new Set(rows.map(r => String(r.email).toLowerCase()).filter(e => e.includes('@')))];
}

/**
 * Raise an alert. Returns the new alert id, or null if the same problem is already
 * open (or was raised before and not cleared — the dedupe key is the problem).
 */
async function raiseAlert(clientId, { kind, audience, title, body = null, linkPath = null, relatedType = null, relatedId = null, dedupeKey }) {
  try {
    const [r] = await pool.execute(
      `INSERT IGNORE INTO cp_admin_alerts (client_id, kind, audience, title, body, link_path, related_type, related_id, dedupe_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [clientId, kind, audience, String(title).slice(0, 255), body, linkPath, relatedType, relatedId, dedupeKey]);
    if (!r.affectedRows) return null;
    const alertId = r.insertId;

    const to = await recipients(clientId, audience);
    const link = linkPath ? `${FRONTEND_BASE_URL}${linkPath}` : null;
    for (const address of to) {
      queueEmail(clientId, {
        to: address,
        subject: `[Portal alert] ${title}`,
        text: `${title}\n\n${body || ''}${link ? `\n\nOpen it here (sign-in required): ${link}` : ''}\n\nYou receive this because you are named for ${audience === 'safety' ? 'safety' : 'integration'} alerts on this portal.`,
        html: `<p><strong>${escapeHtml(title)}</strong></p>${body ? `<p>${escapeHtml(body)}</p>` : ''}${link ? `<p><a href="${link}">Open it in the portal</a> (sign-in required)</p>` : ''}<p style="color:#6b7280;font-size:12px">You receive this because you are named for ${audience === 'safety' ? 'safety' : 'integration'} alerts on this portal.</p>`,
      }, { kind: 'admin_alert', relatedType: 'admin_alert', relatedId: alertId });
    }
    await pool.execute('UPDATE cp_admin_alerts SET emailed_to = ? WHERE id = ?', [to.join(', ') || null, alertId]);
    // An alert with nobody to send it to is itself worth knowing: it still shows on
    // the Overview, and the audit line says no one was emailed.
    systemAudit('Portal alerts', clientId, 'ALERT_RAISED', relatedType || 'alert', relatedId || alertId,
      { kind, alert_id: alertId, emailed: to.length });
    return alertId;
  } catch (err) {
    log.error('admin_alerts.raise_failed', { err, client_id: clientId, kind });
    return null;
  }
}

/**
 * Close the open alerts for a problem that has cleared. The dedupe key is released
 * (suffixed with the alert id) so the same problem coming back raises a new alert.
 */
async function clearAlerts(clientId, dedupeKeys, by = 'system: problem cleared') {
  // Manual resolution (an admin's "Mark resolved") is in routes/admin/alerts.js and
  // keeps the key, so a dismissed alert does not come straight back on the next sweep.
  try {
    const keys = [].concat(dedupeKeys);
    if (!keys.length) return 0;
    const [r] = await pool.execute(
      `UPDATE cp_admin_alerts SET resolved_at = UTC_TIMESTAMP(), resolved_by = ?, dedupe_key = CONCAT(dedupe_key, '#', id)
        WHERE client_id = ? AND resolved_at IS NULL AND dedupe_key IN (${keys.map(() => '?').join(',')})`,
      [String(by).slice(0, 255), clientId, ...keys]);
    return r.affectedRows;
  } catch (err) {
    log.error('admin_alerts.clear_failed', { err, client_id: clientId });
    return 0;
  }
}

/**
 * Scheduler sweep: a safety task still open after the client's wait time. One
 * alert per task; it closes when the task does.
 */
async function sweepWaitingSafetyTasks() {
  const [rows] = await pool.execute(
    `SELECT t.id, t.client_id, t.created_at, COALESCE(s.safety_wait_hours, 4) AS wait_hours
       FROM cp_ae_review_tasks t
       LEFT JOIN cp_alert_settings s ON s.client_id = t.client_id
      WHERE t.status = 'open'
        AND t.created_at < NOW() - INTERVAL COALESCE(s.safety_wait_hours, 4) HOUR
      ORDER BY t.id ASC LIMIT 100`);
  for (const t of rows) {
    await raiseAlert(t.client_id, {
      kind: 'safety_task_waiting', audience: 'safety',
      title: `Safety task #${t.id} has been waiting more than ${t.wait_hours} hour${t.wait_hours === 1 ? '' : 's'}`,
      body: 'Someone reported they became unwell and nobody has closed the review yet.',
      linkPath: `/admin/clients/${t.client_id}/safety-queue`,
      relatedType: 'ae_review_task', relatedId: t.id, dedupeKey: `safety_wait:${t.id}`,
    });
  }
  return rows.length;
}

// A reason from another system may or may not end with a full stop; make it one sentence.
function asSentence(text) {
  const t = String(text || '').trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

module.exports = { raiseAlert, clearAlerts, sweepWaitingSafetyTasks, recipients, splitEmails, asSentence };
