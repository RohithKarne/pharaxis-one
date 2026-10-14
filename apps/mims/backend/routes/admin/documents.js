'use strict';

/**
 * documents.js — Theme 6 (Wave 3) surface.
 *
 * Builds on Wave 0 #4 (attachments table + storage abstraction) and Wave 0 #6
 * (OCR worker that populates ocr_text). Adds:
 *
 *   (The search and recent-uploads routes were removed in the access review,
 *   2026-10-14: nothing called them, and the search returned the scanned text
 *   of every case's attachments to anyone in the organisation.)
 *
 *   GET  /api/cases/:caseId/attachments
 *        Convenience alias: all attachments for a case, grouped by field_name.
 *
 *   POST /api/cases/:caseId/attachments/reorder
 *        Body { field, attachment_ids: [...] } — persists display order via
 *        a small JSON column on the case (case_attachment_order). For now we
 *        store the order in the attachments row via the existing uploaded_at;
 *        a dedicated column can come in a later migration if needed.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate } = require('../../middleware/auth');

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
