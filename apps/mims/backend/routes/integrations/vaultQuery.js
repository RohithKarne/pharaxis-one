'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { getVaultSession, runVQL } = require('../../services/vaultService');

router.get('/superadmin/vault-query-params/:org_id', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM org_vault_config WHERE org_id = ? LIMIT 1', [req.params.org_id]);
    return res.json({ params: rows[0] || null });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/superadmin/vault-query-params/:org_id', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { vault_type, vault_subtype, vault_classification, mims_cm_category } = req.body;

    const [result] = await pool.query(
      'INSERT INTO vault_document_type_map (org_id, vault_type, vault_subtype, vault_classification, mims_cm_category) VALUES (?, ?, ?, ?, ?)',
      [req.params.org_id, vault_type, vault_subtype, vault_classification, mims_cm_category]
    );

    return res.json({ id: result.insertId, message: 'Query mapping created' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/superadmin/vault-query-params/:id', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM vault_document_type_map WHERE id = ?', [req.params.id]);
    return res.json({ message: 'Deleted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/admin/vault/search', authenticate, async (req, res) => {
  try {
    if (!req.query.q) {
      return res.status(500).json({ error: 'q is required' });
    }

    let orgId = req.user.orgId;
    if (req.user.role === 'superadmin') {
      orgId = parseInt(req.query.org_id, 10) || req.user.orgId;
    }

    const session = await getVaultSession(orgId);
    const data = await runVQL(session, req.query.q);

    return res.json({ results: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
