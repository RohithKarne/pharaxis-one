/**
 * Admin Integration — /api/admin/integration
 * MIMS or third-party system integration config + field mapping per client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { assertSafeOutboundUrl, safeFetch } = require('../../utils/networkGuard');
const { encryptSecret } = require('../../utils/secretCrypto');
const { getAuthHeaders, invalidateAuth } = require('../../services/mimsAuth');
const log = require('../../utils/logger');

// Mask a secret field — show only last 4 chars with **** prefix
function maskSecret(value) {
  if (!value) return value;
  return '****' + String(value).slice(-4);
}

// GET /api/admin/integration/:clientId
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [config]  = await pool.execute('SELECT * FROM cp_integration_config WHERE client_id = ?', [req.params.clientId]);
    const masked = config.map(c => ({
      ...c,
      api_key:    maskSecret(c.api_key),
      api_secret: maskSecret(c.api_secret),
    }));
    const [mapping] = await pool.execute('SELECT * FROM cp_field_mapping WHERE client_id = ? ORDER BY form_type, cp_field ASC', [req.params.clientId]);
    res.json({ integrations: masked, mappings: mapping });
  } catch (err) {
    log.error('admin.integration.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/integration/:clientId — add integration
router.post('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { system_name, api_base_url, api_key, api_secret, auth_type, extra_headers, mims_case_url_base } = req.body;
    if (!api_base_url) return res.status(400).json({ error: 'api_base_url is required.' });
    const [result] = await pool.execute(
      `INSERT INTO cp_integration_config (client_id, system_name, api_base_url, api_key, api_secret, auth_type, extra_headers, mims_case_url_base)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.clientId, system_name || 'MIMS', api_base_url, encryptSecret(api_key ?? null), encryptSecret(api_secret ?? null), auth_type || 'bearer', extra_headers ? JSON.stringify(extra_headers) : null, mims_case_url_base || null]
    );
    res.status(201).json({ id: result.insertId, message: 'Integration configured.' });
  } catch (err) {
    log.error('admin.integration.error', { err, route: 'POST /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/admin/integration/:clientId/:integrationId
router.patch('/:clientId/:integrationId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const allowed = ['system_name', 'api_base_url', 'api_key', 'api_secret', 'auth_type', 'is_active', 'mims_case_url_base'];
    const updates = [], params = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        // SEC-02: skip secret fields if the frontend is echoing back a masked display value
        if ((key === 'api_key' || key === 'api_secret') && String(req.body[key]).startsWith('****')) continue;
        const isSecret = (key === 'api_key' || key === 'api_secret');
        updates.push(`${key} = ?`); params.push(isSecret ? encryptSecret(req.body[key]) : req.body[key]);
      }
    }
    if (req.body.extra_headers !== undefined) { updates.push('extra_headers = ?'); params.push(JSON.stringify(req.body.extra_headers)); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
    updates.push(`updated_at = NOW()`);
    params.push(req.params.integrationId, req.params.clientId);
    await pool.execute(`UPDATE cp_integration_config SET ${updates.join(', ')} WHERE id=? AND client_id=?`, params);
    res.json({ message: 'Integration updated.' });
  } catch (err) {
    log.error('admin.integration.error', { err, route: 'PATCH /:clientId/:integrationId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/integration/:clientId/:integrationId
router.delete('/:clientId/:integrationId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    await pool.execute('UPDATE cp_integration_config SET is_active=0 WHERE id=? AND client_id=?', [req.params.integrationId, req.params.clientId]);
    res.json({ message: 'Integration deactivated.' });
  } catch (err) {
    log.error('admin.integration.error', { err, route: 'DELETE /:clientId/:integrationId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/integration/:clientId/:integrationId/test — test connectivity
router.post('/:clientId/:integrationId/test', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [[cfg]] = await pool.execute('SELECT * FROM cp_integration_config WHERE id=? AND client_id=?', [req.params.integrationId, req.params.clientId]);
    if (!cfg) return res.status(404).json({ error: 'Integration not found.' });
    try {
      const safeUrl = await assertSafeOutboundUrl(cfg.api_base_url);
      // NEW-D: for auth_type 'oauth' this mints a fresh token from the stored client
      // credentials, so the Test button also proves the token exchange works.
      invalidateAuth(cfg.id);
      const headers = { 'Content-Type': 'application/json', ...(await getAuthHeaders(cfg)) };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      // O1: authenticated check — hit the real intake endpoint so a valid host with
      // a bad/missing token or wrong scope FAILS the test (was only pinging /api/health).
      const r = await safeFetch(new URL('/api/v1/cases', safeUrl).toString(), { headers, signal: controller.signal });
      clearTimeout(timeout);
      let message;
      if (r.ok) message = 'Authenticated OK — token valid with case access.';
      else if (r.status === 401) message = 'Unauthorized — token missing or invalid.';
      else if (r.status === 403) message = 'Forbidden — token lacks the cases scope.';
      else if (r.status === 404) message = 'Host reached, but /api/v1/cases not found — is the API platform enabled?';
      else message = `Unexpected response (HTTP ${r.status}).`;
      const syncStatus = r.ok ? 'success' : 'failure';
      await pool.execute(
        `UPDATE cp_integration_config SET last_sync_at = NOW(), last_sync_status = ?, last_sync_error = ? WHERE id = ?`,
        [syncStatus, r.ok ? null : message, cfg.id]
      );
      res.json({ success: r.ok, status: r.status, message });
    } catch (fetchErr) {
      await pool.execute(
        `UPDATE cp_integration_config SET last_sync_at = NOW(), last_sync_status = 'failure', last_sync_error = ? WHERE id = ?`,
        [String(fetchErr.message).slice(0, 500), cfg.id]
      );
      res.json({ success: false, error: fetchErr.message });
    }
  } catch (err) {
    log.error('admin.integration.error', { err, route: 'POST /:clientId/:integrationId/test', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── Field Mapping ─────────────────────────────────────────────

// GET /api/admin/integration/:clientId/mapping/:integrationId
router.get('/:clientId/mapping/:integrationId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM cp_field_mapping WHERE client_id=? AND integration_id=? ORDER BY form_type, cp_field', [req.params.clientId, req.params.integrationId]);
    res.json({ mappings: rows });
  } catch (err) {
    log.error('admin.integration.error', { err, route: 'GET /:clientId/mapping/:integrationId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/integration/:clientId/mapping
router.post('/:clientId/mapping', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { integration_id, form_type, cp_field, target_field, transform, default_value } = req.body;
    if (!integration_id || !form_type || !cp_field || !target_field) return res.status(400).json({ error: 'integration_id, form_type, cp_field and target_field are required.' });
    const [result] = await pool.execute(
      `REPLACE INTO cp_field_mapping (client_id, integration_id, form_type, cp_field, target_field, transform, default_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.clientId, integration_id, form_type, cp_field, target_field, transform ?? null, default_value ?? null]
    );
    res.status(201).json({ id: result.insertId, message: 'Mapping saved.' });
  } catch (err) {
    log.error('admin.integration.error', { err, route: 'POST /:clientId/mapping', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/integration/:clientId/mapping/:mappingId
router.delete('/:clientId/mapping/:mappingId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    await pool.execute('DELETE FROM cp_field_mapping WHERE id=? AND client_id=?', [req.params.mappingId, req.params.clientId]);
    res.json({ message: 'Mapping removed.' });
  } catch (err) {
    log.error('admin.integration.error', { err, route: 'DELETE /:clientId/mapping/:mappingId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
