'use strict';

const express = require('express');
const pool = require('../../database/db');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');
const { parseJson } = require('../../services/alertService');

const router = express.Router();
const adminAlertAuth = [authenticate, requireRole('admin', 'platform_admin'), requireOrg];

const THRESHOLD_ALERT_EVENTS = new Set(['failed_login_spike', 'two_factor_lockout', 'service_error_threshold']);
const DEFAULT_ALERT_EMAIL_SUBJECT = 'MIMS Alert: {{alert_title}}';
const DEFAULT_ALERT_EMAIL_BODY =
  'Alert: {{alert_title}}\nSeverity: {{severity}}\nOrganisation: {{org_name}}\nTriggered at: {{triggered_at}}\n\n{{message}}';

function parseIntSafe(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAlertRulePayload(input, fallback = {}) {
  const eventType = input.event_type ?? fallback.event_type;
  const isThresholdRule = THRESHOLD_ALERT_EVENTS.has(eventType);
  return {
    name: input.name ?? fallback.name,
    event_type: eventType,
    severity: input.severity ?? fallback.severity ?? 'medium',
    channels: input.channels ?? fallback.channels ?? 'email,in_app',
    recipient_emails: input.recipient_emails ?? fallback.recipient_emails ?? '',
    threshold_value: isThresholdRule ? parseIntSafe(input.threshold_value, fallback.threshold_value ?? 1) : 1,
    window_minutes: isThresholdRule ? parseIntSafe(input.window_minutes, fallback.window_minutes ?? 15) : 0,
    cooldown_minutes: parseIntSafe(input.cooldown_minutes, fallback.cooldown_minutes ?? 30),
    is_active: input.is_active !== undefined ? (input.is_active ? 1 : 0) : (fallback.is_active ?? 1),
  };
}

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

// GET /api/admin/alerts/rules
router.get('/alerts/rules', ...adminAlertAuth, async (_req, res) => {
  try {
    const [rules] = await pool.execute(
      'SELECT * FROM superadmin_alert_rules ORDER BY is_active DESC, name ASC'
    );
    return res.json({ rules });
  } catch (err) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/alerts/rules
router.post('/alerts/rules', ...adminAlertAuth, async (req, res) => {
  try {
    const payload = normalizeAlertRulePayload(req.body || {});
    if (!payload.name || !payload.event_type) return res.status(400).json({ error: 'name and event_type are required.' });
    const [result] = await pool.execute(
      `INSERT INTO superadmin_alert_rules
       (name, event_type, severity, channels, recipient_emails, threshold_value, window_minutes, cooldown_minutes, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.name.trim(),
        payload.event_type,
        payload.severity,
        payload.channels,
        payload.recipient_emails,
        payload.threshold_value,
        payload.window_minutes,
        payload.cooldown_minutes,
        payload.is_active,
        req.user.userId,
        req.user.userId,
      ]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'superadmin_alert_rule', result.insertId, {
      ...payload,
      source: 'mims_admin_system_setup',
    });
    return res.status(201).json({ message: 'Alert rule created.', id: result.insertId });
  } catch (err) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/alerts/rules/:id
router.put('/alerts/rules/:id', ...adminAlertAuth, async (req, res) => {
  try {
    const [[existing]] = await pool.execute('SELECT * FROM superadmin_alert_rules WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Alert rule not found.' });
    const payload = normalizeAlertRulePayload(req.body || {}, existing);
    await pool.execute(
      `UPDATE superadmin_alert_rules
       SET name = ?, event_type = ?, severity = ?, channels = ?, recipient_emails = ?,
           threshold_value = ?, window_minutes = ?, cooldown_minutes = ?, is_active = ?, updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        payload.name,
        payload.event_type,
        payload.severity,
        payload.channels,
        payload.recipient_emails,
        payload.threshold_value,
        payload.window_minutes,
        payload.cooldown_minutes,
        payload.is_active,
        req.user.userId,
        req.params.id,
      ]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'superadmin_alert_rule', Number(req.params.id), {
      ...payload,
      source: 'mims_admin_system_setup',
    });
    return res.json({ message: 'Alert rule updated.' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/alerts/rules/:id
router.delete('/alerts/rules/:id', ...adminAlertAuth, async (req, res) => {
  try {
    const [[existing]] = await pool.execute('SELECT * FROM superadmin_alert_rules WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Alert rule not found.' });
    await pool.execute('DELETE FROM superadmin_alert_rules WHERE id = ?', [req.params.id]);
    await audit(req.user.userId, req.user.email, 'DELETE', 'superadmin_alert_rule', Number(req.params.id), {
      name: existing.name,
      event_type: existing.event_type,
      source: 'mims_admin_system_setup',
    });
    return res.json({ message: 'Alert rule deleted.' });
  } catch (err) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/alerts/events
router.get('/alerts/events', ...adminAlertAuth, async (req, res) => {
  try {
    const limit = Math.min(parseIntSafe(req.query.limit, 50), 200);
    const offset = parseIntSafe(req.query.offset, 0);
    const filters = [];
    const params = [];
    if (req.query.event_type) {
      filters.push('e.event_type = ?');
      params.push(req.query.event_type);
    }
    if (req.query.severity) {
      filters.push('e.severity = ?');
      params.push(req.query.severity);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT e.*, r.name AS rule_name
       FROM superadmin_alert_events e
       LEFT JOIN superadmin_alert_rules r ON r.id = e.rule_id
       ${where}
       ORDER BY e.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const [[{ cnt: total }]] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM superadmin_alert_events e
       ${where}`,
      params
    );
    return res.json({ events: rows.map(row => ({ ...row, metadata: parseJson(row.metadata, null) })), total, limit, offset });
  } catch (err) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/alert-email-template
router.get('/alert-email-template', ...adminAlertAuth, async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT config_key, config_value FROM system_config WHERE config_key IN ('alert_email_subject','alert_email_body')"
    );
    const map = rows.reduce((acc, row) => {
      acc[row.config_key] = row.config_value;
      return acc;
    }, {});
    return res.json({
      subject: map.alert_email_subject || DEFAULT_ALERT_EMAIL_SUBJECT,
      body: map.alert_email_body || DEFAULT_ALERT_EMAIL_BODY,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/alert-email-template
router.put('/alert-email-template', ...adminAlertAuth, async (req, res) => {
  try {
    const { subject, body } = req.body || {};
    if (!subject || !body) return res.status(400).json({ error: 'subject and body are required.' });
    await pool.execute(
      "INSERT INTO system_config (config_key, config_value) VALUES ('alert_email_subject', ?) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)",
      [subject]
    );
    await pool.execute(
      "INSERT INTO system_config (config_key, config_value) VALUES ('alert_email_body', ?) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)",
      [body]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'alert_email_template', null, {
      source: 'mims_admin_system_setup',
    });
    return res.json({ success: true, subject, body });
  } catch (err) {
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
