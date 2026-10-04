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
const { hasGlobalAdminScope } = require('../../utils/adminScope');
const { userHasActivityPrivilege } = require('../../services/accessConfigurationService');
const { publishedOnly } = require('../../middleware/cmAccess');
const bcrypt = require('bcrypt');

// MIPM-191: a module's status came straight from the request, so an author could
// save one as Published — no review, no approval — and the response builder
// offered it to agents at once. Approved needs content.approve and Published
// needs content.publish; an author saves Draft or Pending.
async function moduleStatusAllowed(req, status, previous) {
  if (status === previous) return true;
  if (status === 'Approved') return userHasActivityPrivilege(req.user, 'content.approve');
  if (status === 'Published') return userHasActivityPrivilege(req.user, 'content.publish');
  return true;
}
// True when a save would change a module's content (not just its status).
const MODULE_CONTENT_FIELDS = ['folder_id', 'module_type', 'name', 'content_html', 'language', 'search_tags',
  'usage_instructions', 'document_category', 'standard_response_text'];
function moduleContentChanged(existing, body, file) {
  if (file) return true;
  const text = (v) => String(v ?? '').trim();
  const day = (v) => (v instanceof Date ? v.toISOString() : text(v)).slice(0, 10);
  for (const key of MODULE_CONTENT_FIELDS) {
    if (body[key] !== undefined && text(body[key]) !== text(existing[key])) return true;
  }
  for (const key of ['activation_date', 'expiry_date']) {
    if (body[key] !== undefined && day(body[key]) !== day(existing[key])) return true;
  }
  for (const key of ['publish_as_pdf', 'send_as_pdf']) {
    if (body[key] !== undefined && parseBoolean(body[key], false) !== !!Number(existing[key] || 0)) return true;
  }
  return false;
}
function safeStoredFilename(originalname) {
  const base = path.basename(String(originalname || 'upload'))
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 180) || 'upload';
  return `${Date.now()}_${base}`;
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../storage/cm_documents')),
  filename: (req, file, cb) => cb(null, safeStoredFilename(file.originalname)),
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

function hasPlatformAdminScope(req) { return hasGlobalAdminScope(req.user); }

let schemaReady = false;
let schemaInitPromise = null;
let cmModulesColumnsCache = null;

async function getCmModulesColumnSet(executor = pool, forceRefresh = false) {
  if (cmModulesColumnsCache && !forceRefresh) return cmModulesColumnsCache;
  const [rows] = await executor.execute(
    `SELECT COLUMN_NAME
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'cm_modules'`
  );
  cmModulesColumnsCache = new Set(rows.map((row) => row.COLUMN_NAME));
  return cmModulesColumnsCache;
}

