'use strict';
const express = require('express');
const { authenticate } = require('../../middleware/auth');
const pool = require('../../database/db');
const router = express.Router();

// GET /api/admin/reports/access
router.get('/reports/access', authenticate, async (req, res) => {
  try {
    const orgId = req.user.orgId;
    const [access] = await pool.query(`
      SELECT ura.*, u.name as user_name, u.email
      FROM user_report_access ura
      JOIN users u ON u.id = ura.user_id
      WHERE ura.org_id = ?
      ORDER BY u.name ASC, ura.report_key ASC
    `, [orgId]);
    res.json({ access });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/reports/access/request
router.post('/reports/access/request', authenticate, async (req, res) => {
  try {
    const orgId = req.user.orgId;
    const { user_id, report_key } = req.body;
    const [result] = await pool.query(`
      INSERT INTO report_access_requests (org_id, requested_by, user_id, report_key, status)
      VALUES (?, ?, ?, ?, 'pending')
    `, [orgId, req.user.userId, user_id, report_key]);
    res.json({ success: true, id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/reports/access/requests
router.get('/reports/access/requests', authenticate, async (req, res) => {
  try {
    const orgId = req.user.orgId;
    const [requests] = await pool.query(`
      SELECT rar.*, u.name as user_name, u_req.name as requested_by_name
      FROM report_access_requests rar
      JOIN users u ON u.id = rar.user_id
      JOIN users u_req ON u_req.id = rar.requested_by
      WHERE rar.org_id = ?
      ORDER BY rar.created_at DESC
    `, [orgId]);
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
