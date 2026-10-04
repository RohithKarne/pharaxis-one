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
  // CPPM-113: 'admin' alerts (an access request) go to the client's own admins only,
  // never to the people named for integration problems.
  const named = audience === 'admin' ? [] : splitEmails(audience === 'safety' ? settings?.safety_emails : settings?.integration_emails);
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
        text: `${title}\n\n${body || ''}${link ? `\n\nOpen it here (sign-in required): ${link}` : ''}\n\nYou receive this because ${audience === 'admin' ? 'you administer this portal' : `you are named for ${audience === 'safety' ? 'safety' : 'integration'} alerts on this portal`}.`,
        html: `<p><strong>${escapeHtml(title)}</strong></p>${body ? `<p>${escapeHtml(body)}</p>` : ''}${link ? `<p><a href="${link}">Open it in the portal</a> (sign-in required)</p>` : ''}<p style="color:#6b7280;font-size:12px">You receive this because ${audience === 'admin' ? 'you administer this portal' : `you are named for ${audience === 'safety' ? 'safety' : 'integration'} alerts on this portal`}.</p>`,
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
  // CPPM-140: once the problem has cleared, that key is released too. Otherwise a
  // hand-resolved alert blocked its key for good, and the problem coming back later
  // raised nothing. resolved_by is set before resolved_at, as MySQL applies SET in order.
  try {
    const keys = [].concat(dedupeKeys);
    if (!keys.length) return 0;
    const [r] = await pool.execute(
      `UPDATE cp_admin_alerts SET resolved_by = IF(resolved_at IS NULL, ?, resolved_by),
              resolved_at = COALESCE(resolved_at, UTC_TIMESTAMP()), dedupe_key = CONCAT(dedupe_key, '#', id)
        WHERE client_id = ? AND dedupe_key IN (${keys.map(() => '?').join(',')})`,
      [String(by).slice(0, 255), clientId, ...keys]);
    return r.affectedRows;
  } catch (err) {
    log.error('admin_alerts.clear_failed', { err, client_id: clientId });
    return 0;
  }
}

/**
 * CPPM-140: release a key whose alert an admin resolved by hand, for alerts where
 * each new event is new news (an access request), not the same problem again.
 */
async function releaseResolved(clientId, dedupeKey) {
  try {
    await pool.execute(
      `UPDATE cp_admin_alerts SET dedupe_key = CONCAT(dedupe_key, '#', id)
        WHERE client_id = ? AND dedupe_key = ? AND resolved_at IS NOT NULL`, [clientId, dedupeKey]);
  } catch (err) {
    log.error('admin_alerts.release_failed', { err, client_id: clientId, dedupe_key: dedupeKey });
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

// Bridge row 7: whether the connection to MIMS worked on this call. "Worked" means MIMS
// answered — a refusal about the data still proves the line is up. Three failures in a
// row, or MIMS refusing the portal's own sign-in, raise one "cannot reach MIMS" alert;
// the next call that works clears it.
const CONNECTION_FAILURES_BEFORE_ALERT = 3;
async function recordConnectionResult(integration, worked, reason = null) {
  try {
    if (worked) {
      await pool.execute(
        `UPDATE cp_integration_config SET last_sync_at = NOW(), last_sync_status = 'success', last_sync_error = NULL, consecutive_failures = 0 WHERE id = ?`,
        [integration.id]);
      await clearAlerts(integration.client_id, `connection:${integration.id}`, 'system: MIMS answered again');
      return;
    }
    await pool.execute(
      `UPDATE cp_integration_config SET last_sync_at = NOW(), last_sync_status = 'failure', last_sync_error = ?, consecutive_failures = consecutive_failures + 1 WHERE id = ?`,
      [String(reason || '').slice(0, 1000), integration.id]);
    const [[row]] = await pool.execute('SELECT consecutive_failures FROM cp_integration_config WHERE id = ?', [integration.id]);
    const signInRefused = /refused the sign-in/i.test(String(reason || ''));
    if (signInRefused || row.consecutive_failures >= CONNECTION_FAILURES_BEFORE_ALERT) {
      await raiseAlert(integration.client_id, {
        kind: 'connection_down', audience: 'integration',
        title: signInRefused ? 'MIMS is refusing the portal\'s sign-in' : 'The portal cannot reach MIMS',
        body: `${asSentence(reason)} ${signInRefused ? 'Check the client ID and secret on the Integration page.' : `${row.consecutive_failures} calls in a row have failed.`} Reports wait and are sent automatically once MIMS answers.`,
        linkPath: `/admin/clients/${integration.client_id}/integration`,
        relatedType: 'integration', relatedId: integration.id, dedupeKey: `connection:${integration.id}`,
      });
    }
  } catch (err) {
    log.error('admin_alerts.connection_result_failed', { err, integration_id: integration.id });
  }
}

// Bridge row 7: a file the virus scanner could not check stays held — not sent to MIMS,
// not downloadable. Held longer than two hours, the client's team is told once per file.
async function sweepHeldFiles() {
  const [rows] = await pool.execute(
    `SELECT a.id, a.client_id, a.submission_id, a.file_name, a.scan_detail
       FROM cp_submission_attachments a
      WHERE a.scan_status = 'pending' AND a.created_at < NOW() - INTERVAL 2 HOUR
      ORDER BY a.id ASC LIMIT 100`);
  for (const f of rows) {
    const ref = `CP-${String(f.submission_id).padStart(6, '0')}`;
    await raiseAlert(f.client_id, {
      kind: 'file_held', audience: 'integration',
      title: `A file sent with ${ref} has been held unscanned for over 2 hours`,
      body: `"${f.file_name}" could not be checked by the virus scanner${f.scan_detail ? ` (${f.scan_detail})` : ''}. Until it is, it is not sent to MIMS and cannot be downloaded. Check that the scanner is running.`,
      linkPath: `/admin/clients/${f.client_id}/submissions`,
      relatedType: 'submission', relatedId: f.submission_id, dedupeKey: `held:${f.id}`,
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

module.exports = { raiseAlert, clearAlerts, releaseResolved, sweepWaitingSafetyTasks, sweepHeldFiles, recordConnectionResult, recipients, splitEmails, asSentence };
