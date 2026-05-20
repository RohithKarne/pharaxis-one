'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { getVaultSession } = require('../../services/vaultService');

router.get(['/admin/platform/vault-config', '/superadmin/vault-config'], authenticate, requireRole('platform_admin'), async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT v.*, o.name as org_name
       FROM org_vault_config v
       JOIN organisations o ON v.org_id = o.id
       ORDER BY o.name`
    );

    return res.json({ configs: rows });
  } catch (_error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post(['/admin/platform/vault-config', '/superadmin/vault-config'], authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const {
      org_id,
      vault_domain,
      vault_username,
      vault_password,
      vault_api_version,
      poll_interval_hours,
      enabled,
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO org_vault_config
       (org_id, vault_domain, vault_username, vault_password, vault_api_version, poll_interval_hours, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        org_id,
        vault_domain,
        vault_username,
        vault_password,
        vault_api_version,
        poll_interval_hours,
        enabled,
      ]
    );

    return res.json({ id: result.insertId, message: 'Vault config created' });
  } catch (_error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put(['/admin/platform/vault-config/:id', '/superadmin/vault-config/:id'], authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      vault_domain,
      vault_username,
      vault_password,
      vault_api_version,
      poll_interval_hours,
      enabled,
    } = req.body;

    await pool.query(
      `UPDATE org_vault_config
       SET vault_domain = ?, vault_username = ?, vault_password = ?, vault_api_version = ?, poll_interval_hours = ?, enabled = ?
       WHERE id = ?`,
      [
        vault_domain,
        vault_username,
        vault_password,
        vault_api_version,
        poll_interval_hours,
        enabled,
        id,
      ]
    );

    return res.json({ message: 'Updated' });
  } catch (_error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete(['/admin/platform/vault-config/:id', '/superadmin/vault-config/:id'], authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query('DELETE FROM org_vault_config WHERE id = ?', [id]);

    return res.json({ message: 'Deleted' });
  } catch (_error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/admin/integrations/vault/test-connection', authenticate, async (req, res) => {
  try {
    const orgId = req.user.orgId;
    const [rows] = await pool.query(
      'SELECT id FROM org_vault_config WHERE org_id = ? LIMIT 1',
      [orgId]
    );

    if (!rows.length) {
      throw new Error('Vault configuration not found');
    }

    await getVaultSession(orgId);
    return res.json({ success: true, message: 'Vault connection successful' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

module.exports = router;
