'use strict';

/**
 * admin/transmissionAuditTrail.js — Transmission Audit Trail API (F-10)
 * Immutable log of all outbound transmissions per case (Argus, Veeva, TrackWise, etc.)
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');

// GET /api/admin/transmission-audit-trail — list transmissions with filters
router.get('/transmission-audit-trail', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { case_id, target_system, status, from_date, to_date, page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = 'SELECT * FROM transmission_audit_trail WHERE 1=1';
    const params = [];

    if (case_id)       { query += ' AND case_id = ?';        params.push(case_id); }
    if (target_system) { query += ' AND target_system = ?';  params.push(target_system); }
    if (status)        { query += ' AND status = ?';         params.push(status); }
    if (from_date)     { query += ' AND timestamp >= ?';     params.push(from_date); }
    if (to_date)       { query += ' AND timestamp <= ?';     params.push(to_date); }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) AS total');
    const [[{ total }]] = await pool.execute(countQuery, params);

    query += ` ORDER BY timestamp DESC LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;
    const [entries] = await pool.execute(query, params);

    res.json({ entries, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /transmission-audit-trail error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/transmission-audit-trail/:caseId — list transmissions for a specific case
router.get('/transmission-audit-trail/:caseId', authenticate, async (req, res) => {
  try {
    const { caseId } = req.params;
    const [entries] = await pool.execute(
      'SELECT * FROM transmission_audit_trail WHERE case_id = ? ORDER BY timestamp DESC',
      [caseId]
    );
    res.json({ entries });
  } catch (err) {
    console.error('GET /transmission-audit-trail/:caseId error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/transmission-audit-trail — record a transmission (called by integration layer)
router.post('/transmission-audit-trail', authenticate, async (req, res) => {
  try {
    const { case_id, target_system, payload_summary, status, response_code } = req.body;
    if (!case_id || !target_system) {
      return res.status(400).json({ error: 'case_id and target_system are required.' });
    }

    const [result] = await pool.execute(
      `INSERT INTO transmission_audit_trail (case_id, user_id, user_name, target_system, payload_summary, status, response_code)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [case_id, req.user.userId, req.user.email,
       target_system, payload_summary || null, status || 'Sent', response_code || null]
    );
    res.status(201).json({ message: 'Transmission recorded.', id: result.insertId });
  } catch (err) {
    console.error('POST /transmission-audit-trail error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
