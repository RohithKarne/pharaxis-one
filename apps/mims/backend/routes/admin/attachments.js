'use strict';

/**
 * attachments.js — generic file upload / download / list / delete.
 *
 * Wave 0 piece #4. Used by all themes that need to attach files:
 *   - Theme 1 image annotation & signature
 *   - Theme 6 per-field attachments + OCR
 *   - Case attachments, MI response files, letter templates, etc.
 *
 * Endpoints (mounted at /api):
 *   POST   /attachments                       — multipart upload (multer)
 *   GET    /attachments/:id                   — metadata
 *   GET    /attachments/:id/content           — raw bytes (streamed; signed S3 redirect or local serve)
 *   GET    /attachments/:id/thumb             — generated thumbnail (or 404)
 *   GET    /attachments?entity_type=&entity_id=&field=
 *   DELETE /attachments/:id                   — soft delete
 *   GET    /files/:orgId/:key                 — local provider raw serve (auth required)
 *
 * The actual storage + thumbnail engines live in services/fileStorageService.js
 * and services/thumbnailService.js. Swapping to S3 is config-only.
 */

const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const crypto  = require('crypto');
const path    = require('path');
const fs      = require('fs');
const pool    = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const storage = require('../../services/fileStorageService');
const thumbs  = require('../../services/thumbnailService');
const jobs    = require('../../services/jobQueueService');
const { logger } = require('../../services/logger');
const { hasGlobalAdminScope } = require('../../utils/adminScope');

const MAX_FILE_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 50 * 1024 * 1024); // 50 MB default
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_FILE_BYTES },
});

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// C-01: attachments are case source documents (AE/MI PII). Every by-id read/write/delete
// must be constrained to the caller's org rather than trusting a client-supplied id or
// :orgId. Platform (global) admins bypass the constraint.
function orgClause(req) {
  if (hasGlobalAdminScope(req.user)) return { sql: '', params: [] };
  return { sql: ' AND org_id = ?', params: [req.user.orgId] };
}

