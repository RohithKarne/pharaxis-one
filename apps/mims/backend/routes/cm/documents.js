'use strict';

/**
 * cm/documents.js — Content Management Documents API
 * Full document lifecycle: Draft → CheckedOut → Pending → Under Review → Approved → Published → Archived
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { validateUpload } = require('../../middleware/uploadValidation');
const bcrypt = require('bcrypt');
const { logger } = require('../../services/logger');
const { enforceEvidenceGate } = require('../../services/contentIntelligenceService');

const multer = require('multer');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
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
const uploadFields = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'source_attachments', maxCount: 20 },
]);

// ── CM-T1: assembled_html in-process cache ────────────────────────────────────
// Key: `${docId}:${sortedModuleIds}:${moduleVersions}` — invalidated by version change
const _assembledCache = new Map();
const ASSEMBLED_TTL_MS = 10 * 60 * 1000; // 10-minute safety TTL

function _assembledCacheGet(key) {
  const e = _assembledCache.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) { _assembledCache.delete(key); return undefined; }
  return e.value;
}

function _assembledCacheSet(key, value) {
  _assembledCache.set(key, { value, expiresAt: Date.now() + ASSEMBLED_TTL_MS });
}

/** Call on document save / module update to invalidate a document's assembled cache. */
function invalidateAssembledCache(docId) {
  for (const k of _assembledCache.keys()) {
    if (k.startsWith(`${docId}:`)) _assembledCache.delete(k);
  }
}

async function logDocumentActivity(docId, userId, userName, action, details) {
  try {
    await pool.execute(
      `INSERT INTO cm_document_activity_log (doc_id, user_id, user_name, action, details) VALUES (?,?,?,?,?)`,
      [docId, userId || null, userName || null, action, details ? JSON.stringify(details) : null]
    );
  } catch (_) {}
}

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

