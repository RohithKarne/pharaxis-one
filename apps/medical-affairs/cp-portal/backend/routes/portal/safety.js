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

    res.json({ alerts: filtered });
  } catch (err) {
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
    `, [req.params.alertId, client.id]);
    if (!alert) return res.status(404).json({ error: 'Alert not found.' });

    // Verify user_type access
    const types    = JSON.parse(alert.target_types_json || '[]');
    const userType = req.portalUser?.user_type || 'other';
    if (types.length > 0 && !types.includes(userType)) return res.status(403).json({ error: 'Access denied.' });

    // MED-48: view_count increment removed from GET — use POST /:clientCode/alerts/:id/view instead

    res.json({ alert });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/portal/safety/:clientCode/alerts/:id/view — increment view count (idempotent intent; called once per session by frontend)
router.post('/:clientCode/alerts/:id/view', authenticatePortal, async (req, res) => {
  try {
    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [req.params.clientCode]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    await pool.execute('UPDATE cp_safety_alerts SET view_count = view_count + 1 WHERE id = ? AND client_id = ?', [req.params.id, client.id]);
    res.json({ ok: true });
  } catch (err) {
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
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
