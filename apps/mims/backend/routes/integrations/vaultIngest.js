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

// Files a Veeva Vault document into MIMS Content Management as a reference
// record: cm_documents has no org_id / title / category / content /
// vault_source_* columns, so the old insert always failed (T16). The record is
// linked through external_provider = 'veeva_vault' + external_document_id and
// belongs to the org through its folder, which the caller names (folder_id).
// Admin only — it had just sign-in.
router.post('/admin/vault/ingest', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const vaultDocId = normalizeVaultDocId(req.body?.vault_doc_id);
    if (!vaultDocId) {
      return res.status(400).json({ error: 'Invalid vault_doc_id format.' });
    }
    const orgId = req.user.orgId;
    const userId = req.user.userId;
    const folderId = parseInt(req.body?.folder_id, 10);
    if (!folderId) return res.status(400).json({ error: 'folder_id is required — the CM folder to file the document in.' });
    const [[folder]] = await pool.execute('SELECT id FROM cm_folders WHERE id = ? AND org_id = ? LIMIT 1', [folderId, orgId]);
    if (!folder) return res.status(404).json({ error: 'Folder not found for this organisation.' });

    const session = await getVaultSession(orgId);
    const vql = `SELECT id, name__v, type__v, subtype__v, classification__v, status__v, expiration_date__v, effective_date__v FROM documents WHERE id = '${vaultDocId}'`;
    const data = await runVQL(
      session,
      vql
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

    // H-10: idempotent ingest — if this Vault document was already ingested for this org,
    // return the existing record instead of inserting a duplicate controlled-content row.
    const [[alreadyIngested]] = await pool.execute(
      `SELECT d.id FROM cm_documents d JOIN cm_folders f ON f.id = d.folder_id
        WHERE f.org_id = ? AND d.external_provider = 'veeva_vault' AND d.external_document_id = ? LIMIT 1`,
      [orgId, doc.id]
    );
    if (alreadyIngested) {
      return res.json({
        message: 'Document already ingested into MIMS CM',
        cm_document_id: alreadyIngested.id,
        vault_doc_id: doc.id,
        mims_category: mimsCategory,
        idempotent: true,
      });
    }

    // Same document-number scheme as routes/cm/documents.js.
    const [[{ maxId }]] = await pool.execute('SELECT MAX(id) AS maxId FROM cm_documents');
    const docNumber = `DOC-${String((Number(maxId || 0) + 1)).padStart(5, '0')}`;
    const [result] = await pool.execute(
      `INSERT INTO cm_documents
         (doc_id, folder_id, name, document_category, content_html, authoring_source, status,
          expiry_date, external_provider, external_document_id, created_by)
       VALUES (?, ?, ?, ?, ?, 'internal', 'Draft', ?, 'veeva_vault', ?, ?)`,
      [
        docNumber,
        folderId,
        String(doc.name__v || doc.id).slice(0, 500),
        mimsCategory,
        `Ingested from Veeva Vault document ${doc.id} (status in Vault: ${doc.status__v || 'unknown'}).`,
        doc.expiration_date__v || null,
        doc.id,
        userId,
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