function hasPlatformAdminScope(req) {
  return hasGlobalAdminScope(req.user);
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

function normalizeAuthoringSource(value, responseDocType = 'File') {
  const normalizedResponseType = String(responseDocType || 'File').trim();
  if (normalizedResponseType === 'Module') return 'module';

  const key = String(value || '').trim().toLowerCase();
  if (['m365', 'microsoft', 'microsoft365', 'office365'].includes(key)) return 'microsoft365';
  if (['internal', 'online', 'richtext', 'editor'].includes(key)) return 'internal';
  return 'upload';
}

function normalizeOptionalString(value, maxLength = null) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function normalizeOptionalUrl(value) {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch (_) {
    return null;
  }
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

async function getScopedDocument(req, documentId) {
  const [rows] = await pool.execute(
    hasPlatformAdminScope(req)
      ? `SELECT d.*, f.org_id AS folder_org_id
         FROM cm_documents d
         INNER JOIN cm_folders f ON d.folder_id = f.id
         WHERE d.id = ?`
      : `SELECT d.*, f.org_id AS folder_org_id
         FROM cm_documents d
         INNER JOIN cm_folders f ON d.folder_id = f.id
         WHERE d.id = ? AND f.org_id = ?`,
    hasPlatformAdminScope(req) ? [documentId] : [documentId, req.user.orgId]
  );
  return rows[0] || null;
}

async function getScopedFaq(req, faqId) {
  const [rows] = await pool.execute(
    hasPlatformAdminScope(req)
      ? `SELECT f.*, fo.org_id AS folder_org_id
         FROM cm_faqs f
         INNER JOIN cm_folders fo ON f.folder_id = fo.id
         WHERE f.id = ?`
      : `SELECT f.*, fo.org_id AS folder_org_id
         FROM cm_faqs f
         INNER JOIN cm_folders fo ON f.folder_id = fo.id
         WHERE f.id = ? AND fo.org_id = ?`,
    hasPlatformAdminScope(req) ? [faqId] : [faqId, req.user.orgId]
  );
  return rows[0] || null;
}

async function getScopedModule(req, moduleId) {
  const [rows] = await pool.execute(
    hasPlatformAdminScope(req)
      ? `SELECT m.*, f.org_id AS folder_org_id
         FROM cm_modules m
         INNER JOIN cm_folders f ON m.folder_id = f.id
         WHERE m.id = ?`
      : `SELECT m.*, f.org_id AS folder_org_id
         FROM cm_modules m
         INNER JOIN cm_folders f ON m.folder_id = f.id
         WHERE m.id = ? AND f.org_id = ?`,
    hasPlatformAdminScope(req) ? [moduleId] : [moduleId, req.user.orgId]
  );
  return rows[0] || null;
}

async function getScopedCase(req, caseId) {
  const [rows] = await pool.execute(
    hasPlatformAdminScope(req)
      ? 'SELECT id, org_id FROM cases WHERE id = ?'
      : 'SELECT id, org_id FROM cases WHERE id = ? AND org_id = ?',
    hasPlatformAdminScope(req) ? [caseId] : [caseId, req.user.orgId]
  );
  return rows[0] || null;
}

async function isUserInOrg(userId, orgId) {
  const [[row]] = await pool.execute(
    `SELECT u.id
     FROM users u
     JOIN user_org_access uoa ON uoa.user_id = u.id
     WHERE u.id = ? AND uoa.org_id = ? AND uoa.is_active = 1
     LIMIT 1`,
    [userId, orgId]
  );
  return !!row;
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

    if (!hasPlatformAdminScope(req)) {
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
      query += ' AND (d.name LIKE ? OR d.doc_id LIKE ? OR d.search_tags LIKE ? OR d.document_category LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (req.query.category) {
      query += ' AND d.document_category = ?';
      params.push(req.query.category);
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
    logger.error({ err, route: '/api/cm/documents', user_id: req.user?.userId, org_id: req.user?.orgId }, 'Failed to list CM documents');
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
      authoring_source, external_provider, external_document_url, external_share_url,
      external_document_id, external_drive_id, external_account_email, external_api_endpoint,
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
    const normalizedResponseDocType = response_doc_type || 'File';
    const normalizedAuthoringSource = normalizeAuthoringSource(authoring_source, normalizedResponseDocType);
    const normalizedExternalDocumentUrl = normalizeOptionalUrl(external_document_url);
    const normalizedExternalShareUrl = normalizeOptionalUrl(external_share_url);

    if (normalizedAuthoringSource === 'microsoft365' && !normalizedExternalDocumentUrl && !normalizedExternalShareUrl) {
      await conn.rollback();
      return res.status(400).json({ error: 'Microsoft 365 authoring requires an edit URL or share URL.' });
    }

    const filePath = normalizedAuthoringSource === 'upload' && primaryFile ? primaryFile.path : null;
    const fileName = normalizedAuthoringSource === 'upload' && primaryFile ? primaryFile.originalname : null;
    const fileSize = normalizedAuthoringSource === 'upload' && primaryFile ? primaryFile.size : null;
    const fileMime = normalizedAuthoringSource === 'upload' && primaryFile ? primaryFile.mimetype : null;
    const effectiveContentHtml = normalizedAuthoringSource === 'internal' ? (content_html || null) : null;
    const normalizedExternalProvider = normalizedAuthoringSource === 'microsoft365'
      ? normalizeOptionalString(external_provider, 30) || 'microsoft'
      : null;
    const normalizedExternalDocumentId = normalizedAuthoringSource === 'microsoft365'
      ? normalizeOptionalString(external_document_id, 255)
      : null;
    const normalizedExternalDriveId = normalizedAuthoringSource === 'microsoft365'
      ? normalizeOptionalString(external_drive_id, 255)
      : null;
    const normalizedExternalAccountEmail = normalizedAuthoringSource === 'microsoft365'
      ? normalizeOptionalString(external_account_email, 255)
      : null;
    const normalizedExternalApiEndpoint = normalizedAuthoringSource === 'microsoft365'
      ? normalizeOptionalString(external_api_endpoint, 500)
      : null;

    const [result] = await conn.execute(
      `INSERT INTO cm_documents
         (doc_id, folder_id, doc_type, response_doc_type, name, content_html, file_path, file_name, file_size, file_mime,
          status, version_major, version_minor, expiry_date, activation_date, language,
          is_product_specific, is_site_specific, search_tags, usage_instructions,
          publish_as_pdf, send_as_pdf, selected_modules, attributes,
          mi_category_id, document_category, standard_response_text, authoring_source,
          external_provider, external_document_url, external_share_url, external_document_id,
          external_drive_id, external_account_email, external_api_endpoint, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', 1, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docId, folder_id, doc_type || 'SRD', normalizedResponseDocType, name.trim(), effectiveContentHtml,
        filePath, fileName, fileSize, fileMime,
        expiry_date || null, activation_date || null, language || 'en',
        is_product_specific ? 1 : 0, is_site_specific ? 1 : 0,
        search_tags || null, usage_instructions || null,
        publish_as_pdf ? 1 : 0, send_as_pdf ? 1 : 0,
        parsedSelectedModules.length ? JSON.stringify(parsedSelectedModules) : null,
        attributes ? JSON.stringify(attributes) : null,
        mi_category_id || null, document_category || null, standard_response_text || null,
        normalizedAuthoringSource,
        normalizedExternalProvider, normalizedExternalDocumentUrl, normalizedExternalShareUrl,
        normalizedExternalDocumentId, normalizedExternalDriveId, normalizedExternalAccountEmail, normalizedExternalApiEndpoint,
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
    logger.error({ err, route: '/api/cm/documents', user_id: req.user?.userId, org_id: req.user?.orgId }, 'Failed to create CM document');
    res.status(500).json({ error: 'Server error.' });
  } finally {
    conn.release();
  }
});

// GET /api/cm/documents/search — full-text document search (must be before /:id)
router.get('/documents/search', authenticate, async (req, res) => {
  try {
    const { q, folder_id, status } = req.query;
    if (!q || q.trim().length < 2) return res.status(400).json({ error: 'Query must be at least 2 characters' });
    let query = `SELECT d.id, d.doc_id, d.name, d.folder_id, d.status, d.response_doc_type, d.version_major, d.version_minor, d.created_at,
      MATCH(d.name, d.content_html) AGAINST(? IN NATURAL LANGUAGE MODE) AS relevance
      FROM cm_documents d
      LEFT JOIN cm_folders f ON d.folder_id = f.id
      WHERE MATCH(d.name, d.content_html) AGAINST(? IN NATURAL LANGUAGE MODE)`;
    const params = [q, q];
    if (!hasPlatformAdminScope(req)) {
      query += ` AND f.org_id = ?`;
      params.push(req.user.orgId);
    }
    if (folder_id) { query += ` AND d.folder_id = ?`; params.push(folder_id); }
    if (status) { query += ` AND d.status = ?`; params.push(status); }
    query += ` ORDER BY relevance DESC LIMIT 50`;
    const [rows] = await pool.execute(query, params);
    res.json({ documents: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/cm/documents/:id — get document with version history
router.get('/documents/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const [[doc]] = await pool.execute(
      hasPlatformAdminScope(req)
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
      hasPlatformAdminScope(req) ? [id] : [id, req.user.orgId]
    );
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    const [versions] = await pool.execute(
      `SELECT vh.*, u.name AS author_name
       FROM cm_version_history vh
       LEFT JOIN users u ON vh.author_id = u.id
       WHERE vh.entity_type = 'document' AND vh.entity_id = ?
       ORDER BY vh.created_at DESC
       LIMIT 5`,
      [id]
    );

    let assembled_html = null;
    if (doc.response_doc_type === 'Module') {
      const moduleIds = parseSelectedModules(doc.selected_modules);
      if (moduleIds.length > 0) {
        const placeholders = moduleIds.map(() => '?').join(',');
        // Fetch with version info for cache key
        const [moduleRows] = await pool.execute(
          `SELECT id, content_html, version_major, version_minor FROM cm_modules WHERE id IN (${placeholders})`,
          moduleIds
        );
        const sortedIds = [...moduleIds].sort((a, b) => a - b);
        const versionSig = sortedIds
          .map(mid => { const m = moduleRows.find(r => r.id === mid); return m ? `${mid}:${m.version_major}.${m.version_minor}` : `${mid}:0`; })
          .join(',');
        const cacheKey = `${doc.id}:${moduleIds.join(',')}:${versionSig}`;
        const cached = _assembledCacheGet(cacheKey);
        if (cached !== undefined) {
          assembled_html = cached;
        } else {
          const moduleMap = Object.fromEntries(moduleRows.map(m => [m.id, m.content_html || '']));
          assembled_html = moduleIds.map(mid => moduleMap[mid] || '').join('\n');
          _assembledCacheSet(cacheKey, assembled_html);
        }
      }
    }

    res.json({ document: { ...doc, assembled_html }, versions });
  } catch (err) {
    logger.error({ err, route: '/api/cm/documents/:id', document_id: req.params?.id, user_id: req.user?.userId }, 'Failed to fetch CM document');
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
      authoring_source, external_provider, external_document_url, external_share_url,
      external_document_id, external_drive_id, external_account_email, external_api_endpoint,
    } = req.body;
    const parsedSelectedModules = selected_modules !== undefined
      ? parseSelectedModules(selected_modules)
      : null;

    const primaryFile = req.files && req.files['file'] ? req.files['file'][0] : null;
    const normalizedResponseDocType = response_doc_type || doc.response_doc_type || 'File';
    const normalizedAuthoringSource = normalizeAuthoringSource(
      authoring_source !== undefined ? authoring_source : doc.authoring_source,
      normalizedResponseDocType
    );
    const normalizedExternalDocumentUrl = normalizeOptionalUrl(
      external_document_url !== undefined ? external_document_url : doc.external_document_url
    );
    const normalizedExternalShareUrl = normalizeOptionalUrl(
      external_share_url !== undefined ? external_share_url : doc.external_share_url
    );

    if (normalizedAuthoringSource === 'microsoft365' && !normalizedExternalDocumentUrl && !normalizedExternalShareUrl) {
      await conn.rollback();
      return res.status(400).json({ error: 'Microsoft 365 authoring requires an edit URL or share URL.' });
    }

    const filePath = normalizedAuthoringSource === 'upload'
      ? (primaryFile ? primaryFile.path : doc.file_path)
      : null;
    const fileName = normalizedAuthoringSource === 'upload'
      ? (primaryFile ? primaryFile.originalname : doc.file_name)
      : null;
    const fileSize = normalizedAuthoringSource === 'upload'
      ? (primaryFile ? primaryFile.size : doc.file_size)
      : null;
    const fileMime = normalizedAuthoringSource === 'upload'
      ? (primaryFile ? primaryFile.mimetype : doc.file_mime)
      : null;
    const effectiveContentHtml = normalizedAuthoringSource === 'internal'
      ? (content_html !== undefined ? content_html : doc.content_html)
      : null;
    const normalizedExternalProvider = normalizedAuthoringSource === 'microsoft365'
      ? normalizeOptionalString(external_provider !== undefined ? external_provider : doc.external_provider, 30) || 'microsoft'
      : null;
    const normalizedExternalDocumentId = normalizedAuthoringSource === 'microsoft365'
      ? normalizeOptionalString(external_document_id !== undefined ? external_document_id : doc.external_document_id, 255)
      : null;
    const normalizedExternalDriveId = normalizedAuthoringSource === 'microsoft365'
      ? normalizeOptionalString(external_drive_id !== undefined ? external_drive_id : doc.external_drive_id, 255)
      : null;
    const normalizedExternalAccountEmail = normalizedAuthoringSource === 'microsoft365'
      ? normalizeOptionalString(external_account_email !== undefined ? external_account_email : doc.external_account_email, 255)
      : null;
    const normalizedExternalApiEndpoint = normalizedAuthoringSource === 'microsoft365'
      ? normalizeOptionalString(external_api_endpoint !== undefined ? external_api_endpoint : doc.external_api_endpoint, 500)
      : null;

    await conn.execute(
      `UPDATE cm_documents SET
         folder_id = ?, doc_type = ?, name = ?, content_html = ?,
         file_path = ?, file_name = ?, file_size = ?, file_mime = ?,
         expiry_date = ?, activation_date = ?, language = ?,
         is_product_specific = ?, is_site_specific = ?,
         search_tags = ?, usage_instructions = ?, attributes = ?,
         response_doc_type = ?, publish_as_pdf = ?, send_as_pdf = ?,
         selected_modules = ?, mi_category_id = ?, document_category = ?,
         standard_response_text = ?, authoring_source = ?, external_provider = ?,
         external_document_url = ?, external_share_url = ?, external_document_id = ?,
         external_drive_id = ?, external_account_email = ?, external_api_endpoint = ?,
         updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        folder_id || doc.folder_id, doc_type || doc.doc_type, name || doc.name,
        effectiveContentHtml,
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
        normalizedAuthoringSource, normalizedExternalProvider,
        normalizedExternalDocumentUrl, normalizedExternalShareUrl, normalizedExternalDocumentId,
        normalizedExternalDriveId, normalizedExternalAccountEmail, normalizedExternalApiEndpoint,
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
    invalidateAssembledCache(Number(id)); // CM-T1: flush assembled_html cache on save
    res.json({ message: 'Document updated.' });
  } catch (err) {
    await conn.rollback();
    logger.error({ err, route: '/api/cm/documents/:id', document_id: req.params?.id, user_id: req.user?.userId }, 'Failed to update CM document');
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
      "UPDATE cm_documents SET status = 'CheckedOut', checked_out_by = ?, checked_out_at = NOW(), checkout_expires_at = DATE_ADD(NOW(), INTERVAL 2 HOUR), updated_at = NOW() WHERE id = ?",
      [req.user.userId, id]
    );
    await audit(req.user.userId, req.user.email, 'CHECKOUT', 'cm_document', Number(id), { doc_id: doc.doc_id });
    res.json({ message: 'Document checked out.' });
  } catch (err) {
    logger.error({ err, route: '/api/cm/documents/:id/checkout', document_id: req.params?.id, user_id: req.user?.userId }, 'Failed to checkout CM document');
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
    logger.error({ err, route: '/api/cm/documents/:id/checkin', document_id: req.params?.id, user_id: req.user?.userId }, 'Failed to checkin CM document');
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
    logger.error({ err, route: '/api/cm/documents/:id/initiate-review', document_id: req.params?.id, user_id: req.user?.userId }, 'Failed to initiate CM review');
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
    logger.error({ err, route: '/api/cm/documents/:id/approve', document_id: req.params?.id, user_id: req.user?.userId }, 'Failed to approve CM document');
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

    const evidenceGate = await enforceEvidenceGate({
      orgId: doc.folder_org_id || req.user.orgId,
      contentType: 'document',
      contentId: Number(id),
      mode: 'publish',
      actorUserId: req.user.userId,
      metadata: {
        route: '/api/cm/documents/:id/publish',
        reason: reason || null,
      },
    });
    if (!evidenceGate.allow) {
      return res.status(422).json({
        error: 'Evidence Chain Compiler blocked this publish request.',
        run_id: evidenceGate.run_id,
        evidence: evidenceGate.result,
      });
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
    logger.error({ err, route: '/api/cm/documents/:id/publish', document_id: req.params?.id, user_id: req.user?.userId }, 'Failed to publish CM document');
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
    logger.error({ err, route: '/api/cm/documents/:id/archive', document_id: req.params?.id, user_id: req.user?.userId }, 'Failed to archive CM document');
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
    logger.error({ err, route: '/api/cm/documents/:id/release', document_id: req.params?.id, user_id: req.user?.userId }, 'Failed to release CM document');
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
    const doc = await getScopedDocument(req, req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
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
    const doc = await getScopedDocument(req, req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    if (!hasPlatformAdminScope(req) && !await isUserInOrg(user_id, req.user.orgId)) {
      return res.status(403).json({ error: 'User does not belong to your organisation.' });
    }
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
    const doc = await getScopedDocument(req, req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    await pool.execute(
      'DELETE FROM cm_document_alert_subs WHERE id = ? AND document_id = ?',
      [req.params.sub_id, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cm/documents/:id/versions — paginated version history (CM-T3)
router.get('/documents/:id/versions', authenticate, async (req, res) => {
  try {
    const doc = await getScopedDocument(req, req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;
    const [versions] = await pool.execute(
      `SELECT * FROM cm_version_history WHERE entity_type = 'document' AND entity_id = ?
       ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      [req.params.id]
    );
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) as total FROM cm_version_history WHERE entity_type = 'document' AND entity_id = ?`,
      [req.params.id]
    );
    res.json({ versions, total, page, limit });
  } catch (err) {
    logger.error({ err, route: '/api/cm/documents/:id/versions', document_id: req.params?.id, user_id: req.user?.userId }, 'Failed to fetch CM document versions');
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/documents/:id/version-diff — compare two versions (CM-E2)
router.get('/documents/:id/version-diff', authenticate, async (req, res) => {
  try {
    const doc = await getScopedDocument(req, req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    const { v1, v2 } = req.query;
    if (!v1 || !v2) return res.status(400).json({ error: 'v1 and v2 version params required' });
    const [versions] = await pool.execute(
      `SELECT vh.id, vh.version, vh.status, vh.notes, vh.created_at, vh.author_id
       FROM cm_version_history vh
       WHERE vh.entity_type = 'document' AND vh.entity_id = ?
         AND vh.version IN (?,?)
       ORDER BY vh.created_at ASC`,
      [req.params.id, v1, v2]
    );
    if (versions.length < 2) {
      return res.status(404).json({ error: 'One or both versions not found in history' });
    }
    res.json({ version_a: versions[0], version_b: versions[1] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cm/documents/release-stale-checkouts — auto-release expired checkouts (CM-E4 + CM-T6)
router.post('/documents/release-stale-checkouts', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const [result] = hasPlatformAdminScope(req)
      ? await pool.execute(
        `UPDATE cm_documents
         SET checked_out_by = NULL, checked_out_at = NULL, checkout_expires_at = NULL
         WHERE checked_out_by IS NOT NULL
           AND checkout_expires_at IS NOT NULL
           AND checkout_expires_at < NOW()`
      )
      : await pool.execute(
        `UPDATE cm_documents d
         JOIN cm_folders f ON d.folder_id = f.id
         SET d.checked_out_by = NULL, d.checked_out_at = NULL, d.checkout_expires_at = NULL
         WHERE d.checked_out_by IS NOT NULL
           AND d.checkout_expires_at IS NOT NULL
           AND d.checkout_expires_at < NOW()
           AND f.org_id = ?`,
        [req.user.orgId]
      );
    res.json({ success: true, released: result.affectedRows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cm/documents/bulk — bulk publish or archive documents
router.post('/documents/bulk', authenticate, async (req, res) => {
  try {
    const { action, ids } = req.body;
    if (!['publish', 'archive'].includes(action)) return res.status(400).json({ error: 'action must be publish or archive.' });
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array is required.' });

    const newStatus = action === 'publish' ? 'Published' : 'Archived';
    const results = { success: [], failed: [] };

    for (const rawId of ids) {
      const docId = parseInt(rawId, 10);
      if (!docId) { results.failed.push({ id: rawId, reason: 'Invalid id' }); continue; }

      const doc = await getScopedDocument(req, docId);
      if (!doc) { results.failed.push({ id: docId, reason: 'Not found or access denied' }); continue; }

      if (action === 'publish') {
        const allowedForPublish = ['Approved', 'Under Review'];
        if (!allowedForPublish.includes(doc.status)) {
          results.failed.push({ id: docId, reason: `Cannot publish from status: ${doc.status}` }); continue;
        }
        if (doc.owner_user_id && doc.owner_user_id !== req.user.userId && req.user.role !== 'admin' && !hasPlatformAdminScope(req)) {
          results.failed.push({ id: docId, reason: 'Owner lock — not your document' }); continue;
        }

        const evidenceGate = await enforceEvidenceGate({
          orgId: doc.folder_org_id || req.user.orgId,
          contentType: 'document',
          contentId: Number(docId),
          mode: 'publish',
          actorUserId: req.user.userId,
          metadata: { route: '/api/cm/documents/bulk', action: 'publish' },
        });
        if (!evidenceGate.allow) {
          results.failed.push({
            id: docId,
            reason: evidenceGate.result?.blockers?.[0] || 'Evidence gate blocked publish.',
            run_id: evidenceGate.run_id,
          });
          continue;
        }
      }

      await pool.execute(
        'UPDATE cm_documents SET status = ?, updated_by = ?, updated_at = NOW() WHERE id = ?',
        [newStatus, req.user.userId, docId]
      );
      await audit(req.user.userId, req.user.email, action.toUpperCase(), 'cm_document', docId, { bulk: true, status: newStatus });
      results.success.push(docId);
    }

    res.json({ message: `Bulk ${action} complete.`, success: results.success.length, failed: results.failed });
  } catch (err) {
    logger.error({ err }, 'POST /cm/documents/bulk error');
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/content-usage — log that a document/faq/module was used in an MI response
router.post('/content-usage', authenticate, async (req, res) => {
  try {
    const { content_type, content_id, case_id, response_id } = req.body;
    if (!content_type || !content_id || !case_id) {
      return res.status(400).json({ error: 'content_type, content_id, and case_id are required.' });
    }
    if (!['document', 'faq', 'module'].includes(content_type)) {
      return res.status(400).json({ error: 'content_type must be document, faq, or module.' });
    }
    const scopedCase = await getScopedCase(req, case_id);
    if (!scopedCase) return res.status(404).json({ error: 'Case not found for active organisation.' });
    if (content_type === 'document') {
      const doc = await getScopedDocument(req, content_id);
      if (!doc) return res.status(404).json({ error: 'Document not found for active organisation.' });
    } else if (content_type === 'faq') {
      const faq = await getScopedFaq(req, content_id);
      if (!faq) return res.status(404).json({ error: 'FAQ not found for active organisation.' });
    } else if (content_type === 'module') {
      const module = await getScopedModule(req, content_id);
      if (!module) return res.status(404).json({ error: 'Module not found for active organisation.' });
    }
    await pool.execute(
      `INSERT INTO cm_content_usage (content_type, content_id, case_id, response_id, used_by)
       VALUES (?, ?, ?, ?, ?)`,
      [content_type, content_id, scopedCase.id, response_id || null, req.user.userId]
    );
    res.status(201).json({ message: 'Usage logged.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/content-usage/:contentType/:contentId — usage history for a content item
router.get('/content-usage/:contentType/:contentId', authenticate, async (req, res) => {
  try {
    const { contentType, contentId } = req.params;
    if (!['document', 'faq', 'module'].includes(contentType)) {
      return res.status(400).json({ error: 'Invalid contentType.' });
    }
    if (!hasPlatformAdminScope(req)) {
      if (contentType === 'document') {
        const doc = await getScopedDocument(req, contentId);
        if (!doc) return res.status(404).json({ error: 'Document not found for active organisation.' });
      } else if (contentType === 'faq') {
        const faq = await getScopedFaq(req, contentId);
        if (!faq) return res.status(404).json({ error: 'FAQ not found for active organisation.' });
      } else if (contentType === 'module') {
        const module = await getScopedModule(req, contentId);
        if (!module) return res.status(404).json({ error: 'Module not found for active organisation.' });
      }
    }
    const [rows] = await pool.execute(
      `SELECT cu.*, c.case_number, u.name AS used_by_name
       FROM cm_content_usage cu
       LEFT JOIN cases c ON c.id = cu.case_id
       LEFT JOIN users u ON u.id = cu.used_by
       WHERE cu.content_type = ? AND cu.content_id = ?
       ${hasPlatformAdminScope(req) ? '' : 'AND c.org_id = ?'}
       ORDER BY cu.used_at DESC
       LIMIT 100`,
      hasPlatformAdminScope(req) ? [contentType, contentId] : [contentType, contentId, req.user.orgId]
    );
    res.json({ usage: rows, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/documents/module-usage/:moduleId — module usage report (CM-E7)
router.get('/documents/module-usage/:moduleId', authenticate, async (req, res) => {
  try {
    const moduleId = parseInt(req.params.moduleId);
    if (!moduleId) return res.status(400).json({ error: 'Invalid moduleId' });
    const module = await getScopedModule(req, moduleId);
    if (!module) return res.status(404).json({ error: 'Module not found for active organisation.' });
    const [docs] = await pool.execute(
      `SELECT d.id, d.doc_id, d.name, d.status, d.version_major, d.version_minor, d.updated_at
       FROM cm_documents d
       JOIN cm_folders f ON d.folder_id = f.id
       WHERE response_doc_type = 'Module'
         AND d.selected_modules IS NOT NULL
         AND JSON_CONTAINS(d.selected_modules, CAST(? AS JSON))
         ${hasPlatformAdminScope(req) ? '' : 'AND f.org_id = ?'}`,
      hasPlatformAdminScope(req) ? [String(moduleId)] : [String(moduleId), req.user.orgId]
    );
    res.json({ module_id: moduleId, linked_documents: docs, count: docs.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/cm/documents/:id/download — serve the stored file as a download attachment
router.get('/documents/:id/download', authenticate, async (req, res) => {
  try {
    const [[doc]] = await pool.execute(
      `SELECT d.file_path, d.file_name, d.file_mime, f.org_id
       FROM cm_documents d
       JOIN cm_folders f ON f.id = d.folder_id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    const isSA = hasGlobalAdminScope(req.user);
    if (!isSA && doc.org_id !== req.user.orgId) return res.status(403).json({ error: 'Forbidden.' });
    if (!doc.file_path) return res.status(404).json({ error: 'No file attached to this document.' });
    const absPath = path.isAbsolute(doc.file_path)
      ? doc.file_path
      : path.join(__dirname, '../../', doc.file_path);
    const mime = doc.file_mime || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name || 'document'}"`);
    res.sendFile(absPath, err => {
      if (err && !res.headersSent) res.status(500).json({ error: 'Could not serve file.' });
    });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/cm/documents/:id/file — serve the stored file inline (for in-app preview)
router.get('/documents/:id/file', authenticate, async (req, res) => {
  try {
    const [[doc]] = await pool.execute(
      `SELECT d.file_path, d.file_name, d.file_mime, f.org_id
       FROM cm_documents d
       JOIN cm_folders f ON f.id = d.folder_id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (!doc) return res.status(404).json({ error: 'Document not found.' });

    // Org scope check (platform-admin bypasses)
    const isSA = hasGlobalAdminScope(req.user);
    if (!isSA && doc.org_id !== req.user.orgId) return res.status(403).json({ error: 'Forbidden.' });

    if (!doc.file_path) return res.status(404).json({ error: 'No file attached to this document.' });

    const absPath = path.isAbsolute(doc.file_path)
      ? doc.file_path
      : path.join(__dirname, '../../', doc.file_path);

    const mime = doc.file_mime || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename="${doc.file_name || 'document'}"`);
    res.sendFile(absPath, err => {
      if (err) {
        console.error('GET /cm/documents/:id/file sendFile error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Could not serve file.' });
      }
    });
  } catch (err) {
    console.error('GET /cm/documents/:id/file error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/documents/:id/activity — paginated activity log
router.get('/documents/:id/activity', authenticate, async (req, res) => {
  try {
    const doc = await getScopedDocument(req, req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const [logs] = await pool.execute(
      `SELECT * FROM cm_document_activity_log WHERE doc_id = ? ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      [req.params.id]
    );
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) as total FROM cm_document_activity_log WHERE doc_id = ?`,
      [req.params.id]
    );
    res.json({ logs, total, page, limit });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/cm/documents/:id/view — log document view to cm_content_view_log (#11)
router.post('/documents/:id/view', authenticate, async (req, res) => {
  try {
    const doc = await getScopedDocument(req, req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found.' });
    await pool.execute(
      `INSERT INTO cm_content_view_log (entity_type, entity_id, user_id, user_name, ip_address)
       VALUES ('document', ?, ?, ?, ?)`,
      [req.params.id, req.user.userId || null, req.user.name || req.user.email || null, req.ip || null]
    ).catch(() => {});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/cm/documents/:id/clone — duplicate document as Draft (#8)
router.post('/documents/:id/clone', authenticate, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const src = await getScopedDocument(req, req.params.id);
    if (!src) return res.status(404).json({ error: 'Document not found.' });

    await conn.beginTransaction();
    const newDocId = await generateDocId(conn);
    const [result] = await conn.execute(
      `INSERT INTO cm_documents
         (doc_id, folder_id, doc_type, response_doc_type, name, content_html,
          status, version_major, version_minor, expiry_date, activation_date, language,
          is_product_specific, is_site_specific, search_tags, usage_instructions,
          publish_as_pdf, send_as_pdf, selected_modules, attributes,
          mi_category_id, document_category, standard_response_text, authoring_source,
          external_provider, external_document_url, external_share_url, external_document_id,
          external_drive_id, external_account_email, external_api_endpoint, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'Draft', 1, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newDocId, src.folder_id, src.doc_type, src.response_doc_type,
        `Copy of ${src.name}`, src.content_html,
        src.expiry_date || null, src.activation_date || null, src.language || 'en',
        src.is_product_specific || 0, src.is_site_specific || 0,
        src.search_tags || null, src.usage_instructions || null,
        src.publish_as_pdf || 0, src.send_as_pdf || 0,
        src.selected_modules || null, src.attributes || null,
        src.mi_category_id || null, src.document_category || null, src.standard_response_text || null,
        src.authoring_source || 'internal',
        src.external_provider || null, src.external_document_url || null, src.external_share_url || null,
        src.external_document_id || null, src.external_drive_id || null,
        src.external_account_email || null, src.external_api_endpoint || null,
        req.user.userId,
      ]
    );
    await conn.commit();
    await audit(req.user.userId, req.user.email, 'CLONE', 'cm_document', result.insertId, { source_id: src.id, source_name: src.name });
    res.status(201).json({ message: 'Document cloned.', id: result.insertId, doc_id: newDocId });
  } catch (err) {
    await conn.rollback();
    console.error('POST /cm/documents/:id/clone error:', err);
    res.status(500).json({ error: 'Server error.' });
  } finally {
    conn.release();
  }
});

module.exports = router;
