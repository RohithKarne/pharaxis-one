'use strict';

/**
 * cm/modules.js — Content Management Modules API
 * Modules are reusable content blocks that can be composed into SRD documents.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const { validateUpload } = require('../../middleware/uploadValidation');
const {
  archiveLinkedDocumentsForModule,
  runCmModuleLifecycle,
} = require('../../services/cmModuleLifecycleService');

const multer = require('multer');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../storage/cm_documents')),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const MODULE_STATUSES = new Set([
  'Draft',
  'CheckedOut',
  'Pending',
  'Under Review',
  'Approved',
  'Published',
  'Archived',
]);

function isSuperadmin(req) { return req.user.role === 'superadmin'; }

function normalizeStatus(value, fallback = 'Draft') {
  const status = String(value || '').trim();
  return MODULE_STATUSES.has(status) ? status : fallback;
}

function parseJsonField(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }
  return value;
}

function isPastDate(value) {
  if (!value) return false;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dt.setHours(0, 0, 0, 0);
  return dt < today;
}

function parseBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false;
  return fallback;
}

async function addVersionHistory(entityType, entityId, version, status, notes, authorId) {
  try {
    await pool.execute(
      `INSERT INTO cm_version_history (entity_type, entity_id, version, status, notes, author_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [entityType, entityId, version, status, notes || null, authorId || null]
    );
  } catch (_) { /* best-effort */ }
}

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, entity, entityId, JSON.stringify(details || {})]
    );
  } catch (_) { /* best-effort */ }
}

