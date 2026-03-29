'use strict';

const nodemailer = require('nodemailer');
const pool = require('../database/db');

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function getSystemConfig() {
  const [rows] = await pool.execute('SELECT config_key, config_value FROM system_config');
  return rows.reduce((acc, row) => {
    acc[row.config_key] = row.config_value;
    return acc;
  }, {});
}

async function getActiveSuperadminUsers() {
  const [rows] = await pool.execute(
    "SELECT id, email, name FROM users WHERE role = 'superadmin' AND is_active = 1 ORDER BY id"
  );
  return rows;
}

function parseChannels(channels) {
  return String(channels || 'email,in_app')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function parseRecipients(recipientEmails) {
  return String(recipientEmails || '')
    .split(',')
    .map(value => value.trim())
    .filter(value => value.includes('@'));
}

async function getTransporter() {
  const config = await getSystemConfig();
  const host = config.smtp_host;
  const port = parseInt(config.smtp_port || '0', 10);
  const encryption = config.smtp_encryption || 'STARTTLS';
  const username = config.smtp_username;
  const password = config.smtp_password;
  const fromEmail = config.smtp_from_email || username;
  const fromName = config.smtp_from_name || 'MIMS Platform';

  if (!host || !port || !username || !password || !fromEmail) return null;

  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: encryption === 'SSL/TLS',
      requireTLS: encryption === 'STARTTLS',
      auth: { user: username, pass: password },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
    }),
    fromEmail,
    fromName,
  };
}

async function shouldTriggerRule(rule, eventType) {
  const windowMinutes = Math.max(parseInt(rule.window_minutes || '15', 10) || 15, 1);
  const thresholdValue = Math.max(parseInt(rule.threshold_value || '1', 10) || 1, 1);

  if (eventType === 'failed_login_spike') {
    const [[row]] = await pool.execute(
      `SELECT COUNT(*) AS c
       FROM login_audit
       WHERE status = 'failed'
         AND auth_event = 'password_login_failed'
         AND login_time >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [windowMinutes]
    );
    return (row?.c || 0) >= thresholdValue;
  }

  if (eventType === 'two_factor_lockout') {
    const [[row]] = await pool.execute(
      `SELECT COUNT(*) AS c
       FROM login_audit
       WHERE auth_event = '2fa_locked'
         AND login_time >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [windowMinutes]
    );
    return (row?.c || 0) >= thresholdValue;
  }

  if (eventType === 'service_error_threshold') {
    const [[row]] = await pool.execute(
      `SELECT COUNT(*) AS c
       FROM service_logs
       WHERE status = 'failed'
         AND created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [windowMinutes]
    );
    return (row?.c || 0) >= thresholdValue;
  }

  return true;
}

async function passesCooldown(ruleId, cooldownMinutes) {
  const cooldown = Math.max(parseInt(cooldownMinutes || '0', 10) || 0, 0);
  if (!cooldown) return true;
  const [[row]] = await pool.execute(
    `SELECT id
     FROM superadmin_alert_events
     WHERE rule_id = ?
       AND created_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
     ORDER BY id DESC
     LIMIT 1`,
    [ruleId, cooldown]
  );
  return !row;
}

async function createNotificationsForSuperadmins({ title, message, linkUrl = null, metadata = null }) {
  const users = await getActiveSuperadminUsers();
  for (const user of users) {
    await pool.execute(
      `INSERT INTO notifications (user_id, category, title, message, link_url, metadata)
       VALUES (?, 'superadmin_alert', ?, ?, ?, ?)`,
      [user.id, title, message || null, linkUrl, metadata ? JSON.stringify(metadata) : null]
    );
  }
  return users.length;
}

async function sendAlertEmail({ recipients, title, message, metadata }) {
  const transportContext = await getTransporter();
  if (!transportContext) {
    return { status: 'failed', error: 'Platform SMTP is not fully configured.' };
  }
  if (!recipients.length) {
    return { status: 'skipped', error: 'No recipient emails configured for this rule.' };
  }

  const { transporter, fromEmail, fromName } = transportContext;
  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: recipients.join(', '),
      subject: `[MIMS Alert] ${title}`,
      text: `${message || title}\n\nMetadata:\n${JSON.stringify(metadata || {}, null, 2)}`,
    });
    return { status: 'sent', error: null };
  } catch (err) {
    return { status: 'failed', error: err.message || 'Email send failed.' };
  }
}

async function emitSuperadminAlert(eventType, payload = {}) {
  const [rules] = await pool.execute(
    `SELECT *
     FROM superadmin_alert_rules
     WHERE event_type = ?
       AND is_active = 1
     ORDER BY id`,
    [eventType]
  );

  const createdEvents = [];
  for (const rule of rules) {
    const eligible = await shouldTriggerRule(rule, eventType);
    if (!eligible) continue;
    const cooldownPassed = await passesCooldown(rule.id, rule.cooldown_minutes);
    if (!cooldownPassed) continue;

    const channels = parseChannels(rule.channels);
    const recipients = parseRecipients(rule.recipient_emails);
    const metadataJson = payload.metadata ? JSON.stringify(payload.metadata) : null;

    const [result] = await pool.execute(
      `INSERT INTO superadmin_alert_events
       (rule_id, event_type, severity, title, message, metadata, email_status, in_app_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rule.id,
        eventType,
        payload.severity || rule.severity || 'medium',
        payload.title || rule.name,
        payload.message || null,
        metadataJson,
        channels.includes('email') ? 'pending' : 'skipped',
        channels.includes('in_app') ? 'pending' : 'skipped',
      ]
    );

    let emailStatus = channels.includes('email') ? 'pending' : 'skipped';
    let inAppStatus = channels.includes('in_app') ? 'pending' : 'skipped';

    if (channels.includes('in_app')) {
      await createNotificationsForSuperadmins({
        title: payload.title || rule.name,
        message: payload.message || '',
        linkUrl: payload.linkUrl || '/superadmin',
        metadata: payload.metadata || null,
      });
      inAppStatus = 'sent';
    }

    if (channels.includes('email')) {
      const delivery = await sendAlertEmail({
        recipients,
        title: payload.title || rule.name,
        message: payload.message || '',
        metadata: payload.metadata || null,
      });
      emailStatus = delivery.status;
      if (delivery.error) {
        const details = parseJson(metadataJson, {}) || {};
        details.emailError = delivery.error;
        await pool.execute(
          'UPDATE superadmin_alert_events SET metadata = ? WHERE id = ?',
          [JSON.stringify(details), result.insertId]
        );
      }
    }

    await pool.execute(
      'UPDATE superadmin_alert_events SET email_status = ?, in_app_status = ? WHERE id = ?',
      [emailStatus, inAppStatus, result.insertId]
    );

    createdEvents.push({
      id: result.insertId,
      ruleId: rule.id,
      emailStatus,
      inAppStatus,
    });
  }

  return createdEvents;
}

module.exports = {
  emitSuperadminAlert,
  getSystemConfig,
  parseJson,
};
