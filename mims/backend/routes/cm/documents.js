'use strict';

/**
 * cm/documents.js — Content Management Documents API
 * Full document lifecycle: Draft → CheckedOut → Pending → Under Review → Approved → Published → Archived
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const bcrypt = require('bcrypt');

const multer = require('multer');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../../storage/cm_documents')),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

async function addVersionHistory(entityType, entityId, version, status, notes, authorId) {
  try {
    await pool.execute(
      'INSERT INTO cm_version_history (entity_type, entity_id, version, status, notes, author_id) VALUES (?, ?, ?, ?, ?, ?)',
      [entityType, entityId, version, status, notes || null, authorId]
    );
  } catch (_) {}
}

async function generateDocId(conn) {
  const [[{ maxId }]] = await conn.execute('SELECT MAX(id) AS maxId FROM cm_documents');
  const nextNum = ((maxId || 0) + 1).toString().padStart(5, '0');
  return `DOC-${nextNum}`;
}

function isSuperadmin(req) {
  return req.user.role === 'superadmin';
}

async function getScopedFolder(req, folderId) {
  const [rows] = await pool.execute(
    isSuperadmin(req)
      ? 'SELECT * FROM cm_folders WHERE id = ?'
      : 'SELECT * FROM cm_folders WHERE id = ? AND org_id = ?',
    isSuperadmin(req) ? [folderId] : [folderId, req.user.orgId]
  );
  return rows[0] || null;
}

async function getScopedDocument(req, documentId) {
  const [rows] = await pool.execute(
    isSuperadmin(req)
      ? `SELECT d.*, f.org_id AS folder_org_id
         FROM cm_documents d
         INNER JOIN cm_folders f ON d.folder_id = f.id
         WHERE d.id = ?`
      : `SELECT d.*, f.org_id AS folder_org_id
         FROM cm_documents d
         INNER JOIN cm_folders f ON d.folder_id = f.id
         WHERE d.id = ? AND f.org_id = ?`,
    isSuperadmin(req) ? [documentId] : [documentId, req.user.orgId]
  );
  return rows[0] || null;
}

// GET /api/cm/documents — list with filters and pagination
router.get('/documents', authenticate, async (req, res) => {
  try {
    const { status, folder_id, doc_type, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `
      SELECT d.*, f.name AS folder_name, u.name AS created_by_name, cu.name AS checked_out_by_name
      FROM cm_documents d
      LEFT JOIN cm_folders f ON d.folder_id = f.id
      LEFT JOIN users u ON d.created_by = u.id
      LEFT JOIN users cu ON d.checked_out_by = cu.id
      WHERE 1=1
    `;
    const params = [];

    if (!isSuperadmin(req)) {
      query += ' AND f.org_id = ?';
      params.push(req.user.orgId);
    }

    if (status) {
      query += ' AND d.status = ?';
      params.push(status);
    }
    if (folder_id) {
      query += ' AND d.folder_id = ?';
      params.push(folder_id);
    }
    if (doc_type) {
      query += ' AND d.doc_type = ?';
      params.push(doc_type);
    }
    if (search) {
      query += ' AND (d.name LIKE ? OR d.doc_id LIKE ? OR d.search_tags LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countQuery = query.replace(
      'SELECT d.*, f.name AS folder_name, u.name AS created_by_name, cu.name AS checked_out_by_name',
      'SELECT COUNT(*) AS total'
    );
    const [[{ total }]] = await pool.execute(countQuery, params);

    query += ` ORDER BY d.updated_at DESC LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;

    const [documents] = await pool.execute(query, params);
    res.json({ documents, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /cm/documents error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/documents — create document (status=Draft, auto-generate doc_id)
router.post('/documents', authenticate, upload.single('file'), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const docId = await generateDocId(conn);
    const {
      folder_id, doc_type, name, content_html, expiry_date, activation_date,
      language, is_product_specific, is_site_specific, search_tags, usage_instructions, attributes,
    } = req.body;

    if (!folder_id || !name) {
      await conn.rollback();
      return res.status(400).json({ error: 'folder_id and name are required.' });
    }

    const scopedFolder = await getScopedFolder(req, folder_id);
    if (!scopedFolder) {
      await conn.rollback();
      return res.status(404).json({ error: 'Folder not found for active organisation.' });
    }

    const filePath = req.file ? req.file.path : null;
    const fileName = req.file ? req.file.originalname : null;
    const fileSize = req.file ? req.file.size : null;
    const fileMime = req.file ? req.file.mimetype : null;

    const [result] = await conn.execute(
      `INSERT INTO cm_documents
         (doc_id, folder_id, doc_type, name, content_html, file_path, file_name, file_size, file_mime,
          status, version_major, version_minor, expiry_date, activation_date, language,
          is_product_specific, is_site_specific, search_tags, usage_instructions, attributes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', 1, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docId, folder_id, doc_type || 'SRD', name.trim(), content_html || null,
        filePath, fileName, fileSize, fileMime,
        expiry_date || null, activation_date || null, language || 'en',
        is_product_specific ? 1 : 0, is_site_specific ? 1 : 0,
        search_tags || null, usage_instructions || null,
        attributes ? JSON.stringify(attributes) : null,
        req.user.userId,
      ]
    );

    await conn.commit();
    await audit(req.user.userId, req.user.email, 'CREATE', 'cm_document', result.insertId, { doc_id: docId, name, folder_id });
    const [[created]] = await pool.execute('SELECT * FROM cm_documents WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Document created.', id: result.insertId, document: created });
  } catch (err) {
    await conn.rollback();
    console.error('POST /cm/documents error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    conn.release();
  }
});

// GET /api/cm/documents/:id — get document with version history
router.get('/documents/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const [[doc]] = await pool.execute(
      isSuperadmin(req)
        ? `SELECT d.*, f.name AS folder_name, u.name AS created_by_name, cu.name AS checked_out_by_name
           FROM cm_documents d
           LEFT JOIN cm_folders f ON d.folder_id = f.id
           LEFT JOIN users u ON d.created_by = u.id
           LEFT JOIN users cu ON d.checked_out_by = cu.id
           WHERE d.id = ?`
        : `SELECT d.*, f.name AS folder_name, u.name AS created_by_name, cu.name AS checked_out_by_name
           FROM cm_documents d
           LEFT JOIN cm_folders f ON d.folder_id = f.id
           LEFT JOIN users u ON d.created_by = u.id
           LEFT JOIN users cu ON d.checked_out_by = cu.id
           WHERE d.id = ? AND f.org_id = ?`,
      isSuperadmin(req) ? [id] : [id, req.user.orgId]
    );
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    const [versions] = await pool.execute(
      `SELECT vh.*, u.name AS author_name
       FROM cm_version_history vh
       LEFT JOIN users u ON vh.author_id = u.id
       WHERE vh.entity_type = 'document' AND vh.entity_id = ?
       ORDER BY vh.created_at DESC`,
      [id]
    );

    res.json({ document: doc, versions });
  } catch (err) {
    console.error('GET /cm/documents/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/cm/documents/:id — update (only Draft or CheckedOut-by-me)
router.put('/documents/:id', authenticate, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await getScopedDocument(req, id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    if (doc.status !== 'Draft' && !(doc.status === 'CheckedOut' && doc.checked_out_by === req.user.userId)) {
      return res.status(403).json({ error: 'Document can only be updated when in Draft status or checked out by you.' });
    }

    const {
      folder_id, doc_type, name, content_html, expiry_date, activation_date,
      language, is_product_specific, is_site_specific, search_tags, usage_instructions, attributes,
    } = req.body;

    const filePath = req.file ? req.file.path : doc.file_path;
    const fileName = req.file ? req.file.originalname : doc.file_name;
    const fileSize = req.file ? req.file.size : doc.file_size;
    const fileMime = req.file ? req.file.mimetype : doc.file_mime;

    await pool.execute(
      `UPDATE cm_documents SET
         folder_id = ?, doc_type = ?, name = ?, content_html = ?,
         file_path = ?, file_name = ?, file_size = ?, file_mime = ?,
         expiry_date = ?, activation_date = ?, language = ?,
         is_product_specific = ?, is_site_specific = ?,
         search_tags = ?, usage_instructions = ?, attributes = ?,
         updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        folder_id || doc.folder_id, doc_type || doc.doc_type, name || doc.name, content_html !== undefined ? content_html : doc.content_html,
        filePath, fileName, fileSize, fileMime,
        expiry_date || doc.expiry_date || null, activation_date || doc.activation_date || null, language || doc.language,
        is_product_specific !== undefined ? (is_product_specific ? 1 : 0) : doc.is_product_specific,
        is_site_specific !== undefined ? (is_site_specific ? 1 : 0) : doc.is_site_specific,
        search_tags || doc.search_tags, usage_instructions || doc.usage_instructions,
        attributes ? JSON.stringify(attributes) : doc.attributes,
        req.user.userId, id,
      ]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'cm_document', Number(id), { name: name || doc.name });
    res.json({ message: 'Document updated.' });
  } catch (err) {
    console.error('PUT /cm/documents/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/documents/:id/checkout — check out document
router.post('/documents/:id/checkout', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await getScopedDocument(req, id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    if (doc.status !== 'Draft') return res.status(400).json({ error: 'Only Draft documents can be checked out.' });
    if (doc.checked_out_by) return res.status(400).json({ error: 'Document is already checked out.' });

    await pool.execute(
      "UPDATE cm_documents SET status = 'CheckedOut', checked_out_by = ?, checked_out_at = NOW(), updated_at = NOW() WHERE id = ?",
      [req.user.userId, id]
    );
    await audit(req.user.userId, req.user.email, 'CHECKOUT', 'cm_document', Number(id), { doc_id: doc.doc_id });
    res.json({ message: 'Document checked out.' });
  } catch (err) {
    console.error('POST /cm/documents/:id/checkout error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/documents/:id/checkin — check in (status=Pending, record version)
router.post('/documents/:id/checkin', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const doc = await getScopedDocument(req, id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    if (doc.status !== 'CheckedOut') return res.status(400).json({ error: 'Document is not checked out.' });
    if (doc.checked_out_by !== req.user.userId) {
      return res.status(403).json({ error: 'Only the user who checked out this document can check it in.' });
    }

    const newMinor = doc.version_minor + 1;
    const versionStr = `${doc.version_major}.${newMinor}`;

    await pool.execute(
      `UPDATE cm_documents SET
         status = 'Pending', checked_out_by = NULL, checked_out_at = NULL,
         version_minor = ?, updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [newMinor, req.user.userId, id]
    );

    await addVersionHistory('document', Number(id), versionStr, 'Pending', notes || 'Checked in', req.user.userId);
    await audit(req.user.userId, req.user.email, 'CHECKIN', 'cm_document', Number(id), { doc_id: doc.doc_id, version: versionStr });
    res.json({ message: 'Document checked in.', version: versionStr });
  } catch (err) {
    console.error('POST /cm/documents/:id/checkin error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/documents/:id/initiate-review — create cm_review
router.post('/documents/:id/initiate-review', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, planned_end_date, reviewer_ids, is_non_amendable, description } = req.body;
    if (!title || !planned_end_date) {
      return res.status(400).json({ error: 'title and planned_end_date are required.' });
    }

    const doc = await getScopedDocument(req, id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    if (!['Pending', 'Draft'].includes(doc.status)) {
      return res.status(400).json({ error: 'Document must be in Pending or Draft status to initiate a review.' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [reviewResult] = await conn.execute(
        `INSERT INTO cm_reviews (doc_id, doc_type, title, planned_end_date, is_non_amendable, description, status, created_by)
         VALUES (?, 'document', ?, ?, ?, ?, 'Open', ?)`,
        [id, title, planned_end_date, is_non_amendable ? 1 : 0, description || null, req.user.userId]
      );

      if (Array.isArray(reviewer_ids) && reviewer_ids.length > 0) {
        for (const uid of reviewer_ids) {
          await conn.execute(
            'INSERT IGNORE INTO cm_reviewers (review_id, user_id, status) VALUES (?, ?, ?)',
            [reviewResult.insertId, uid, 'Ongoing']
          );
        }
      }

      await conn.execute(
        "UPDATE cm_documents SET status = 'Under Review', updated_at = NOW() WHERE id = ?",
        [id]
      );

      await conn.commit();
      await audit(req.user.userId, req.user.email, 'INITIATE_REVIEW', 'cm_document', Number(id), { review_id: reviewResult.insertId, title });
      res.status(201).json({ message: 'Review initiated.', review_id: reviewResult.insertId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('POST /cm/documents/:id/initiate-review error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/documents/:id/approve — approve (requires password + reason)
router.post('/documents/:id/approve', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { password, reason } = req.body;
    if (!password || !reason) return res.status(400).json({ error: 'password and reason are required.' });

    const doc = await getScopedDocument(req, id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    if (!['Pending', 'Under Review'].includes(doc.status)) {
      return res.status(400).json({ error: 'Document must be in Pending or Under Review status to approve.' });
    }

    const [[user]] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.userId]);
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Incorrect password. Electronic signature rejected.' });

    const versionStr = `${doc.version_major}.${doc.version_minor}`;
    await pool.execute(
      "UPDATE cm_documents SET status = 'Approved', updated_by = ?, updated_at = NOW() WHERE id = ?",
      [req.user.userId, id]
    );

    await addVersionHistory('document', Number(id), versionStr, 'Approved', reason, req.user.userId);
    await audit(req.user.userId, req.user.email, 'APPROVE', 'cm_document', Number(id), { doc_id: doc.doc_id, reason, version: versionStr });
    res.json({ message: 'Document approved.' });
  } catch (err) {
    console.error('POST /cm/documents/:id/approve error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/documents/:id/publish — publish (requires password + reason, auto-archive previous)
router.post('/documents/:id/publish', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { password, reason } = req.body;
    if (!password || !reason) return res.status(400).json({ error: 'password and reason are required.' });

    const doc = await getScopedDocument(req, id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    if (doc.status !== 'Approved') return res.status(400).json({ error: 'Only Approved documents can be published.' });

    const [[user]] = await pool.execute('SELECT * FROM users WHERE id = ?', [req.user.userId]);
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Incorrect password. Electronic signature rejected.' });

    const newMajor = doc.version_major + 1;
    const newMinor = 0;
    const versionStr = `${newMajor}.${newMinor}`;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Archive any previously published version of the same document in the same folder
      await conn.execute(
        "UPDATE cm_documents SET status = 'Archived', updated_at = NOW() WHERE folder_id = ? AND doc_type = ? AND status = 'Published' AND id != ?",
        [doc.folder_id, doc.doc_type, id]
      );

      await conn.execute(
        "UPDATE cm_documents SET status = 'Published', version_major = ?, version_minor = ?, updated_by = ?, updated_at = NOW() WHERE id = ?",
        [newMajor, newMinor, req.user.userId, id]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    await addVersionHistory('document', Number(id), versionStr, 'Published', reason, req.user.userId);
    await audit(req.user.userId, req.user.email, 'PUBLISH', 'cm_document', Number(id), { doc_id: doc.doc_id, reason, version: versionStr });
    res.json({ message: 'Document published.', version: versionStr });
  } catch (err) {
    console.error('POST /cm/documents/:id/publish error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/documents/:id/archive — manually archive
router.post('/documents/:id/archive', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const doc = await getScopedDocument(req, id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    const versionStr = `${doc.version_major}.${doc.version_minor}`;
    await pool.execute(
      "UPDATE cm_documents SET status = 'Archived', updated_by = ?, updated_at = NOW() WHERE id = ?",
      [req.user.userId, id]
    );
    await addVersionHistory('document', Number(id), versionStr, 'Archived', reason || 'Manually archived', req.user.userId);
    await audit(req.user.userId, req.user.email, 'ARCHIVE', 'cm_document', Number(id), { doc_id: doc.doc_id });
    res.json({ message: 'Document archived.' });
  } catch (err) {
    console.error('POST /cm/documents/:id/archive error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/documents/:id/versions — version history
router.get('/documents/:id/versions', authenticate, async (req, res) => {
  try {
    const doc = await getScopedDocument(req, req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    const [versions] = await pool.execute(
      `SELECT vh.*, u.name AS author_name
       FROM cm_version_history vh
       LEFT JOIN users u ON vh.author_id = u.id
       WHERE vh.entity_type = 'document' AND vh.entity_id = ?
       ORDER BY vh.created_at DESC`,
      [req.params.id]
    );
    res.json({ versions });
  } catch (err) {
    console.error('GET /cm/documents/:id/versions error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
