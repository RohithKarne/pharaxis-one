/**
 * Admin Feedback — /api/admin/feedback
 * S5-1: View and manage portal feedback per client
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');

// GET /api/admin/feedback/:clientId — paginated feedback list with avg rating
router.get('/:clientId', authenticateAdmin, requireClientAccess, (req, res) => {
  const { clientId } = req.params;
  const page  = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;

  const { avg, total } = db.prepare(`
    SELECT ROUND(AVG(rating), 1) as avg, COUNT(*) as total
    FROM cp_feedback WHERE client_id = ?
  `).get(clientId);

  const rows = db.prepare(`
    SELECT f.*, u.email as user_email, u.first_name, u.last_name
    FROM cp_feedback f
    LEFT JOIN cp_portal_users u ON u.id = f.user_id
    WHERE f.client_id = ?
    ORDER BY f.submitted_at DESC
    LIMIT ? OFFSET ?
  `).all(clientId, limit, offset);

  res.json({ feedback: rows, avg_rating: avg || null, total, page, limit });
});

// DELETE /api/admin/feedback/:clientId/:feedbackId
router.delete('/:clientId/:feedbackId', authenticateAdmin, requireClientAccess, (req, res) => {
  db.prepare('DELETE FROM cp_feedback WHERE id = ? AND client_id = ?').run(req.params.feedbackId, req.params.clientId);
  res.json({ ok: true });
});

module.exports = router;
