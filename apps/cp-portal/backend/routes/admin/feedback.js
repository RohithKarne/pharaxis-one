/**
 * Admin Feedback — /api/admin/feedback
 * S5-1: View and manage portal feedback per client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const log = require('../../utils/logger');

// GET /api/admin/feedback/:clientId — paginated feedback list with avg rating
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { clientId } = req.params;
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const [[{ avg, total }]] = await pool.execute(`
      SELECT ROUND(AVG(rating), 1) as avg, COUNT(*) as total
      FROM cp_feedback WHERE client_id = ?
    `, [clientId]);

    const [rows] = await pool.execute(`
      SELECT f.*, u.email as user_email, u.first_name, u.last_name
      FROM cp_feedback f
      LEFT JOIN cp_portal_users u ON u.id = f.user_id
      WHERE f.client_id = ?
      ORDER BY f.submitted_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `, [clientId]);

    res.json({ feedback: rows, avg_rating: avg || null, total, page, limit });
  } catch (err) {
    log.error('admin.feedback.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/feedback/:clientId/:feedbackId
router.delete('/:clientId/:feedbackId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    await pool.execute('DELETE FROM cp_feedback WHERE id = ? AND client_id = ?', [req.params.feedbackId, req.params.clientId]);
    res.json({ ok: true });
  } catch (err) {
    log.error('admin.feedback.error', { err, route: 'DELETE /:clientId/:feedbackId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
