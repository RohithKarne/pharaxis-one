/**
 * Admin Submissions — /api/admin/submissions
 * G1: View portal form submissions per client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');

// GET /api/admin/submissions/:clientId
// Returns submissions with optional filter by submission_type and status
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { type, status, search } = req.query;

    let query = `
      SELECT s.id, s.submission_type, s.submitter_name, s.submitter_email,
             s.submitter_type, s.status, s.external_ref, s.submitted_at,
             s.sync_attempts, s.form_data,
             u.first_name, u.last_name, u.email AS user_email
      FROM cp_submissions s
      LEFT JOIN cp_portal_users u ON s.user_id = u.id
      WHERE s.client_id = ?
    `;
    const params = [req.params.clientId];

    if (type)   { query += ' AND s.submission_type = ?'; params.push(type); }
    if (status) { query += ' AND s.status = ?';          params.push(status); }
    if (search) {
      query += ' AND (s.submitter_name LIKE ? OR s.submitter_email LIKE ? OR s.external_ref LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    query += ' ORDER BY s.submitted_at DESC LIMIT 200';

    const [rows] = await pool.execute(query, params);

    // Summary counts
    const [counts] = await pool.execute(
      `SELECT submission_type, COUNT(*) as count
       FROM cp_submissions WHERE client_id = ?
       GROUP BY submission_type`,
      [req.params.clientId]
    );

    const [[total]] = await pool.execute('SELECT COUNT(*) as n FROM cp_submissions WHERE client_id = ?', [req.params.clientId]);

    res.json({ submissions: rows, counts, total: total?.n || 0 });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/admin/submissions/:clientId/:submissionId — update status
router.patch('/:clientId/:submissionId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { status } = req.body;
    const VALID = ['submitted', 'pending_sync', 'synced', 'failed_sync', 'closed'];
    if (!status || !VALID.includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    await pool.execute(
      `UPDATE cp_submissions SET status = ?, updated_at = NOW()
       WHERE id = ? AND client_id = ?`,
      [status, req.params.submissionId, req.params.clientId]
    );
    res.json({ message: 'Status updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
