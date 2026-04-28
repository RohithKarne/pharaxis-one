'use strict';

/**
 * admin/responseErrorLog.js — Response Error Log API
 * Org-admin-facing log of response API and email delivery errors.
 * Each entry has a UUID log_id for traceability.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');

// GET /api/admin/response-error-logs
router.get('/response-error-logs', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { case_id, error_type, from_date, to_date, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `SELECT * FROM response_error_logs WHERE 1=1`;
    const params = [];

    if (req.user.role !== 'superadmin') {
      query += ' AND org_id = ?';
      params.push(req.user.orgId);
    }
    if (case_id)    { query += ' AND case_id = ?';          params.push(case_id); }
    if (error_type) { query += ' AND error_type LIKE ?';    params.push(`%${error_type}%`); }
    if (from_date)  { query += ' AND created_at >= ?';      params.push(from_date); }
    if (to_date)    { query += ' AND created_at <= ?';      params.push(to_date + ' 23:59:59'); }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) AS total');
    const [[{ total }]] = await pool.execute(countQuery, params);

    query += ` ORDER BY created_at DESC LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;
    const [entries] = await pool.execute(query, params);

    res.json({ entries, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /response-error-logs error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
