/**
 * Portal Safety Alerts — /api/portal/safety
 * F-13: Safety communications visible to portal users, always accessible
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticatePortal, requirePortalAuth } = require('../../middleware/auth');
const { applyTranslation } = require('../../utils/translator');

const SAFETY_TRANS_FIELDS = ['title', 'body_html'];
const path = require('path');
const fs   = require('fs');
const log = require('../../utils/logger');
const { hasAnalyticsConsent } = require('../../utils/consent');
const { canSee } = require('../../utils/audience');
const { systemAudit } = require('../../utils/audit');

// CPPM-114: the letters a doctor is asked to confirm — active, high or critical.
const ACK_SEVERITIES = ['high', 'critical'];
function needsAck(a) {
  return a.status === 'active' && ACK_SEVERITIES.includes(String(a.severity || '').toLowerCase());
}

// The active high and critical letters this doctor can see and has not confirmed.
async function unconfirmed(clientId, user) {
  const [rows] = await pool.execute(`
    SELECT a.id, a.title, a.severity, a.status, a.target_types_json
      FROM cp_safety_alerts a
      LEFT JOIN cp_safety_acknowledgements k ON k.alert_id = a.id AND k.portal_user_id = ?
     WHERE a.client_id = ? AND a.status = 'active' AND a.severity IN ('high', 'critical')
       AND (a.publish_at IS NULL OR a.publish_at <= NOW()) AND k.id IS NULL
     ORDER BY CASE a.severity WHEN 'critical' THEN 1 ELSE 2 END, a.id DESC`,
    [user.userId, clientId]);
  return rows.filter(a => canSee(a.target_types_json, user.user_type || 'other'));
}

// GET /api/portal/safety/:clientCode/acknowledgements — CPPM-114: what the banner
// shows a signed-in doctor: how many letters wait for "I have read this".
router.get('/:clientCode/acknowledgements', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [req.params.clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    const waiting = await unconfirmed(client.id, req.portalUser);
    res.json({ waiting: waiting.length, first: waiting[0] ? { id: waiting[0].id, title: waiting[0].title } : null });
  } catch (err) {
    log.error('portal.safety.error', { err, route: 'GET /:clientCode/acknowledgements', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/portal/safety/:clientCode/alerts/:id/acknowledge — CPPM-114: the doctor
// confirms they have read a high or critical letter they can see. Recorded once.
router.post('/:clientCode/alerts/:id/acknowledge', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [req.params.clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    const [[alert]] = await pool.execute(
      `SELECT id, severity, status, target_types_json FROM cp_safety_alerts
        WHERE id = ? AND client_id = ? AND (publish_at IS NULL OR publish_at <= NOW())`,
      [req.params.id, client.id]);
    if (!alert || !canSee(alert.target_types_json, req.portalUser.user_type || 'other')) return res.status(404).json({ error: 'Alert not found.' });
    if (!needsAck(alert)) return res.status(400).json({ error: 'Only active high and critical safety letters ask for confirmation.' });
    const [r] = await pool.execute(
      `INSERT IGNORE INTO cp_safety_acknowledgements (client_id, alert_id, portal_user_id, acknowledged_at) VALUES (?, ?, ?, UTC_TIMESTAMP())`,
      [client.id, alert.id, req.portalUser.userId]);
    if (r.affectedRows) await systemAudit('portal', client.id, 'SAFETY_ACKNOWLEDGED', 'safety_alert', alert.id, { portal_user_id: req.portalUser.userId });
    const [[k]] = await pool.execute('SELECT acknowledged_at FROM cp_safety_acknowledgements WHERE alert_id = ? AND portal_user_id = ?', [alert.id, req.portalUser.userId]);
    res.json({ acknowledged_at: k.acknowledged_at });
  } catch (err) {
    log.error('portal.safety.error', { err, route: 'POST /:clientCode/alerts/:id/acknowledge', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/safety?clientCode=xxx
router.get('/', authenticatePortal, async (req, res) => {
  try {
    const { clientCode } = req.query;
    if (!clientCode) return res.status(400).json({ error: 'clientCode required.' });

    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    const userType = req.portalUser?.user_type || 'other';
    const lang     = req.query.lang || 'en';

    const [alerts] = await pool.execute(`
      SELECT id, title, alert_type, severity, product_name, ref_number, body_html,
             effective_date, target_types_json, attachment_name, status, view_count, created_at,
             translations_json
      FROM cp_safety_alerts
      WHERE client_id = ? AND status IN ('active', 'resolved')
        AND (publish_at IS NULL OR publish_at <= NOW())
      ORDER BY
        CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        effective_date DESC
    `, [client.id]);

    // Filter by user_type, then apply translations
    const filtered = alerts
      .filter(a => {
        const types = JSON.parse(a.target_types_json || '[]');
        return types.length === 0 || types.includes(userType);
      })
      .map(a => applyTranslation(a, lang, SAFETY_TRANS_FIELDS));

    // CPPM-114: for a signed-in doctor, which letters ask "I have read this" and
    // when they confirmed. Asked only of active high and critical letters.
    let acks = new Map();
    if (req.portalUser?.userId && filtered.length) {
      const [rows] = await pool.execute(
        `SELECT alert_id, acknowledged_at FROM cp_safety_acknowledgements WHERE client_id = ? AND portal_user_id = ?`,
        [client.id, req.portalUser.userId]);
      acks = new Map(rows.map(r => [r.alert_id, r.acknowledged_at]));
    }
    const withAck = filtered.map(a => ({
      ...a,
      needs_ack: !!req.portalUser?.userId && needsAck(a),
      acknowledged_at: acks.get(a.id) || null,
    }));

    res.json({ alerts: withAck });
  } catch (err) {
    log.error('portal.safety.error', { err, route: 'GET /', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/safety/:alertId?clientCode=xxx — single alert + increment view_count
router.get('/:alertId', authenticatePortal, async (req, res) => {
  try {
    const { clientCode } = req.query;
    if (!clientCode) return res.status(400).json({ error: 'clientCode required.' });

    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    const [[alert]] = await pool.execute(`
      SELECT * FROM cp_safety_alerts
      WHERE id = ? AND client_id = ? AND status IN ('active', 'resolved')
        AND (publish_at IS NULL OR publish_at <= NOW())
    `, [req.params.alertId, client.id]);
    if (!alert) return res.status(404).json({ error: 'Alert not found.' });

    // Verify user_type access
    const types    = JSON.parse(alert.target_types_json || '[]');
    const userType = req.portalUser?.user_type || 'other';
    if (types.length > 0 && !types.includes(userType)) return res.status(403).json({ error: 'Access denied.' });

    // MED-48: view_count increment removed from GET — use POST /:clientCode/alerts/:id/view instead

    res.json({ alert });
  } catch (err) {
    log.error('portal.safety.error', { err, route: 'GET /:alertId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/portal/safety/:clientCode/alerts/:id/view — increment view count (idempotent intent; called once per session by frontend)
router.post('/:clientCode/alerts/:id/view', authenticatePortal, async (req, res) => {
  try {
    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [req.params.clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    // CPPM-35: count the view only if the visitor accepted analytics.
    const counted = await hasAnalyticsConsent(req, client.id);
    if (counted) {
      await pool.execute('UPDATE cp_safety_alerts SET view_count = view_count + 1 WHERE id = ? AND client_id = ?', [req.params.id, client.id]);
    }
    res.json({ ok: true, counted });
  } catch (err) {
    log.error('portal.safety.error', { err, route: 'POST /:clientCode/alerts/:id/view', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/safety/:alertId/attachment?clientCode=xxx
router.get('/:alertId/attachment', authenticatePortal, async (req, res) => {
  try {
    const { clientCode } = req.query;
    if (!clientCode) return res.status(400).json({ error: 'clientCode required.' });

    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [clientCode]);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    const [[alert]] = await pool.execute('SELECT * FROM cp_safety_alerts WHERE id = ? AND client_id = ?', [req.params.alertId, client.id]);
    if (!alert || !alert.attachment_path) return res.status(404).json({ error: 'Attachment not found.' });

    const filePath = path.join(__dirname, '../../', alert.attachment_path);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on server.' });

    // MED-37: RFC 5987 dual encoding — legacy filename= for old clients, filename*= for RFC 5987 compliant clients
    const safeName    = (alert.attachment_name || 'attachment').replace(/["\\]/g, '_');
    const encodedName = encodeURIComponent(alert.attachment_name || 'attachment');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodedName}`);

    const ext = (alert.attachment_name || '').split('.').pop().toLowerCase();
    const CONTENT_TYPES = {
      pdf:  'application/pdf',
      doc:  'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      txt:  'text/plain',
    };
    res.setHeader('Content-Type', CONTENT_TYPES[ext] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    log.error('portal.safety.error', { err, route: 'GET /:alertId/attachment', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
