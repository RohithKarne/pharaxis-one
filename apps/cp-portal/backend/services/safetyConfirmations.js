'use strict';

/**
 * safetyConfirmations.js — who has confirmed a high or critical safety letter
 * (CPPM-114 records it; CPPM-127 reports it) and the one reminder to those who
 * have not (CPPM-137).
 *
 * "Addressed to" is every active doctor the letter's audience covers: the same
 * people the portal banner asks to confirm (routes/portal/safety.js).
 */

const { pool } = require('../database/db');
const { canSee } = require('../utils/audience');
const { queueEmail } = require('../utils/emailOutbox');
const { systemAudit } = require('../utils/audit');
const log = require('../utils/logger');

// CPPM-137 (Saad, compliance owner, 4 Oct 2026): one reminder, three days after the
// letter goes live.
const REMIND_AFTER_DAYS = 3;
const FRONTEND_BASE_URL = (process.env.CP_FRONTEND_BASE_URL || 'http://localhost:5174').replace(/\/+$/, '');

// Every high and critical letter of a client (or one, by id), with each addressed
// doctor's confirmation and reminder. Reading only.
async function confirmationData(clientId, alertId) {
  const [letters] = await pool.execute(
    `SELECT id, title, severity, status, effective_date, publish_at, target_types_json
       FROM cp_safety_alerts
      WHERE client_id = ? AND severity IN ('high', 'critical')${alertId ? ' AND id = ?' : ''}
      ORDER BY effective_date DESC, id DESC`,
    alertId ? [clientId, alertId] : [clientId]);
  const [doctors] = await pool.execute(
    `SELECT id, first_name, last_name, email, user_type FROM cp_portal_users
      WHERE client_id = ? AND is_active = 1 AND access_status IS NULL`, [clientId]);
  const [acks] = await pool.execute(
    `SELECT k.alert_id, k.acknowledged_at, u.id, u.first_name, u.last_name, u.email, u.user_type
       FROM cp_safety_acknowledgements k JOIN cp_portal_users u ON u.id = k.portal_user_id
      WHERE k.client_id = ?`, [clientId]);
  const [reminders] = await pool.execute(
    'SELECT alert_id, portal_user_id, reminded_at FROM cp_safety_ack_reminders WHERE client_id = ?', [clientId]);
  return letters.map(l => {
    const addressed = doctors.filter(d => canSee(l.target_types_json, d.user_type || 'other'));
    const confirmed = new Map(acks.filter(a => a.alert_id === l.id).map(a => [a.id, a]));
    const reminded  = new Map(reminders.filter(r => r.alert_id === l.id).map(r => [r.portal_user_id, r.reminded_at]));
    const rows = addressed.map(d => ({
      ...d, acknowledged_at: confirmed.get(d.id)?.acknowledged_at || null, reminded_at: reminded.get(d.id) || null, addressed: true,
    }));
    // Someone who confirmed and has since left (deactivated, or the audience
    // changed) still appears, so no confirmation drops out of the record.
    for (const a of confirmed.values()) {
      if (!addressed.some(d => d.id === a.id)) rows.push({ id: a.id, first_name: a.first_name, last_name: a.last_name, email: a.email, user_type: a.user_type, acknowledged_at: a.acknowledged_at, reminded_at: reminded.get(a.id) || null, addressed: false });
    }
    return {
      id: l.id, title: l.title, severity: l.severity, status: l.status, effective_date: l.effective_date,
      addressed: addressed.length, confirmed: rows.filter(r => r.addressed && r.acknowledged_at).length, doctors: rows,
    };
  });
}

function reminderEmail({ firstName, portalName, title, liveAt, link }) {
  const date = new Date(liveAt).toISOString().slice(0, 10);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const subject = `Please confirm you have read: ${title}`;
  const text = [
    `Hello ${firstName},`,
    '',
    `On ${date}, ${portalName} published an important safety letter: "${title}".`,
    `Please open it and select "I have read this": ${link}`,
    '',
    'We send this reminder once.',
    '',
    portalName,
  ].join('\n');
  const html = `<p>Hello ${esc(firstName)},</p>
<p>On ${esc(date)}, ${esc(portalName)} published an important safety letter: &ldquo;${esc(title)}&rdquo;.</p>
<p>Please open it and select &ldquo;I have read this&rdquo;: <a href="${esc(link)}">${esc(link)}</a></p>
<p>We send this reminder once.</p>
<p>${esc(portalName)}</p>`;
  return { subject, text, html };
}

// CPPM-137: run from the scheduler tick. For each active high or critical letter
// live for three days or more, email every addressed doctor who has neither
// confirmed it nor been reminded. The reminder row is written first; its unique key
// means a second sweep, or a second instance, never sends a second email.
async function sweepSafetyReminders() {
  const [letters] = await pool.execute(
    `SELECT a.id, a.client_id, a.title, a.target_types_json, COALESCE(a.publish_at, a.created_at) AS live_at,
            c.code, c.name AS client_name, b.portal_name
       FROM cp_safety_alerts a
       JOIN cp_clients c ON c.id = a.client_id AND c.is_active = 1
       LEFT JOIN cp_branding b ON b.client_id = a.client_id
      WHERE a.status = 'active' AND a.severity IN ('high', 'critical')
        AND COALESCE(a.publish_at, a.created_at) <= NOW() - INTERVAL ${REMIND_AFTER_DAYS} DAY`);
  let sent = 0;
  for (const l of letters) {
    const [due] = await pool.execute(
      `SELECT u.id, u.first_name, u.email, u.user_type
         FROM cp_portal_users u
         LEFT JOIN cp_safety_acknowledgements k ON k.alert_id = ? AND k.portal_user_id = u.id
         LEFT JOIN cp_safety_ack_reminders r    ON r.alert_id = ? AND r.portal_user_id = u.id
        WHERE u.client_id = ? AND u.is_active = 1 AND u.access_status IS NULL AND k.id IS NULL AND r.id IS NULL`,
      [l.id, l.id, l.client_id]);
    const portalName = l.portal_name || l.client_name;
    const link = `${FRONTEND_BASE_URL}/portal/${l.code}/safety#alert-${l.id}`;
    let n = 0;
    for (const u of due.filter(d => canSee(l.target_types_json, d.user_type || 'other'))) {
      const [ins] = await pool.execute(
        `INSERT IGNORE INTO cp_safety_ack_reminders (client_id, alert_id, portal_user_id, reminded_at) VALUES (?, ?, ?, UTC_TIMESTAMP())`,
        [l.client_id, l.id, u.id]);
      if (ins.affectedRows !== 1) continue; // someone else got there first
      const outboxId = await queueEmail(l.client_id, { to: u.email, ...reminderEmail({ firstName: u.first_name, portalName, title: l.title, liveAt: l.live_at, link }) },
        { kind: 'safety_ack_reminder', relatedType: 'safety_alert', relatedId: l.id });
      if (outboxId) await pool.execute('UPDATE cp_safety_ack_reminders SET outbox_id = ? WHERE id = ?', [outboxId, ins.insertId]);
      else log.error('safety.reminder.not_queued', { alertId: l.id, portalUserId: u.id });
      n++;
    }
    if (n) await systemAudit('system', l.client_id, 'REMIND', 'safety_alert', l.id, { doctors: n, after_days: REMIND_AFTER_DAYS });
    sent += n;
  }
  return sent;
}

module.exports = { confirmationData, sweepSafetyReminders, REMIND_AFTER_DAYS };
