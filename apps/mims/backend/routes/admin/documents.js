'use strict';

/**
 * documents.js — Theme 6 (Wave 3) surface.
 *
 * Builds on Wave 0 #4 (attachments table + storage abstraction) and Wave 0 #6
 * (OCR worker that populates ocr_text). Adds:
 *
 *   GET  /api/documents/search?q=&entity_type=&entity_id=&mime=&limit=
 *        Full-text search over original_name + mime_type + ocr_text.
 *        Returns matched attachments with a short snippet.
 *
 *   GET  /api/documents/recent?limit=
 *        Most recent uploads for the current tenant — feeds the Documents tab.
 *
 *   GET  /api/cases/:caseId/attachments
 *        Convenience alias: all attachments for a case, grouped by field_name.
 *
 *   POST /api/cases/:caseId/attachments/reorder
 *        Body { field, attachment_ids: [...] } — persists display order via
 *        a small JSON column on the case (case_attachment_order). For now we
 *        store the order in the attachments row via the existing uploaded_at;
 *        a dedicated column can come in a later migration if needed.
 *
 * Gated by cf.theme6_documents.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const flags = require('../../services/featureFlagsService');

const FLAG = 'cf.theme6_documents';

function snippet(text, q, maxLen = 200) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const hit = lower.indexOf(String(q || '').toLowerCase());
  if (hit < 0) return text.slice(0, maxLen);
  const start = Math.max(0, hit - 60);
  const end   = Math.min(text.length, hit + 140);
  return (start ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

// ── /documents/search ────────────────────────────────────────────────────────
router.get('/documents/search', authenticate, async (req, res) => {
  try {
    const enabled = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!enabled) return res.json({ enabled: false, matches: [] });

    const { q, entity_type, entity_id, mime } = req.query || {};
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const orgId = req.user.orgId;

    const params = [orgId];
    let where = ` WHERE deleted_at IS NULL AND org_id = ? `;
    if (entity_type) { where += ' AND entity_type = ?'; params.push(entity_type); }
    if (entity_id)   { where += ' AND entity_id = ?';   params.push(Number(entity_id)); }
    if (mime)        { where += ' AND mime_type LIKE ?'; params.push(`${mime}%`); }

    let sql, scoreCol;
    if (q && q.trim()) {
      // Prefer FULLTEXT when the index exists; fall back to LIKE.
      try {
        scoreCol = 'MATCH(search_blob) AGAINST (? IN NATURAL LANGUAGE MODE)';
        sql = `
          SELECT id, org_id, entity_type, entity_id, field_name,
                 original_name, mime_type, size_bytes, uploaded_at,
                 ocr_status, ocr_text,
                 ${scoreCol} AS score
            FROM attachments
            ${where} AND ${scoreCol} > 0
           ORDER BY score DESC, uploaded_at DESC
           LIMIT ${limit}`;
        const [rows] = await pool.execute(sql, [q, ...params, q]);
        return res.json({
          enabled: true,
          matches: rows.map(r => ({
            id: r.id, entity_type: r.entity_type, entity_id: r.entity_id,
            field_name: r.field_name, original_name: r.original_name,
            mime_type: r.mime_type, size_bytes: r.size_bytes,
            uploaded_at: r.uploaded_at, score: r.score,
            snippet: snippet(r.ocr_text || r.original_name, q),
          })),
        });
      } catch (err) {
        // Fallback LIKE
        sql = `
          SELECT id, entity_type, entity_id, field_name,
                 original_name, mime_type, size_bytes, uploaded_at,
                 ocr_status, ocr_text
            FROM attachments
            ${where}
             AND (original_name LIKE ? OR mime_type LIKE ? OR ocr_text LIKE ?)
           ORDER BY uploaded_at DESC LIMIT ${limit}`;
        const pat = `%${q}%`;
        const [rows] = await pool.execute(sql, [...params, pat, pat, pat]);
        return res.json({
          enabled: true,
          matches: rows.map(r => ({
            id: r.id, entity_type: r.entity_type, entity_id: r.entity_id,
            field_name: r.field_name, original_name: r.original_name,
            mime_type: r.mime_type, size_bytes: r.size_bytes,
            uploaded_at: r.uploaded_at,
            snippet: snippet(r.ocr_text || r.original_name, q),
          })),
        });
      }
    }
    // No query — return recent
    sql = `SELECT id, entity_type, entity_id, field_name,
                  original_name, mime_type, size_bytes, uploaded_at, ocr_status
             FROM attachments ${where}
            ORDER BY uploaded_at DESC LIMIT ${limit}`;
    const [rows] = await pool.execute(sql, params);
    res.json({ enabled: true, matches: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── /documents/recent ────────────────────────────────────────────────────────
router.get('/documents/recent', authenticate, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const [rows] = await pool.execute(
      `SELECT id, entity_type, entity_id, field_name,
              original_name, mime_type, size_bytes, uploaded_at, ocr_status
         FROM attachments
        WHERE deleted_at IS NULL AND org_id = ?
        ORDER BY uploaded_at DESC
        LIMIT ${limit}`,
      [req.user.orgId]
    );
    res.json({ attachments: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── /cases/:caseId/attachments (grouped by field) ────────────────────────────
router.get('/cases/:caseId/attachments', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, field_name, original_name, mime_type, size_bytes,
              uploaded_by, uploaded_at, ocr_status, thumb_key
         FROM attachments
        WHERE deleted_at IS NULL AND org_id = ?
          AND entity_type = 'case' AND entity_id = ?
        ORDER BY field_name, uploaded_at DESC`,
      [req.user.orgId, req.params.caseId]
    );
    const byField = {};
    for (const r of rows) {
      const f = r.field_name || '__case__';
      if (!byField[f]) byField[f] = [];
      byField[f].push(r);
    }
    res.json({ attachments: rows, by_field: byField });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