// ── POST /attachments ────────────────────────────────────────────────────────
router.post('/attachments', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file (multipart) required' });
    const { entity_type, entity_id, field_name } = req.body || {};
    if (!entity_type || !entity_id) {
      return res.status(400).json({ error: 'entity_type and entity_id required' });
    }
    const orgId = req.user.orgId ?? null;
    const buf   = req.file.buffer;
    const mt    = req.file.mimetype || 'application/octet-stream';
    const ext   = path.extname(req.file.originalname || '') || '';
    const key   = storage.generateKey(ext);

    const stored = await storage.put({ orgId, key, body: buf, contentType: mt });

    // Best-effort thumbnail (no await stall on big files)
    let thumbKey = null;
    try {
      const thumb = await thumbs.generate({ buffer: buf, mimeType: mt, width: 320 });
      if (thumb && thumb.buffer) {
        thumbKey = storage.generateKey('.jpg');
        await storage.put({ orgId, key: thumbKey, body: thumb.buffer, contentType: thumb.mimeType });
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'attachments: thumbnail generation failed (non-fatal)');
    }

    const [result] = await pool.execute(`
      INSERT INTO attachments
        (org_id, entity_type, entity_id, field_name,
         storage_provider, storage_key, thumb_key,
         original_name, mime_type, size_bytes, checksum_sha256,
         uploaded_by, ocr_status)
      VALUES (?, ?, ?, ?,  ?, ?, ?,  ?, ?, ?, ?,  ?, ?)
    `, [
      orgId, entity_type, Number(entity_id), field_name || null,
      stored.provider, stored.key, thumbKey,
      req.file.originalname, mt, buf.length, sha256(buf),
      req.user.userId,
      mt === 'application/pdf' || mt.startsWith('image/') ? 'pending' : 'skipped',
    ]);

    // Async OCR (only if pending — skipped types are short-circuited above)
    if (mt === 'application/pdf' || mt.startsWith('image/')) {
      jobs.enqueue('ocr', { attachmentId: result.insertId }).catch(err =>
        logger.warn({ err: err.message }, 'attachments: ocr enqueue failed (non-fatal)')
      );
    }

    res.json({
      id: result.insertId,
      url: `/api/attachments/${result.insertId}/content`,
      thumb_url: thumbKey ? `/api/attachments/${result.insertId}/thumb` : null,
      size: buf.length,
      mime_type: mt,
    });
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File exceeds ${MAX_FILE_BYTES} bytes` });
    }
    logger.error({ err: err.message }, 'POST /attachments failed');
    res.status(500).json({ error: err.message });
  }
});

// ── GET /attachments?entity_type=&entity_id= ─────────────────────────────────
router.get('/attachments', authenticate, async (req, res) => {
  try {
    const { entity_type, entity_id, field } = req.query || {};
    if (!entity_type || !entity_id) {
      return res.status(400).json({ error: 'entity_type and entity_id required' });
    }
    const scope = orgClause(req);
    const params = [entity_type, Number(entity_id), ...scope.params];
    let sql = `
      SELECT id, org_id, entity_type, entity_id, field_name,
             original_name, mime_type, size_bytes,
             uploaded_by, uploaded_at, ocr_status, thumb_key
        FROM attachments
       WHERE deleted_at IS NULL
         AND entity_type = ? AND entity_id = ?${scope.sql}
    `;
    if (field) { sql += ' AND field_name = ?'; params.push(field); }
    sql += ' ORDER BY uploaded_at DESC';
    const [rows] = await pool.execute(sql, params);
    res.json({ attachments: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /attachments/:id (metadata) ──────────────────────────────────────────
router.get('/attachments/:id', authenticate, async (req, res) => {
  try {
    const scope = orgClause(req);
    const [[a]] = await pool.execute(
      `SELECT * FROM attachments WHERE id = ? AND deleted_at IS NULL${scope.sql}`,
      [req.params.id, ...scope.params]
    );
    if (!a) return res.status(404).json({ error: 'Not found' });
    res.json(a);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /attachments/:id/content ─────────────────────────────────────────────
router.get('/attachments/:id/content', authenticate, async (req, res) => {
  try {
    const scope = orgClause(req);
    const [[a]] = await pool.execute(
      `SELECT org_id, storage_key, mime_type, original_name FROM attachments WHERE id = ? AND deleted_at IS NULL${scope.sql}`,
      [req.params.id, ...scope.params]
    );
    if (!a) return res.status(404).json({ error: 'Not found' });
    const { stream } = await storage.get({ orgId: a.org_id, key: a.storage_key });
    res.setHeader('Content-Type', a.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${a.original_name.replace(/"/g, '')}"`);
    stream.pipe(res);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ── GET /attachments/:id/thumb ───────────────────────────────────────────────
router.get('/attachments/:id/thumb', authenticate, async (req, res) => {
  try {
    const scope = orgClause(req);
    const [[a]] = await pool.execute(
      `SELECT org_id, thumb_key FROM attachments WHERE id = ? AND deleted_at IS NULL${scope.sql}`,
      [req.params.id, ...scope.params]
    );
    if (!a || !a.thumb_key) return res.status(404).end();
    const { stream } = await storage.get({ orgId: a.org_id, key: a.thumb_key });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    stream.pipe(res);
  } catch {
    res.status(404).end();
  }
});