async function generateModuleId(conn) {
  const [[{ maxId }]] = await conn.execute('SELECT MAX(id) AS maxId FROM cm_modules');
  const nextNum = ((maxId || 0) + 1).toString().padStart(5, '0');
  return `MOD-${nextNum}`;
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

async function getScopedModule(req, moduleId) {
  const [rows] = await pool.execute(
    isSuperadmin(req)
      ? `SELECT m.*, f.org_id AS folder_org_id, f.name AS folder_name, u.name AS created_by_name
         FROM cm_modules m
         INNER JOIN cm_folders f ON m.folder_id = f.id
         LEFT JOIN users u ON m.created_by = u.id
         WHERE m.id = ?`
      : `SELECT m.*, f.org_id AS folder_org_id, f.name AS folder_name, u.name AS created_by_name
         FROM cm_modules m
         INNER JOIN cm_folders f ON m.folder_id = f.id
         LEFT JOIN users u ON m.created_by = u.id
         WHERE m.id = ? AND f.org_id = ?`,
    isSuperadmin(req) ? [moduleId] : [moduleId, req.user.orgId]
  );
  return rows[0] || null;
}

// GET /api/cm/modules — list modules
router.get('/modules', authenticate, async (req, res) => {
  try {
    await runCmModuleLifecycle().catch(() => {});
    const { status, folder_id, search, include_expired = 'false' } = req.query;
    let query = `
      SELECT m.*, f.name AS folder_name, u.name AS created_by_name
      FROM cm_modules m
      LEFT JOIN cm_folders f ON m.folder_id = f.id
      LEFT JOIN users u ON m.created_by = u.id
      WHERE 1=1
    `;
    const params = [];
    if (!isSuperadmin(req)) {
      query += ' AND f.org_id = ?';
      params.push(req.user.orgId);
    }
    if (status) { query += ' AND m.status = ?'; params.push(status); }
    if (folder_id) { query += ' AND m.folder_id = ?'; params.push(folder_id); }
    if (search) {
      query += ' AND (m.name LIKE ? OR m.module_id LIKE ? OR m.search_tags LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (include_expired !== 'true') {
      query += ' AND (m.expiry_date IS NULL OR m.expiry_date >= CURDATE())';
    }
    query += ' ORDER BY m.updated_at DESC';
    const [modules] = await pool.execute(query, params);
    res.json({ modules });
  } catch (err) {
    console.error('GET /cm/modules error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/modules/:id — module detail
router.get('/modules/:id', authenticate, async (req, res) => {
  try {
    const moduleRow = await getScopedModule(req, req.params.id);
    if (!moduleRow) return res.status(404).json({ error: 'Module not found.' });
    return res.json({ module: moduleRow });
  } catch (err) {
    console.error('GET /cm/modules/:id error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/modules — create module
router.post('/modules', authenticate, upload.single('file'), validateUpload(['doc']), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const moduleId = await generateModuleId(conn);
    const {
      folder_id, module_type, name, content_html,
      language, search_tags, publish_as_pdf, send_as_pdf,
      status, activation_date, expiry_date, usage_instructions,
      document_category, standard_response_text, attributes,
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

    const resolvedStatus = isPastDate(expiry_date) ? 'Archived' : normalizeStatus(status, 'Draft');
    const filePath = req.file ? req.file.path : null;
    const fileName = req.file ? req.file.originalname : null;
    const fileSize = req.file ? req.file.size : null;
    const fileMime = req.file ? req.file.mimetype : null;
    const attrs = parseJsonField(attributes, null);

    const [result] = await conn.execute(
      `INSERT INTO cm_modules
         (module_id, folder_id, module_type, name, content_html, file_path, file_name, file_size, file_mime,
          status, version_major, version_minor, language, search_tags, publish_as_pdf, send_as_pdf,
          activation_date, expiry_date, usage_instructions, document_category, standard_response_text,
          attributes, owner_user_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        moduleId, folder_id, module_type || 'SRD', name.trim(),
        content_html || null, filePath, fileName, fileSize, fileMime,
        resolvedStatus,
        language || 'en', search_tags || null,
        parseBoolean(publish_as_pdf, false) ? 1 : 0, parseBoolean(send_as_pdf, false) ? 1 : 0,
        activation_date || null, expiry_date || null, usage_instructions || null,
        document_category || null, standard_response_text || null,
        attrs ? JSON.stringify(attrs) : null,
        req.user.userId,
        req.user.userId,
      ]
    );
    await conn.commit();
    const created = await getScopedModule(req, result.insertId);
    await audit(req.user.userId, req.user.email, 'CREATE', 'cm_module', result.insertId, {
      module_id: moduleId,
      name: created?.name || name,
    });

    if (created && created.status === 'Archived') {
      const versionStr = `${created.version_major || 1}.${created.version_minor || 0}`;
      await addVersionHistory('module', created.id, versionStr, 'Archived', 'Module created in archived state (expired).', req.user.userId);
      await archiveLinkedDocumentsForModule(created, {
        trigger: 'expired',
        actorUserId: req.user.userId,
        actorUserName: req.user.email,
      });
    }

    res.status(201).json({ message: 'Module created.', id: result.insertId, module: created });
  } catch (err) {
    await conn.rollback();
    console.error('POST /cm/modules error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    conn.release();
  }
});

// PUT /api/cm/modules/:id — update module
router.put('/modules/:id', authenticate, upload.single('file'), validateUpload(['doc']), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const existing = await getScopedModule(req, req.params.id);
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ error: 'Module not found.' });
    }

    const {
      folder_id, module_type, name, content_html,
      language, search_tags, publish_as_pdf, send_as_pdf,
      status, activation_date, expiry_date, usage_instructions,
      document_category, standard_response_text, attributes,
    } = req.body;

    if (folder_id) {
      const scopedFolder = await getScopedFolder(req, folder_id);
      if (!scopedFolder) {
        await conn.rollback();
        return res.status(404).json({ error: 'Folder not found for active organisation.' });
      }
    }

    const nextStatus = isPastDate(expiry_date || existing.expiry_date)
      ? 'Archived'
      : normalizeStatus(status, existing.status || 'Draft');
    const filePath = req.file ? req.file.path : existing.file_path;
    const fileName = req.file ? req.file.originalname : existing.file_name;
    const fileSize = req.file ? req.file.size : existing.file_size;
    const fileMime = req.file ? req.file.mimetype : existing.file_mime;
    const attrs = attributes !== undefined
      ? parseJsonField(attributes, null)
      : parseJsonField(existing.attributes, null);

    await conn.execute(
      `UPDATE cm_modules
       SET folder_id = ?, module_type = ?, name = ?, content_html = ?,
           file_path = ?, file_name = ?, file_size = ?, file_mime = ?,
           status = ?, language = ?, search_tags = ?, publish_as_pdf = ?, send_as_pdf = ?,
           activation_date = ?, expiry_date = ?, usage_instructions = ?,
           document_category = ?, standard_response_text = ?, attributes = ?,
           updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        folder_id || existing.folder_id,
        module_type || existing.module_type,
        name || existing.name,
        content_html !== undefined ? content_html : existing.content_html,
        filePath, fileName, fileSize, fileMime,
        nextStatus,
        language || existing.language || 'en',
        search_tags !== undefined ? search_tags : existing.search_tags,
        publish_as_pdf !== undefined ? (parseBoolean(publish_as_pdf, false) ? 1 : 0) : existing.publish_as_pdf,
        send_as_pdf !== undefined ? (parseBoolean(send_as_pdf, false) ? 1 : 0) : existing.send_as_pdf,
        activation_date !== undefined ? (activation_date || null) : existing.activation_date,
        expiry_date !== undefined ? (expiry_date || null) : existing.expiry_date,
        usage_instructions !== undefined ? (usage_instructions || null) : existing.usage_instructions,
        document_category !== undefined ? (document_category || null) : existing.document_category,
        standard_response_text !== undefined ? (standard_response_text || null) : existing.standard_response_text,
        attrs ? JSON.stringify(attrs) : null,
        req.user.userId,
        req.params.id,
      ]
    );

    await conn.commit();

    const updated = await getScopedModule(req, req.params.id);
    await audit(req.user.userId, req.user.email, 'UPDATE', 'cm_module', Number(req.params.id), {
      module_id: updated?.module_id || existing.module_id || null,
      status: updated?.status || nextStatus,
    });

    const movedToArchived = existing.status !== 'Archived' && updated?.status === 'Archived';
    if (movedToArchived) {
      const reason = isPastDate(updated.expiry_date) ? 'Module auto-archived due to expiry.' : 'Module manually archived.';
      const versionStr = `${updated.version_major || 1}.${updated.version_minor || 0}`;
      await addVersionHistory('module', updated.id, versionStr, 'Archived', reason, req.user.userId);
      await archiveLinkedDocumentsForModule(updated, {
        trigger: isPastDate(updated.expiry_date) ? 'expired' : 'archived',
        actorUserId: req.user.userId,
        actorUserName: req.user.email,
      });
    }

    return res.json({ message: 'Module updated.', module: updated });
  } catch (err) {
    await conn.rollback();
    console.error('PUT /cm/modules/:id error:', err);
    return res.status(500).json({ error: 'Server error.' });
  } finally {
    conn.release();
  }
});

// POST /api/cm/modules/:id/archive — archive module + cascade archive linked docs
router.post('/modules/:id/archive', authenticate, async (req, res) => {
  try {
    const moduleRow = await getScopedModule(req, req.params.id);
    if (!moduleRow) return res.status(404).json({ error: 'Module not found.' });
    if (moduleRow.status === 'Archived') return res.json({ message: 'Module already archived.' });

    await pool.execute(
      `UPDATE cm_modules
       SET status = 'Archived', updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [req.user.userId, req.params.id]
    );

    const updated = await getScopedModule(req, req.params.id);
    const versionStr = `${updated.version_major || 1}.${updated.version_minor || 0}`;
    await addVersionHistory('module', updated.id, versionStr, 'Archived', req.body?.reason || 'Manually archived', req.user.userId);
    await audit(req.user.userId, req.user.email, 'ARCHIVE', 'cm_module', Number(req.params.id), {
      module_id: updated.module_id || null,
      name: updated.name,
    });

    const cascadeResult = await archiveLinkedDocumentsForModule(updated, {
      trigger: 'archived',
      actorUserId: req.user.userId,
      actorUserName: req.user.email,
    });

    return res.json({
      message: 'Module archived.',
      archived_linked_documents: cascadeResult.archivedDocumentIds.length,
    });
  } catch (err) {
    console.error('POST /cm/modules/:id/archive error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
