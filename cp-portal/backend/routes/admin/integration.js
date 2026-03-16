/**
 * Admin Integration — /api/admin/integration
 * MIMS or third-party system integration config + field mapping per client
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin } = require('../../middleware/auth');

// GET /api/admin/integration/:clientId
router.get('/:clientId', authenticateAdmin, (req, res) => {
  const config  = db.prepare('SELECT * FROM cp_integration_config WHERE client_id = ?').all(req.params.clientId);
  const mapping = db.prepare('SELECT * FROM cp_field_mapping WHERE client_id = ? ORDER BY form_type, cp_field ASC').all(req.params.clientId);
  res.json({ integrations: config, mappings: mapping });
});

// POST /api/admin/integration/:clientId — add integration
router.post('/:clientId', authenticateAdmin, (req, res) => {
  const { system_name, api_base_url, api_key, api_secret, auth_type, extra_headers } = req.body;
  if (!api_base_url) return res.status(400).json({ error: 'api_base_url is required.' });
  const info = db.prepare(`
    INSERT INTO cp_integration_config (client_id, system_name, api_base_url, api_key, api_secret, auth_type, extra_headers)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.clientId, system_name || 'MIMS', api_base_url, api_key || null, api_secret || null, auth_type || 'bearer', extra_headers ? JSON.stringify(extra_headers) : null);
  res.status(201).json({ id: info.lastInsertRowid, message: 'Integration configured.' });
});

// PATCH /api/admin/integration/:clientId/:integrationId
router.patch('/:clientId/:integrationId', authenticateAdmin, (req, res) => {
  const allowed = ['system_name', 'api_base_url', 'api_key', 'api_secret', 'auth_type', 'is_active'];
  const updates = [], params = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) { updates.push(`${key} = ?`); params.push(req.body[key]); }
  }
  if (req.body.extra_headers !== undefined) { updates.push('extra_headers = ?'); params.push(JSON.stringify(req.body.extra_headers)); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
  updates.push(`updated_at = datetime('now')`);
  params.push(req.params.integrationId, req.params.clientId);
  db.prepare(`UPDATE cp_integration_config SET ${updates.join(', ')} WHERE id=? AND client_id=?`).run(...params);
  res.json({ message: 'Integration updated.' });
});

// DELETE /api/admin/integration/:clientId/:integrationId
router.delete('/:clientId/:integrationId', authenticateAdmin, (req, res) => {
  db.prepare('UPDATE cp_integration_config SET is_active=0 WHERE id=? AND client_id=?').run(req.params.integrationId, req.params.clientId);
  res.json({ message: 'Integration deactivated.' });
});

// POST /api/admin/integration/:clientId/:integrationId/test — test connectivity
router.post('/:clientId/:integrationId/test', authenticateAdmin, async (req, res) => {
  const cfg = db.prepare('SELECT * FROM cp_integration_config WHERE id=? AND client_id=?').get(req.params.integrationId, req.params.clientId);
  if (!cfg) return res.status(404).json({ error: 'Integration not found.' });
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.auth_type === 'bearer' && cfg.api_key) headers['Authorization'] = `Bearer ${cfg.api_key}`;
    if (cfg.auth_type === 'apikey' && cfg.api_key) headers['X-API-Key'] = cfg.api_key;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(`${cfg.api_base_url}/api/health`, { headers, signal: controller.signal });
    clearTimeout(timeout);
    res.json({ success: r.ok, status: r.status });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── Field Mapping ─────────────────────────────────────────────

// GET /api/admin/integration/:clientId/mapping/:integrationId
router.get('/:clientId/mapping/:integrationId', authenticateAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM cp_field_mapping WHERE client_id=? AND integration_id=? ORDER BY form_type, cp_field').all(req.params.clientId, req.params.integrationId);
  res.json({ mappings: rows });
});

// POST /api/admin/integration/:clientId/mapping
router.post('/:clientId/mapping', authenticateAdmin, (req, res) => {
  const { integration_id, form_type, cp_field, target_field, transform, default_value } = req.body;
  if (!integration_id || !form_type || !cp_field || !target_field) return res.status(400).json({ error: 'integration_id, form_type, cp_field and target_field are required.' });
  const info = db.prepare(`
    INSERT OR REPLACE INTO cp_field_mapping (client_id, integration_id, form_type, cp_field, target_field, transform, default_value)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.clientId, integration_id, form_type, cp_field, target_field, transform || null, default_value || null);
  res.status(201).json({ id: info.lastInsertRowid, message: 'Mapping saved.' });
});

// DELETE /api/admin/integration/:clientId/mapping/:mappingId
router.delete('/:clientId/mapping/:mappingId', authenticateAdmin, (req, res) => {
  db.prepare('DELETE FROM cp_field_mapping WHERE id=? AND client_id=?').run(req.params.mappingId, req.params.clientId);
  res.json({ message: 'Mapping removed.' });
});

module.exports = router;
