'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { getVaultSession, runVQL } = require('../../services/vaultService');

function normalizeVaultDocId(rawValue) {
  const value = String(rawValue || '').trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value)) return null;
  return value;
}

function normalizeVaultType(rawValue) {
  const value = String(rawValue || '').trim();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value)) return null;
  return value;
}

function parseLimit(rawValue, fallback = 50) {
  const num = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(1, Math.min(200, num));
}

function buildAllowedVaultQuery(queryKey, queryParams = {}) {
  switch (queryKey) {
    case 'approved_documents': {
      const limit = parseLimit(queryParams.limit, 50);
      return `SELECT id, name__v, type__v, subtype__v, status__v, version_modified_date__v FROM documents WHERE status__v = 'approved__v' LIMIT ${limit}`;
    }
    case 'document_by_id': {
      const vaultDocId = normalizeVaultDocId(queryParams.vault_doc_id);
      if (!vaultDocId) throw new Error('Invalid vault_doc_id format.');
      return `SELECT id, name__v, type__v, subtype__v, classification__v, status__v, expiration_date__v, effective_date__v FROM documents WHERE id = '${vaultDocId}' LIMIT 1`;
    }
    case 'documents_by_type': {
      const vaultType = normalizeVaultType(queryParams.vault_type);
      if (!vaultType) throw new Error('Invalid vault_type format.');
      const limit = parseLimit(queryParams.limit, 50);
      return `SELECT id, name__v, type__v, subtype__v, status__v, version_modified_date__v FROM documents WHERE type__v = '${vaultType}' LIMIT ${limit}`;
    }
    default:
      throw new Error('Unsupported query_key.');
  }
}

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

router.get('/admin/vault/search', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const queryKey = String(req.query.query_key || '').trim();
    if (!queryKey) {
      return res.status(400).json({ error: 'query_key is required.' });
    }

    let orgId = req.user.orgId;
    if (req.user.role === 'superadmin') {
      orgId = parseInt(req.query.org_id, 10) || req.user.orgId;
    }
    if (!orgId) {
      return res.status(403).json({ error: 'No active organisation. Please contact your administrator.' });
    }

    let vql;
    try {
      vql = buildAllowedVaultQuery(queryKey, req.query);
    } catch (validationErr) {
      return res.status(400).json({ error: validationErr.message || 'Invalid query parameters.' });
    }

    const session = await getVaultSession(orgId);
    const data = await runVQL(session, vql);

    return res.json({ query_key: queryKey, results: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
