'use strict';

const express = require('express');
const { authenticate, requireRole } = require('../../middleware/auth');
const pool = require('../../database/db');

const router = express.Router();

// Platform Admin routes
router.get(['/admin/platform/integrations', '/admin/platform/integrations'], authenticate, requireRole("platform_admin"), async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT oi.*, o.name as org_name
       FROM org_integrations oi
       JOIN organisations o ON oi.org_id = o.id
       ORDER BY o.name, oi.integration_type`
    );

    const integrations = rows.map((row) => {
      const { api_key, ...safeRow } = row;
      return {
        ...safeRow,
        api_key_set: !!String(api_key || '').trim(),
        api_key_masked: api_key ? `****${String(api_key).slice(-4)}` : null,
      };
    });
    return res.json({ integrations });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to fetch integrations' });
  }
});

router.post(['/admin/platform/integrations', '/admin/platform/integrations'], authenticate, requireRole("platform_admin"), async (req, res) => {
  try {
    const {
      org_id,
      integration_type,
      endpoint_url,
      api_key,
      enabled,
      event_triggers,
      org_override_allowed,
    } = req.body;

    const eventTriggersValue = Array.isArray(event_triggers)
      ? JSON.stringify(event_triggers)
      : event_triggers;

    const [result] = await pool.query(
      `INSERT INTO org_integrations
       (org_id, integration_type, endpoint_url, api_key, enabled, event_triggers, org_override_allowed)
       VALUES (?,?,?,?,?,?,?)`,
      [
        org_id,
        integration_type,
        endpoint_url,
        api_key,
        enabled,
        eventTriggersValue,
        org_override_allowed,
      ]
    );

    return res.json({ id: result.insertId, message: 'Integration created' });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to create integration' });
  }
});

router.put(['/admin/platform/integrations/:id', '/admin/platform/integrations/:id'], authenticate, requireRole("platform_admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const { endpoint_url, api_key, enabled, event_triggers, org_override_allowed } = req.body;
    const [currentRows] = await pool.query(
      'SELECT endpoint_url, api_key, enabled, event_triggers, org_override_allowed FROM org_integrations WHERE id = ? LIMIT 1',
      [id]
    );
    if (!currentRows.length) {
      return res.status(404).json({ error: 'Integration not found' });
    }
    const currentIntegration = currentRows[0];
    const currentApiKey = currentIntegration.api_key;
    const nextApiKey = api_key === undefined || api_key === null || String(api_key).trim() === ''
      ? currentApiKey
      : api_key;

    const requestedEventTriggers = Array.isArray(event_triggers)
      ? JSON.stringify(event_triggers)
      : event_triggers;
    const eventTriggersValue = requestedEventTriggers === undefined
      ? currentIntegration.event_triggers
      : requestedEventTriggers;
    const nextEndpointUrl = endpoint_url === undefined ? currentIntegration.endpoint_url : endpoint_url;
    const nextEnabled = enabled === undefined ? currentIntegration.enabled : enabled;
    const nextOrgOverrideAllowed = org_override_allowed === undefined
      ? currentIntegration.org_override_allowed
      : org_override_allowed;

    await pool.query(
      `UPDATE org_integrations
       SET endpoint_url = ?, api_key = ?, enabled = ?, event_triggers = ?, org_override_allowed = ?, updated_at = NOW()
       WHERE id = ?`,
      [nextEndpointUrl, nextApiKey, nextEnabled, eventTriggersValue, nextOrgOverrideAllowed, id]
    );

    return res.json({ message: 'Integration updated' });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to update integration' });
  }
});

router.delete(['/admin/platform/integrations/:id', '/admin/platform/integrations/:id'], authenticate, requireRole("platform_admin"), async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query('DELETE FROM org_integrations WHERE id = ?', [id]);

    return res.json({ message: 'Integration deleted' });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to delete integration' });
  }
});

// Admin Console routes
router.get('/admin/integrations', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const orgId = req.user.orgId;
    if (orgId == null) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const [rows] = await pool.query(
      `SELECT id, integration_type, enabled, event_triggers, last_sync_at
       FROM org_integrations
       WHERE org_id = ?
       ORDER BY integration_type`,
      [orgId]
    );

    return res.json({ integrations: rows });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to fetch integrations' });
  }
});

router.put('/admin/integrations/:id/toggle', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const orgId = req.user.orgId;
    if (orgId == null) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const { enabled } = req.body;

    const [rows] = await pool.query(
      'SELECT org_override_allowed, org_id FROM org_integrations WHERE id = ?',
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const integration = rows[0];

    if (Number(integration.org_id) !== Number(orgId)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (Number(integration.org_override_allowed) === 0) {
      return res.status(403).json({ error: 'Override not permitted for this integration' });
    }

    await pool.query(
      'UPDATE org_integrations SET enabled = ?, updated_at = NOW() WHERE id = ?',
      [enabled, id]
    );

    return res.json({ message: 'Integration updated' });
  } catch (_error) {
    return res.status(500).json({ error: 'Failed to update integration' });
  }
});

// Admin — get config for a specific integration type
router.get('/admin/integrations/:type/config', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const orgId = req.user.orgId;
    if (orgId == null) return res.status(403).json({ error: 'Forbidden' });
    const { type } = req.params;
    const [rows] = await pool.query(
      'SELECT config, enabled FROM org_integrations WHERE org_id = ? AND integration_type = ?',
      [orgId, type]
    );
    if (!rows.length) return res.json({ config: null, enabled: false });
    const row = rows[0];
    return res.json({
      config: row.config ? (typeof row.config === 'string' ? JSON.parse(row.config) : row.config) : null,
      enabled: !!row.enabled,
    });
  } catch (_e) {
    return res.status(500).json({ error: 'Failed to fetch integration config' });
  }
});

// Admin — save config for a specific integration type
router.put('/admin/integrations/:type/config', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const orgId = req.user.orgId;
    if (orgId == null) return res.status(403).json({ error: 'Forbidden' });
    const { type } = req.params;
    const { config } = req.body;
    await pool.query(
      `INSERT INTO org_integrations (org_id, integration_type, config, enabled)
       VALUES (?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE config = VALUES(config), updated_at = NOW()`,
      [orgId, type, JSON.stringify(config)]
    );
    return res.json({ message: 'Config saved' });
  } catch (_e) {
    return res.status(500).json({ error: 'Failed to save integration config' });
  }
});

module.exports = router;
