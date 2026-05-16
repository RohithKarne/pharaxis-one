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

const MAX_FILE_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 50 * 1024 * 1024); // 50 MB default
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_FILE_BYTES },
});

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
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
    const params = [entity_type, Number(entity_id)];
    let sql = `
      SELECT id, org_id, entity_type, entity_id, field_name,
             original_name, mime_type, size_bytes,
             uploaded_by, uploaded_at, ocr_status, thumb_key
        FROM attachments
       WHERE deleted_at IS NULL
         AND entity_type = ? AND entity_id = ?
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
    const [[a]] = await pool.execute(
      'SELECT * FROM attachments WHERE id = ? AND deleted_at IS NULL',
      [req.params.id]
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
    const [[a]] = await pool.execute(
      'SELECT org_id, storage_key, mime_type, original_name FROM attachments WHERE id = ? AND deleted_at IS NULL',
      [req.params.id]
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
    const [[a]] = await pool.execute(
      'SELECT org_id, thumb_key FROM attachments WHERE id = ? AND deleted_at IS NULL',
      [req.params.id]
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
    const [r] = await pool.execute(
      'UPDATE attachments SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL',
      [req.params.id]
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
    const key = req.params[0]; // everything after :orgId/
    const { stream } = await storage.get({ orgId: req.params.orgId, key });
    stream.pipe(res);
  } catch {
    res.status(404).end();
  }
});

module.exports = router;