// ── DELETE /attachments/:id (soft) ───────────────────────────────────────────
router.delete('/attachments/:id', authenticate, async (req, res) => {
  try {
    const scope = orgClause(req);
    const [r] = await pool.execute(
      `UPDATE attachments SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL${scope.sql}`,
      [req.params.id, ...scope.params]
    );
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /files/:orgId/:key — local provider raw serve (used by local URLs) ──
router.get('/files/:orgId/*', authenticate, async (req, res) => {
  try {
    // C-01: the :orgId path segment is attacker-controlled — only allow serving files
    // from the caller's own org (platform admins excepted).
    if (!hasGlobalAdminScope(req.user) && String(req.params.orgId) !== String(req.user.orgId)) {
      return res.status(403).end();
    }
    const key = req.params[0]; // everything after :orgId/
    // M-09: path-traversal containment — reject keys that try to escape the org's
    // storage root before delegating to storage.get.
    if (key.split('/').some((seg) => seg === '..')) return res.status(403).end();
    const { stream } = await storage.get({ orgId: req.params.orgId, key });
    stream.pipe(res);
  } catch {
    res.status(404).end();
  }
});

// ─── Sprint 2 #14 — Source-document tagging ─────────────────────────────────

// PUT /attachments/:id/document-type   body { document_type_id }
router.put('/attachments/:id/document-type', authenticate, async (req, res) => {
  try {
    const { document_type_id } = req.body || {};
    const scope = orgClause(req);
    await pool.execute(
      `UPDATE attachments SET document_type_id = ? WHERE id = ? AND deleted_at IS NULL${scope.sql}`,
      [document_type_id || null, req.params.id, ...scope.params]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /attachments/:id/source-for      body { source_for: [{section,field,entity_type,entity_id}] }
router.put('/attachments/:id/source-for', authenticate, async (req, res) => {
  try {
    const { source_for } = req.body || {};
    if (source_for != null && !Array.isArray(source_for)) {
      return res.status(400).json({ error: 'source_for must be an array' });
    }
    const scope = orgClause(req);
    await pool.execute(
      `UPDATE attachments SET source_for_json = ? WHERE id = ? AND deleted_at IS NULL${scope.sql}`,
      [source_for ? JSON.stringify(source_for) : null, req.params.id, ...scope.params]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /attachments/source-for/:entity_type/:entity_id/:field
//   → list attachments tagged as source of this specific field
router.get('/attachments/source-for/:entity_type/:entity_id/:field', authenticate, async (req, res) => {
  try {
    const { entity_type, entity_id, field } = req.params;
    const [rows] = await pool.execute(
      `SELECT a.id, a.original_name, a.mime_type, a.uploaded_at, a.document_type_id,
              dt.label AS document_type_label
         FROM attachments a
         LEFT JOIN document_types dt ON dt.id = a.document_type_id
        WHERE a.deleted_at IS NULL
          AND a.org_id = ?
          AND a.entity_type = ?
          AND a.entity_id = ?
          AND JSON_CONTAINS(COALESCE(a.source_for_json, JSON_ARRAY()),
                JSON_OBJECT('field', ?), '$')`,
      [req.user.orgId, entity_type, entity_id, field]
    );
    res.json({ attachments: rows });
  } catch (err) {
    // JSON_CONTAINS may not be available on very old MySQL; fall back to a string LIKE.
    try {
      const [rows] = await pool.execute(
        `SELECT a.id, a.original_name, a.mime_type, a.uploaded_at, a.document_type_id,
                dt.label AS document_type_label
           FROM attachments a
           LEFT JOIN document_types dt ON dt.id = a.document_type_id
          WHERE a.deleted_at IS NULL
            AND a.org_id = ?
            AND a.entity_type = ?
            AND a.entity_id = ?
            AND a.source_for_json LIKE ?`,
        [req.user.orgId, req.params.entity_type, req.params.entity_id, `%"field":"${req.params.field}"%`]
      );
      res.json({ attachments: rows });
    } catch (err2) { res.status(500).json({ error: err2.message }); }
  }
});

// POST /attachments/:id/tags   body { tag }
router.post('/attachments/:id/tags', authenticate, async (req, res) => {
  try {
    const { tag } = req.body || {};
    if (!tag || !String(tag).trim()) return res.status(400).json({ error: 'tag required' });
    await pool.execute(
      `INSERT IGNORE INTO attachment_tags (org_id, attachment_id, tag, created_by)
       VALUES (?, ?, ?, ?)`,
      [req.user.orgId, req.params.id, String(tag).trim().slice(0, 60), req.user.userId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/attachments/:id/tags/:tag', authenticate, async (req, res) => {
  try {
    await pool.execute(
      `DELETE FROM attachment_tags WHERE attachment_id = ? AND tag = ?`,
      [req.params.id, req.params.tag]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/attachments/:id/tags', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT tag, created_by, created_at FROM attachment_tags WHERE attachment_id = ? ORDER BY tag`,
      [req.params.id]
    );
    res.json({ tags: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
