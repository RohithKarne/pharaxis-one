'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const { getVaultSession, runVQL } = require('../../services/vaultService');

router.post('/admin/vault/ingest', authenticate, async (req, res) => {
  try {
    const { vault_doc_id } = req.body;
    const orgId = req.user.orgId;
    const userId = req.user.userId;

    const session = await getVaultSession(orgId);
    const data = await runVQL(
      session,
      "SELECT id, name__v, type__v, subtype__v, classification__v, status__v, expiration_date__v, effective_date__v FROM documents WHERE id = '" +
        vault_doc_id +
        "'"
    );

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(404).json({ error: 'Document not found in Vault' });
    }

    const doc = data[0];

    const [mapRow] = await pool.execute(
      'SELECT mims_cm_category FROM vault_document_type_map WHERE org_id = ? AND vault_type = ? LIMIT 1',
      [orgId, doc.type__v]
    );
    const mimsCategory = mapRow[0]?.mims_cm_category || doc.type__v;

    const [result] = await pool.execute(
      "INSERT INTO cm_documents (org_id, title, category, content, status, expiry_date, created_by, vault_source_id, vault_source_status) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)",
      [
        orgId,
        doc.name__v,
        mimsCategory,
        'Ingested from Vault: ' + doc.id,
        doc.expiration_date__v || null,
        userId,
        doc.id,
        doc.status__v,
      ]
    );

    return res.json({
      message: 'Document ingested into MIMS CM',
      cm_document_id: result.insertId,
      vault_doc_id: doc.id,
      mims_category: mimsCategory,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