async function ensureCmModulesSchema() {
  if (schemaReady) return;
  if (schemaInitPromise) {
    await schemaInitPromise;
    return;
  }

  schemaInitPromise = (async () => {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS cm_modules (
        id                  INT NOT NULL AUTO_INCREMENT,
        module_id           VARCHAR(50),
        folder_id           INT NOT NULL,
        module_type         VARCHAR(50) NOT NULL DEFAULT 'SRD',
        name                VARCHAR(500) NOT NULL,
        content_html        MEDIUMTEXT,
        file_path           VARCHAR(1000),
        file_name           VARCHAR(500),
        file_size           INT,
        file_mime           VARCHAR(100),
        status              VARCHAR(50) NOT NULL DEFAULT 'Draft',
        version_major       INT NOT NULL DEFAULT 1,
        version_minor       INT NOT NULL DEFAULT 0,
        checked_out_by      INT,
        checked_out_at      DATETIME,
        expiry_date         DATE,
        activation_date     DATE,
        language            VARCHAR(20) NOT NULL DEFAULT 'en',
        search_tags         TEXT,
        usage_instructions  TEXT,
        document_category   VARCHAR(255),
        standard_response_text TEXT,
        publish_as_pdf      TINYINT(1) NOT NULL DEFAULT 0,
        send_as_pdf         TINYINT(1) NOT NULL DEFAULT 0,
        attributes          JSON,
        owner_user_id       INT,
        created_by          INT NOT NULL,
        updated_by          INT,
        created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_cm_modules_folder (folder_id),
        KEY idx_cm_modules_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const alters = [
      `ALTER TABLE cm_modules ADD COLUMN module_id VARCHAR(50)`,
      `ALTER TABLE cm_modules ADD COLUMN module_type VARCHAR(50) NOT NULL DEFAULT 'SRD'`,
      `ALTER TABLE cm_modules ADD COLUMN activation_date DATE`,
      `ALTER TABLE cm_modules ADD COLUMN expiry_date DATE`,
      `ALTER TABLE cm_modules ADD COLUMN language VARCHAR(20) NOT NULL DEFAULT 'en'`,
      `ALTER TABLE cm_modules ADD COLUMN search_tags TEXT`,
      `ALTER TABLE cm_modules ADD COLUMN usage_instructions TEXT`,
      `ALTER TABLE cm_modules ADD COLUMN document_category VARCHAR(255)`,
      `ALTER TABLE cm_modules ADD COLUMN standard_response_text TEXT`,
      `ALTER TABLE cm_modules ADD COLUMN publish_as_pdf TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE cm_modules ADD COLUMN send_as_pdf TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE cm_modules ADD COLUMN attributes JSON`,
      `ALTER TABLE cm_modules ADD COLUMN owner_user_id INT`,
      `ALTER TABLE cm_modules ADD COLUMN updated_by INT`,
      `ALTER TABLE cm_modules ADD COLUMN checked_out_by INT`,
      `ALTER TABLE cm_modules ADD COLUMN checked_out_at DATETIME`,
    ];
    for (const sql of alters) {
      try {
        await pool.execute(sql);
      } catch (_) { /* already exists */ }
    }

    await getCmModulesColumnSet(pool, true);
    schemaReady = true;
  })();

  try {
    await schemaInitPromise;
  } finally {
    schemaInitPromise = null;
  }
}

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
    hasPlatformAdminScope(req)
      ? 'SELECT * FROM cm_folders WHERE id = ?'
      : 'SELECT * FROM cm_folders WHERE id = ? AND org_id = ?',
    hasPlatformAdminScope(req) ? [folderId] : [folderId, req.user.orgId]
  );
  return rows[0] || null;
}

async function getScopedModule(req, moduleId) {
  try {
    const [rows] = await pool.execute(
      hasPlatformAdminScope(req)
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
      hasPlatformAdminScope(req) ? [moduleId] : [moduleId, req.user.orgId]
    );
    return rows[0] || null;
  } catch (err) {
    if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
    const [rows] = await pool.execute(
      hasPlatformAdminScope(req)
        ? `SELECT m.*, f.org_id AS folder_org_id, f.name AS folder_name
           FROM cm_modules m
           INNER JOIN cm_folders f ON m.folder_id = f.id
           WHERE m.id = ?`
        : `SELECT m.*, f.org_id AS folder_org_id, f.name AS folder_name
           FROM cm_modules m
           INNER JOIN cm_folders f ON m.folder_id = f.id
           WHERE m.id = ? AND f.org_id = ?`,
      hasPlatformAdminScope(req) ? [moduleId] : [moduleId, req.user.orgId]
    );
    return rows[0] || null;
  }
}

