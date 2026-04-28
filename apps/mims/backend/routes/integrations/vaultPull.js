'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const { getVaultSession, runVQL } = require('../../services/vaultService');

router.get('/admin/vault/documents', authenticate, async (req, res) => {
  try {
    let orgId = req.user.orgId;
    if (req.user.role === 'superadmin') {
      orgId = parseInt(req.query.org_id, 10) || req.user.orgId;
    }

    const session = await getVaultSession(orgId);
    const vql = "SELECT id, name__v, type__v, subtype__v, status__v, version_modified_date__v FROM documents WHERE status__v = 'approved__v' LIMIT 50";
    const data = await runVQL(session, vql);

    return res.json({ documents: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/admin/vault/pull', authenticate, async (req, res) => {
  try {
    const { vault_doc_id, case_id } = req.body;
    const orgId = req.user.orgId;

    const session = await getVaultSession(orgId);
    const data = await runVQL(
      session,
      "SELECT id, name__v, type__v, subtype__v, status__v, expiration_date__v, effective_date__v FROM documents WHERE id = '" +
        req.body.vault_doc_id +
        "'"
    );

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(404).json({ error: 'Document not found in Vault' });
    }

    const doc = data[0];

    await pool.query(
      'INSERT INTO case_vault_references (case_id, org_id, vault_doc_id, vault_doc_name, vault_doc_type, vault_doc_status, pulled_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [case_id, orgId, doc.id, doc.name__v, doc.type__v, doc.status__v]
    );

    return res.json({
      message: 'Document linked to case',
      vault_doc_id: doc.id,
      case_id,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
