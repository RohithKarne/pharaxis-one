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
const { validateUpload } = require('../../middleware/uploadValidation');
const bcrypt = require('bcrypt');

const multer = require('multer');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../storage/cm_documents')),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
const uploadFields = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'source_attachments', maxCount: 20 },
]);

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

function parseSelectedModules(value) {
  if (value === undefined || value === null || value === '') return [];

  let parsed = value;
  for (let i = 0; i < 2; i += 1) {
    if (typeof parsed !== 'string') break;
    try {
      parsed = JSON.parse(parsed);
    } catch (_) {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];
  const normalized = parsed
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  return [...new Set(normalized)];
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
    const { status, folder_id, doc_type, search, page = 1, limit = 50, include_expired = 'false' } = req.query;
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
    if (include_expired !== 'true') {
      query += ' AND (d.expiry_date IS NULL OR d.expiry_date >= CURDATE())';
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
router.post('/documents', authenticate, uploadFields, validateUpload(['doc']), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const docId = await generateDocId(conn);
    const {
      folder_id, doc_type, name, content_html, expiry_date, activation_date,
      language, is_product_specific, is_site_specific, search_tags, usage_instructions, attributes,
      response_doc_type, publish_as_pdf, send_as_pdf, selected_modules,
      mi_category_id, document_category, standard_response_text,
    } = req.body;
    const parsedSelectedModules = parseSelectedModules(selected_modules);

    if (!folder_id || !name) {
      await conn.rollback();
      return res.status(400).json({ error: 'folder_id and name are required.' });
    }

    const scopedFolder = await getScopedFolder(req, folder_id);
    if (!scopedFolder) {
      await conn.rollback();
      return res.status(404).json({ error: 'Folder not found for active organisation.' });
    }

    const primaryFile = req.files && req.files['file'] ? req.files['file'][0] : null;
    const filePath = primaryFile ? primaryFile.path : null;
    const fileName = primaryFile ? primaryFile.originalname : null;
    const fileSize = primaryFile ? primaryFile.size : null;
    const fileMime = primaryFile ? primaryFile.mimetype : null;

    const [result] = await conn.execute(
      `INSERT INTO cm_documents
         (doc_id, folder_id, doc_type, response_doc_type, name, content_html, file_path, file_name, file_size, file_mime,
          status, version_major, version_minor, expiry_date, activation_date, language,
          is_product_specific, is_site_specific, search_tags, usage_instructions,
          publish_as_pdf, send_as_pdf, selected_modules, attributes,
          mi_category_id, document_category, standard_response_text, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', 1, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docId, folder_id, doc_type || 'SRD', response_doc_type || 'File', name.trim(), content_html || null,
        filePath, fileName, fileSize, fileMime,
        expiry_date || null, activation_date || null, language || 'en',
        is_product_specific ? 1 : 0, is_site_specific ? 1 : 0,
        search_tags || null, usage_instructions || null,
        publish_as_pdf ? 1 : 0, send_as_pdf ? 1 : 0,
        parsedSelectedModules.length ? JSON.stringify(parsedSelectedModules) : null,
        attributes ? JSON.stringify(attributes) : null,
        mi_category_id || null, document_category || null, standard_response_text || null,
        req.user.userId,
      ]
    );

    // Save source attachments
    const sourceFiles = req.files && req.files['source_attachments'] ? req.files['source_attachments'] : [];
    for (const f of sourceFiles) {
      await conn.execute(
        `INSERT INTO cm_document_attachments (document_id, file_path, file_name, file_size, file_mime, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)`,
        [result.insertId, f.path, f.originalname, f.size, f.mimetype, req.user.userId]
      );
    }

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
router.put('/documents/:id', authenticate, uploadFields, validateUpload(['doc']), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const doc = await getScopedDocument(req, id);
    if (!doc) { await conn.rollback(); return res.status(404).json({ error: 'Document not found.' }); }

    if (doc.status !== 'Draft' && !(doc.status === 'CheckedOut' && doc.checked_out_by === req.user.userId)) {
      await conn.rollback();
      return res.status(403).json({ error: 'Document can only be updated when in Draft status or checked out by you.' });
    }

    const {
      folder_id, doc_type, name, content_html, expiry_date, activation_date,
      language, is_product_specific, is_site_specific, search_tags, usage_instructions, attributes,
      response_doc_type, publish_as_pdf, send_as_pdf, selected_modules,
      mi_category_id, document_category, standard_response_text,
    } = req.body;
    const parsedSelectedModules = selected_modules !== undefined
      ? parseSelectedModules(selected_modules)
      : null;

    const primaryFile = req.files && req.files['file'] ? req.files['file'][0] : null;
    const filePath = primaryFile ? primaryFile.path : doc.file_path;
    const fileName = primaryFile ? primaryFile.originalname : doc.file_name;
    const fileSize = primaryFile ? primaryFile.size : doc.file_size;
    const fileMime = primaryFile ? primaryFile.mimetype : doc.file_mime;

    await conn.execute(
      `UPDATE cm_documents SET
         folder_id = ?, doc_type = ?, name = ?, content_html = ?,
         file_path = ?, file_name = ?, file_size = ?, file_mime = ?,
         expiry_date = ?, activation_date = ?, language = ?,
         is_product_specific = ?, is_site_specific = ?,
         search_tags = ?, usage_instructions = ?, attributes = ?,
         response_doc_type = ?, publish_as_pdf = ?, send_as_pdf = ?,
         selected_modules = ?, mi_category_id = ?, document_category = ?,
         standard_response_text = ?, updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        folder_id || doc.folder_id, doc_type || doc.doc_type, name || doc.name,
        content_html !== undefined ? content_html : doc.content_html,
        filePath, fileName, fileSize, fileMime,
        expiry_date || doc.expiry_date || null, activation_date || doc.activation_date || null,
        language || doc.language,
        is_product_specific !== undefined ? (is_product_specific ? 1 : 0) : doc.is_product_specific,
        is_site_specific !== undefined ? (is_site_specific ? 1 : 0) : doc.is_site_specific,
        search_tags !== undefined ? search_tags : doc.search_tags,
        usage_instructions !== undefined ? usage_instructions : doc.usage_instructions,
        attributes ? JSON.stringify(attributes) : doc.attributes,
        response_doc_type || doc.response_doc_type || 'File',
        publish_as_pdf !== undefined ? (publish_as_pdf ? 1 : 0) : doc.publish_as_pdf,
        send_as_pdf !== undefined ? (send_as_pdf ? 1 : 0) : doc.send_as_pdf,
        selected_modules !== undefined
          ? (parsedSelectedModules.length ? JSON.stringify(parsedSelectedModules) : null)
          : doc.selected_modules,
        mi_category_id !== undefined ? (mi_category_id || null) : doc.mi_category_id,
        document_category !== undefined ? (document_category || null) : doc.document_category,
        standard_response_text !== undefined ? (standard_response_text || null) : doc.standard_response_text,
        req.user.userId, id,
      ]
    );

    // Handle new source attachments if provided
    const sourceFiles = req.files && req.files['source_attachments'] ? req.files['source_attachments'] : [];
    for (const f of sourceFiles) {
      await conn.execute(
        `INSERT INTO cm_document_attachments (document_id, file_path, file_name, file_size, file_mime, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, f.path, f.originalname, f.size, f.mimetype, req.user.userId]
      );
    }

    await conn.commit();
    await audit(req.user.userId, req.user.email, 'UPDATE', 'cm_document', Number(id), { name: name || doc.name });
    res.json({ message: 'Document updated.' });
  } catch (err) {
    await conn.rollback();
    console.error('PUT /cm/documents/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    conn.release();
  }
});

// POST /api/cm/documents/:id/checkout — check out document (Draft or Published)
router.post('/documents/:id/checkout', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await getScopedDocument(req, id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    if (!['Draft', 'Published'].includes(doc.status)) return res.status(400).json({ error: 'Only Draft or Published documents can be checked out.' });
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

// POST /api/cm/documents/:id/checkin — check in (Draft or CheckedOut → Pending)
router.post('/documents/:id/checkin', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await getScopedDocument(req, id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    if (!['Draft', 'CheckedOut'].includes(doc.status)) {
      return res.status(400).json({ error: 'Only Draft or CheckedOut documents can be checked in.' });
    }
    if (doc.status === 'CheckedOut' && doc.checked_out_by !== req.user.userId) {
      return res.status(403).json({ error: 'Only the user who checked out this document can check it in.' });
    }

    const { notes, bump_type } = req.body;

    // Determine version bump — bump_type only applies on re-versioning (version_major > 1 or explicit minor bump)
    let newMajor = doc.version_major;
    let newMinor = doc.version_minor + 1;
    if (bump_type === 'major') {
      newMajor = doc.version_major + 1;
      newMinor = 0;
    }
    const versionStr = `${newMajor}.${newMinor}`;

    // Auto-set owner_user_id on first checkin (locked to this user)
    const ownerUpdate = doc.owner_user_id ? '' : ', owner_user_id = ?';
    const ownerParams = doc.owner_user_id ? [] : [req.user.userId];

    await pool.execute(
      `UPDATE cm_documents SET
         status = 'Pending', checked_out_by = NULL, checked_out_at = NULL,
         version_major = ?, version_minor = ?, updated_by = ?, updated_at = NOW()${ownerUpdate}
       WHERE id = ?`,
      [newMajor, newMinor, req.user.userId, ...ownerParams, id]
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
    // Owner lock enforcement — only the document owner can publish
    if (doc.owner_user_id && doc.owner_user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Only the document owner can publish. Ask the owner to release the document first.' });
    }

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
        "UPDATE cm_documents SET status = 'Published', version_major = ?, version_minor = ?, owner_user_id = ?, updated_by = ?, updated_at = NOW() WHERE id = ?",
        [newMajor, newMinor, req.user.userId, req.user.userId, id]
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

// POST /api/cm/documents/:id/release — owner releases lock → back to Draft
router.post('/documents/:id/release', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await getScopedDocument(req, id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    if (doc.owner_user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Only the document owner can release this document.' });
    }
    const allowedStatuses = ['Published', 'Approved', 'Pending', 'CheckedOut'];
    if (!allowedStatuses.includes(doc.status)) {
      return res.status(400).json({ error: 'Document cannot be released from its current status.' });
    }
    await pool.execute(
      "UPDATE cm_documents SET status = 'Draft', owner_user_id = NULL, checked_out_by = NULL, checked_out_at = NULL, updated_by = ?, updated_at = NOW() WHERE id = ?",
      [req.user.userId, id]
    );
    await audit(req.user.userId, req.user.email, 'RELEASE', 'cm_document', Number(id), { doc_id: doc.doc_id });
    res.json({ message: 'Document released. Status reset to Draft.' });
  } catch (err) {
    console.error('POST /cm/documents/:id/release error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/documents/:id/relations — get associated documents
router.get('/documents/:id/relations', authenticate, async (req, res) => {
  try {
    const doc = await getScopedDocument(req, req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    const [rows] = await pool.execute(
      `SELECT r.id, r.relation_type, r.created_at,
              d.id AS related_id, d.doc_id, d.name, d.status, d.version_major, d.version_minor,
              d.expiry_date, d.file_path, d.file_name
       FROM cm_document_relations r
       JOIN cm_documents d ON d.id = r.related_doc_id
       WHERE r.doc_id = ?
         AND d.status NOT IN ('Archived')
         AND (d.expiry_date IS NULL OR d.expiry_date > NOW())
       ORDER BY r.created_at DESC`,
      [req.params.id]
    );
    res.json({ relations: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cm/documents/:id/relations — link a related document
router.post('/documents/:id/relations', authenticate, async (req, res) => {
  try {
    const { related_doc_id, relation_type = 'Supports' } = req.body;
    if (!related_doc_id) return res.status(400).json({ error: 'related_doc_id is required.' });

    const doc = await getScopedDocument(req, req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    const relDoc = await getScopedDocument(req, related_doc_id);
    if (!relDoc) return res.status(404).json({ error: 'Related document not found.' });

    if (Number(related_doc_id) === Number(req.params.id)) {
      return res.status(400).json({ error: 'Cannot link a document to itself.' });
    }

    const [result] = await pool.execute(
      `INSERT INTO cm_document_relations (doc_id, related_doc_id, relation_type, created_by) VALUES (?, ?, ?, ?)`,
      [req.params.id, related_doc_id, relation_type, req.user.userId]
    );
    res.status(201).json({ message: 'Relation created.', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This document is already linked.' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cm/documents/:id/relations/:rel_id
router.delete('/documents/:id/relations/:rel_id', authenticate, async (req, res) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM cm_document_relations WHERE id = ? AND doc_id = ?',
      [req.params.rel_id, req.params.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Relation not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cm/documents/:id/alert-config — get per-doc alert settings
router.get('/documents/:id/alert-config', authenticate, async (req, res) => {
  try {
    const doc = await getScopedDocument(req, req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    const [subs] = await pool.execute(
      `SELECT s.id, s.user_id, u.name, u.email FROM cm_document_alert_subs s
       JOIN users u ON u.id = s.user_id WHERE s.document_id = ?`,
      [req.params.id]
    );
    res.json({
      alert_days: doc.alert_days || null,
      alert_email_account_id: doc.alert_email_account_id || null,
      subscribers: subs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/cm/documents/:id/alert-config — save alert days + email account
router.put('/documents/:id/alert-config', authenticate, async (req, res) => {
  try {
    const { alert_days, alert_email_account_id } = req.body;
    const doc = await getScopedDocument(req, req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    await pool.execute(
      'UPDATE cm_documents SET alert_days = ?, alert_email_account_id = ?, updated_at = NOW() WHERE id = ?',
      [alert_days ? JSON.stringify(alert_days) : null, alert_email_account_id || null, req.params.id]
    );
    res.json({ message: 'Alert config saved.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cm/documents/:id/alert-subs — add subscriber
router.post('/documents/:id/alert-subs', authenticate, async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required.' });
    await pool.execute(
      'INSERT IGNORE INTO cm_document_alert_subs (document_id, user_id, created_by) VALUES (?, ?, ?)',
      [req.params.id, user_id, req.user.userId]
    );
    res.status(201).json({ message: 'Subscriber added.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cm/documents/:id/alert-subs/:sub_id — remove subscriber
router.delete('/documents/:id/alert-subs/:sub_id', authenticate, async (req, res) => {
  try {
    await pool.execute(
      'DELETE FROM cm_document_alert_subs WHERE id = ? AND document_id = ?',
      [req.params.sub_id, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
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
