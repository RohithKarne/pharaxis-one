'use strict';

/**
 * admin/caseAuditTrail.js — Case Audit Trail API (F-09)
 * Immutable field-level change log per case. Accessible from Case Form (Phase 2).
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');

// GET /api/admin/case-audit-trail/:caseId — list audit entries for a case
router.get('/case-audit-trail/:caseId', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { caseId } = req.params;
    const { action_type, user_id, from_date, to_date, page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = 'SELECT * FROM case_audit_trail WHERE case_id = ?';
    const params = [caseId];

    if (action_type) { query += ' AND action_type = ?'; params.push(action_type); }
    if (user_id)     { query += ' AND user_id = ?';     params.push(user_id); }
    if (from_date)   { query += ' AND timestamp >= ?';  params.push(from_date); }
    if (to_date)     { query += ' AND timestamp <= ?';  params.push(to_date); }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) AS total');
    const [[{ total }]] = await pool.execute(countQuery, params);

    query += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit, 10), offset);
    const [entries] = await pool.execute(query, params);

    res.json({ entries, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /case-audit-trail/:caseId error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/case-audit-trail — write an audit entry (called internally by Case Form)
router.post('/case-audit-trail', authenticate, async (req, res) => {
  try {
    const { case_id, action_type, field_name, old_value, new_value } = req.body;
    if (!case_id || !action_type) {
      return res.status(400).json({ error: 'case_id and action_type are required.' });
    }

    const [result] = await pool.execute(
      `INSERT INTO case_audit_trail (case_id, user_id, user_name, action_type, field_name, old_value, new_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [case_id, req.user.userId, req.user.email,
       action_type, field_name || null, old_value !== undefined ? String(old_value) : null,
       new_value !== undefined ? String(new_value) : null]
    );
    res.status(201).json({ message: 'Audit entry recorded.', id: result.insertId });
  } catch (err) {
    console.error('POST /case-audit-trail error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
