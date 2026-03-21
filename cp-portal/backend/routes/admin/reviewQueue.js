/**
 * Review Queue — /api/admin/review-queue
 * S4-8: Returns all news + documents currently in 'review' or 'approved' status
 *
 * GET /:clientId/count  — badge count for sidebar
 * GET /:clientId        — full list for ReviewQueuePage
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');

// GET /api/admin/review-queue/:clientId/count — fast badge count
router.get('/:clientId/count', authenticateAdmin, requireClientAccess, (req, res) => {
  const clientId = req.params.clientId;
  const newsCount = db.prepare(
    "SELECT COUNT(*) as cnt FROM cp_news_posts WHERE client_id = ? AND status = 'review'"
  ).get(clientId).cnt;
  const docCount = db.prepare(
    "SELECT COUNT(*) as cnt FROM cp_documents WHERE client_id = ? AND status = 'review' AND is_active = 1"
  ).get(clientId).cnt;
  res.json({ count: newsCount + docCount });
});

// GET /api/admin/review-queue/:clientId — full queue (review + approved)
router.get('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  const clientId = req.params.clientId;

  const newsItems = db.prepare(`
    SELECT id, title, status, created_at, updated_at, 'news' as item_type, category, NULL as doc_type
    FROM cp_news_posts
    WHERE client_id = ? AND status IN ('review', 'approved')
    ORDER BY updated_at DESC
  `).all(clientId);

  const docItems = db.prepare(`
    SELECT id, title, status, created_at, updated_at, 'document' as item_type, category, doc_type
    FROM cp_documents
    WHERE client_id = ? AND status IN ('review', 'approved') AND is_active = 1
    ORDER BY updated_at DESC
  `).all(clientId);

  // Merge and sort by updated_at desc
  const items = [...newsItems, ...docItems].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  res.json({ items });
});

module.exports = router;
