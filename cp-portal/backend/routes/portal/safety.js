/**
 * Portal Safety Alerts — /api/portal/safety
 * F-13: Safety communications visible to portal users, always accessible
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { requirePortalAuth } = require('../../middleware/auth');
const path    = require('path');
const fs      = require('fs');

// GET /api/portal/safety?clientCode=xxx
router.get('/', requirePortalAuth, (req, res) => {
  const { clientCode } = req.query;
  if (!clientCode) return res.status(400).json({ error: 'clientCode required.' });

  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(clientCode);
  if (!client) return res.status(404).json({ error: 'Client not found.' });

  const userType = req.portalUser?.user_type || 'other';

  const alerts = db.prepare(`
    SELECT id, title, alert_type, severity, product_name, ref_number, body_html,
           effective_date, target_types_json, attachment_name, status, view_count, created_at
    FROM cp_safety_alerts
    WHERE client_id = ? AND status IN ('active', 'resolved')
    ORDER BY
      CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      effective_date DESC
  `).all(client.id);

  // Filter by user_type
  const filtered = alerts.filter(a => {
    const types = JSON.parse(a.target_types_json || '[]');
    return types.length === 0 || types.includes(userType);
  });

  res.json({ alerts: filtered });
});

// GET /api/portal/safety/:alertId?clientCode=xxx — single alert + increment view_count
router.get('/:alertId', requirePortalAuth, (req, res) => {
  const { clientCode } = req.query;
  if (!clientCode) return res.status(400).json({ error: 'clientCode required.' });

  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(clientCode);
  if (!client) return res.status(404).json({ error: 'Client not found.' });

  const alert = db.prepare(`
    SELECT * FROM cp_safety_alerts
    WHERE id = ? AND client_id = ? AND status IN ('active', 'resolved')
  `).get(req.params.alertId, client.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found.' });

  // Verify user_type access
  const types    = JSON.parse(alert.target_types_json || '[]');
  const userType = req.portalUser?.user_type || 'other';
  if (types.length > 0 && !types.includes(userType)) return res.status(403).json({ error: 'Access denied.' });

  db.prepare('UPDATE cp_safety_alerts SET view_count = view_count + 1 WHERE id = ?').run(alert.id);

  res.json({ alert });
});

// GET /api/portal/safety/:alertId/attachment?clientCode=xxx
router.get('/:alertId/attachment', requirePortalAuth, (req, res) => {
  const { clientCode } = req.query;
  if (!clientCode) return res.status(400).json({ error: 'clientCode required.' });

  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(clientCode);
  if (!client) return res.status(404).json({ error: 'Client not found.' });

  const alert = db.prepare('SELECT * FROM cp_safety_alerts WHERE id = ? AND client_id = ?').get(req.params.alertId, client.id);
  if (!alert || !alert.attachment_path) return res.status(404).json({ error: 'Attachment not found.' });

  const filePath = path.join(__dirname, '../../', alert.attachment_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on server.' });

  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(alert.attachment_name)}`);
  res.setHeader('Content-Type', 'application/pdf');
  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