// GET /api/cm/modules — list modules
router.get('/modules', authenticate, async (req, res) => {
  try {
    await ensureCmModulesSchema();
    await runCmModuleLifecycle().catch(() => {});
    const { status, folder_id, search, include_expired = 'false' } = req.query;
    const draftsHidden = await publishedOnly(req);
    const buildQuery = (includeCreatedBy) => {
      let query = `
        SELECT m.*, f.name AS folder_name${includeCreatedBy ? ', u.name AS created_by_name' : ''}
        FROM cm_modules m
        LEFT JOIN cm_folders f ON m.folder_id = f.id
        ${includeCreatedBy ? 'LEFT JOIN users u ON m.created_by = u.id' : ''}
        WHERE 1=1
      `;
      const params = [];
      if (!hasPlatformAdminScope(req)) {
        query += ' AND f.org_id = ?';
        params.push(req.user.orgId);
      }
      if (status) { query += ' AND m.status = ?'; params.push(status); }
      if (draftsHidden) query += " AND m.status = 'Published'";
      if (folder_id) { query += ' AND m.folder_id = ?'; params.push(folder_id); }
      if (search) {
        query += ' AND (m.name LIKE ? OR m.module_id LIKE ? OR m.search_tags LIKE ?)';
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      if (include_expired !== 'true') {
        query += ' AND (m.expiry_date IS NULL OR m.expiry_date >= CURDATE())';
      }
      query += ' ORDER BY m.updated_at DESC';
      return { query, params };
    };

    try {
      const { query, params } = buildQuery(true);
      const [modules] = await pool.execute(query, params);
      return res.json({ modules });
    } catch (err) {
      if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
      const { query, params } = buildQuery(false);
      const [modules] = await pool.execute(query, params);
      return res.json({ modules });
    }
  } catch (err) {
    console.error('GET /cm/modules error:', err);
    res.status(500).json({ error: err.message || 'Server error.', code: err.code || null });
  }
});

// GET /api/cm/modules/:id — module detail
router.get('/modules/:id', authenticate, async (req, res) => {
  try {
    await ensureCmModulesSchema();
    const moduleRow = await getScopedModule(req, req.params.id);
    if (!moduleRow) return res.status(404).json({ error: 'Module not found.' });
    if (moduleRow.status !== 'Published' && await publishedOnly(req)) return res.status(404).json({ error: 'Module not found.' });
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
    await ensureCmModulesSchema();
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

    // CM-T7: Validate content_html payload size (max 5 MB)
    const CM_T7_MAX_CONTENT_BYTES = 5 * 1024 * 1024;
    if (content_html && Buffer.byteLength(content_html, 'utf8') > CM_T7_MAX_CONTENT_BYTES) {
      await conn.rollback();
      return res.status(413).json({ error: 'Module content exceeds the maximum allowed size of 5 MB. Please reduce the content or split into smaller modules.' });
    }

    const scopedFolder = await getScopedFolder(req, folder_id);
    if (!scopedFolder) {
      await conn.rollback();
      return res.status(404).json({ error: 'Folder not found for active organisation.' });
    }

    const resolvedStatus = isPastDate(expiry_date) ? 'Archived' : normalizeStatus(status, 'Draft');
    // MIPM-220: a module could be created already Approved or Published, by its
    // author, with no approval at all. New modules start as Draft or Pending.
    if (['Approved', 'Published'].includes(resolvedStatus)) {
      await conn.rollback();
      return res.status(400).json({ error: 'A new module starts as Draft or Pending; it is approved and published after it is created.' });
    }
    if (!(await moduleStatusAllowed(req, resolvedStatus, null))) {
      await conn.rollback();
      return res.status(403).json({ error: `You do not have permission to save a module as ${resolvedStatus}.` });
    }
    const filePath = req.file ? req.file.path : null;
    const fileName = req.file ? req.file.originalname : null;
    const fileSize = req.file ? req.file.size : null;
    const fileMime = req.file ? req.file.mimetype : null;
    const attrs = parseJsonField(attributes, null);

    const columns = await getCmModulesColumnSet(conn, true);
    const row = {};
    if (columns.has('module_id')) row.module_id = moduleId;
    if (columns.has('folder_id')) row.folder_id = folder_id;
    if (columns.has('module_type')) row.module_type = module_type || 'SRD';
    if (columns.has('name')) row.name = name.trim();
    else if (columns.has('title')) row.title = name.trim();
    if (columns.has('content_html')) row.content_html = content_html || null;
    else if (columns.has('content')) row.content = content_html || null;
    if (columns.has('file_path')) row.file_path = filePath;
    if (columns.has('file_name')) row.file_name = fileName;
    if (columns.has('file_size')) row.file_size = fileSize;
    if (columns.has('file_mime')) row.file_mime = fileMime;
    if (columns.has('status')) row.status = resolvedStatus;
    if (columns.has('version_major')) row.version_major = 1;
    if (columns.has('version_minor')) row.version_minor = 0;
    if (columns.has('language')) row.language = language || 'en';
    if (columns.has('search_tags')) row.search_tags = search_tags || null;
    if (columns.has('publish_as_pdf')) row.publish_as_pdf = parseBoolean(publish_as_pdf, false) ? 1 : 0;
    if (columns.has('send_as_pdf')) row.send_as_pdf = parseBoolean(send_as_pdf, false) ? 1 : 0;
    if (columns.has('activation_date')) row.activation_date = activation_date || null;
    if (columns.has('expiry_date')) row.expiry_date = expiry_date || null;
    if (columns.has('usage_instructions')) row.usage_instructions = usage_instructions || null;
    if (columns.has('document_category')) row.document_category = document_category || null;
    if (columns.has('standard_response_text')) row.standard_response_text = standard_response_text || null;
    if (columns.has('attributes')) row.attributes = attrs ? JSON.stringify(attrs) : null;
    if (columns.has('owner_user_id')) row.owner_user_id = req.user.userId || null;
    if (columns.has('created_by')) row.created_by = req.user.userId || null;
    if (columns.has('org_id')) row.org_id = scopedFolder.org_id || req.user.orgId || null;

    const insertFields = Object.keys(row);
    const [result] = await conn.execute(
      `INSERT INTO cm_modules (${insertFields.join(', ')}) VALUES (${insertFields.map(() => '?').join(', ')})`,
      insertFields.map((field) => row[field])
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
    res.status(500).json({ error: err.message || 'Server error.', code: err.code || null });
  } finally {
    conn.release();
  }
});

// PUT /api/cm/modules/:id — update module
router.put('/modules/:id', authenticate, upload.single('file'), validateUpload(['doc']), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await ensureCmModulesSchema();
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

    // CM-T7: Validate content_html payload size (max 5 MB)
    const CM_T7_MAX_CONTENT_BYTES_PUT = 5 * 1024 * 1024;
    if (content_html && Buffer.byteLength(content_html, 'utf8') > CM_T7_MAX_CONTENT_BYTES_PUT) {
      await conn.rollback();
      return res.status(413).json({ error: 'Module content exceeds the maximum allowed size of 5 MB. Please reduce the content or split into smaller modules.' });
    }

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
    if (!(await moduleStatusAllowed(req, nextStatus, existing.status))) {
      await conn.rollback();
      return res.status(403).json({ error: `You do not have permission to save a module as ${nextStatus}.` });
    }
    // MIPM-219: the author could approve their own module, and the text of an
    // approved or published module could be changed while it stayed published —
    // approved clinical wording altered with no new approval. Documents and FAQs
    // already refuse both.
    if (nextStatus === 'Approved' && existing.status !== 'Approved' && Number(existing.created_by) === Number(req.user.userId)) {
      await conn.rollback();
      return res.status(403).json({ error: 'The author of a module cannot approve it. An independent reviewer is required.' });
    }
    if (['Approved', 'Published', 'Archived'].includes(existing.status) && nextStatus !== 'Draft' && moduleContentChanged(existing, req.body, req.file)) {
      await conn.rollback();
      return res.status(409).json({ error: `This module is ${existing.status}, so its content cannot change. Set its status to Draft to edit it; it will need approval again.` });
    }
    // MIPM-220: approving or publishing is an electronic signature — password and
    // reason — as it is for documents and FAQs. Modules took it from a dropdown.
    const signing = ['Approved', 'Published'].includes(nextStatus) && nextStatus !== existing.status;
    if (signing) {
      const { esign_password: password, esign_reason: reason } = req.body;
      if (!password || !String(reason || '').trim()) {
        await conn.rollback();
        return res.status(400).json({ error: `Your password and a reason are required to save a module as ${nextStatus}.` });
      }
      const [[signer]] = await pool.execute('SELECT password FROM users WHERE id = ?', [req.user.userId]);
      if (!signer?.password || !(await bcrypt.compare(String(password), signer.password))) {
        await conn.rollback();
        return res.status(401).json({ error: 'Incorrect password. Electronic signature rejected.' });
      }
    }
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

    if (signing) {
      const versionStr = `${updated.version_major || 1}.${updated.version_minor || 0}`;
      await addVersionHistory('module', updated.id, versionStr, nextStatus, String(req.body.esign_reason).trim(), req.user.userId);
    }

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
    return res.status(500).json({ error: err.message || 'Server error.', code: err.code || null });
  } finally {
    conn.release();
  }
});

// POST /api/cm/modules/:id/archive — archive module + cascade archive linked docs
router.post('/modules/:id/archive', authenticate, async (req, res) => {
  try {
    await ensureCmModulesSchema();
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
    return res.status(500).json({ error: err.message || 'Server error.', code: err.code || null });
  }
});

module.exports = router;
