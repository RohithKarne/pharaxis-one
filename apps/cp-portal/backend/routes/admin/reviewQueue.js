/**
 * Review Queue — /api/admin/review-queue
 * S4-8: Returns all news + documents currently in 'review' or 'approved' status
 *
 * GET /:clientId/count  — badge count for sidebar
 * GET /:clientId        — full list for ReviewQueuePage
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const log = require('../../utils/logger');
const workOwnership = require('../../utils/workOwnership');

// GET /api/admin/review-queue/:clientId/count — fast badge count
router.get('/:clientId/count', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const [[newsRow]] = await pool.execute(
      "SELECT COUNT(*) as cnt FROM cp_news_posts WHERE client_id = ? AND status = 'review'",
      [clientId]
    );
    const [[docRow]] = await pool.execute(
      "SELECT COUNT(*) as cnt FROM cp_documents WHERE client_id = ? AND status = 'review' AND is_active = 1",
      [clientId]
    );
    // Phase 3 row 21: clinical trials waiting for review count too.
    const [[trialRow]] = await pool.execute(
      "SELECT COUNT(*) as cnt FROM cp_clinical_trials WHERE client_id = ? AND publish_status = 'review'",
      [clientId]
    );
    // CPPM-61: how many items in the queue (awaiting review or publish) this person holds.
    const [[mineRow]] = await pool.execute(
      `SELECT (SELECT COUNT(*) FROM cp_news_posts WHERE client_id = ? AND status IN ('review', 'approved') AND owner_id = ?)
            + (SELECT COUNT(*) FROM cp_documents  WHERE client_id = ? AND status IN ('review', 'approved') AND is_active = 1 AND owner_id = ?) AS mine`,
      [clientId, req.admin.adminId, clientId, req.admin.adminId]
    );
    res.json({ count: newsRow.cnt + docRow.cnt + trialRow.cnt, mine: Number(mineRow.mine) });
  } catch (err) {
    log.error('admin.reviewQueue.error', { err, route: 'GET /:clientId/count', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/review-queue/:clientId — full queue (review + approved)
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const clientId = req.params.clientId;

    const [newsItems] = await pool.execute(
      `SELECT n.id, n.title, n.status, n.created_at, n.updated_at, 'news' as item_type, n.category, NULL as doc_type,
              n.owner_id, n.owner_since, o.name AS owner_name
       FROM cp_news_posts n
       LEFT JOIN cp_admin_users o ON o.id = n.owner_id
       WHERE n.client_id = ? AND n.status IN ('review', 'approved')
       ORDER BY n.updated_at DESC`,
      [clientId]
    );

    const [docItems] = await pool.execute(
      `SELECT d.id, d.title, d.status, d.created_at, d.updated_at, 'document' as item_type, d.category, d.doc_type,
              d.owner_id, d.owner_since, o.name AS owner_name
       FROM cp_documents d
       LEFT JOIN cp_admin_users o ON o.id = d.owner_id
       WHERE d.client_id = ? AND d.status IN ('review', 'approved') AND d.is_active = 1
       ORDER BY d.updated_at DESC`,
      [clientId]
    );

    // Phase 3 row 21: trials waiting for review. They are published from the Clinical
    // Trials screen, which knows who sent each one; nobody holds a trial.
    const [trialItems] = await pool.execute(
      `SELECT t.id, t.title, t.publish_status AS status, t.created_at, t.updated_at, 'trial' as item_type,
              t.indication AS category, NULL as doc_type, NULL AS owner_id, NULL AS owner_since, NULL AS owner_name,
              s.name AS submitted_by_name
       FROM cp_clinical_trials t
       LEFT JOIN cp_admin_users s ON s.id = t.submitted_by
       WHERE t.client_id = ? AND t.publish_status = 'review'
       ORDER BY t.updated_at DESC`,
      [clientId]
    );

    // Merge and sort by updated_at desc
    const items = [...newsItems, ...docItems, ...trialItems].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    items.forEach(i => { i.owned_by_me = i.owner_id != null && i.owner_id === req.admin.adminId; }); // CPPM-61
    res.json({ items });
  } catch (err) {
    log.error('admin.reviewQueue.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});


// ── CPPM-61: who is working this — take, release, hand to a colleague ───────
// The rules live in utils/workOwnership.js. Any role but a viewer may hold an item
// (the admin write policy refuses a viewer before these run).
router.get('/:clientId/staff', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    res.json({ staff: await workOwnership.staffFor(req.params.clientId) });
  } catch (err) {
    log.error('admin.reviewQueue.error', { err, route: 'GET /:clientId/staff', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

for (const action of ['take', 'release', 'hand']) {
  router.post(`/:clientId/:itemType/:itemId/${action}`, authenticateAdmin, requireClientAccess, async (req, res) => {
    try {
      if (!['news', 'document'].includes(req.params.itemType)) return res.status(404).json({ error: 'Not found.' });
      const out = await workOwnership[action](req.params.itemType, req.params.clientId, req.params.itemId, req.admin, req.body.to_admin_id);
      res.status(out.status).json(out.body);
    } catch (err) {
      log.error('admin.reviewQueue.error', { err, route: `POST /:clientId/:itemType/:itemId/${action}`, path: req.path, request_id: req.requestId || null });
      res.status(500).json({ error: 'Server error.' });
    }
  });
}

module.exports = router;
