'use strict';

/**
 * admin/transmissionAuditTrail.js — Transmission Audit Trail API (F-10)
 * Immutable log of all outbound transmissions per case (Argus, Veeva, TrackWise, etc.)
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');

function isSuperadmin(req) {
  return req.user.role === 'superadmin';
}

async function logTransmissionError(orgId, caseId, targetSystem, errorType, errorMessage, details) {
  try {
    const logId = crypto.randomUUID();
    await pool.execute(
      `INSERT INTO transmission_error_logs (log_id, org_id, case_id, target_system, error_type, error_message, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [logId, orgId, caseId || null, targetSystem || null, errorType,
       String(errorMessage || '').slice(0, 2000), JSON.stringify(details || {})]
    );
    return logId;
  } catch (_) {}
}

async function hasCaseAccess(req, caseId) {
  const [rows] = await pool.execute(
    isSuperadmin(req)
      ? 'SELECT id FROM cases WHERE id = ?'
      : 'SELECT id FROM cases WHERE id = ? AND org_id = ?',
    isSuperadmin(req) ? [caseId] : [caseId, req.user.orgId]
  );
  return !!rows[0];
}

// GET /api/admin/transmission-audit-trail/cases-summary — cases with outbound transmissions
router.get('/transmission-audit-trail/cases-summary', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const lim    = Math.max(1, parseInt(limit, 10) || 50);
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * lim;

    let where = 'WHERE 1=1';
    const params = [];
    if (!isSuperadmin(req)) { where += ' AND c.org_id = ?';        params.push(req.user.orgId); }
    if (search)              { where += ' AND c.case_number LIKE ?'; params.push(`%${search}%`); }

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(DISTINCT t.case_id) AS total
       FROM transmission_audit_trail t JOIN cases c ON c.id = t.case_id ${where}`,
      params
    );
    const [cases] = await pool.execute(
      `SELECT t.case_id, c.case_number, c.case_type,
              COUNT(t.id) AS total_transmissions,
              MAX(t.timestamp) AS last_sent_at,
              GROUP_CONCAT(DISTINCT t.target_system ORDER BY t.target_system SEPARATOR ', ') AS systems,
              SUM(CASE WHEN t.status = 'Sent' THEN 1 ELSE 0 END) AS sent_count,
              SUM(CASE WHEN t.status = 'Failed' THEN 1 ELSE 0 END) AS failed_count
       FROM transmission_audit_trail t JOIN cases c ON c.id = t.case_id
       ${where}
       GROUP BY t.case_id, c.case_number, c.case_type
       ORDER BY last_sent_at DESC
       LIMIT ${lim} OFFSET ${offset}`,
      params
    );
    res.json({ cases, total, page: parseInt(page, 10), limit: lim });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/transmission-audit-trail — list transmissions with filters
router.get('/transmission-audit-trail', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { case_id, target_system, status, from_date, to_date, page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `SELECT t.*
                 FROM transmission_audit_trail t
                 JOIN cases c ON c.id = t.case_id
                 WHERE 1=1`;
    const params = [];

    if (!isSuperadmin(req)) {
      query += ' AND c.org_id = ?';
      params.push(req.user.orgId);
    }

    if (case_id)       { query += ' AND t.case_id = ?';        params.push(case_id); }
    if (target_system) { query += ' AND t.target_system = ?';  params.push(target_system); }
    if (status)        { query += ' AND t.status = ?';         params.push(status); }
    if (from_date)     { query += ' AND t.timestamp >= ?';     params.push(from_date); }
    if (to_date)       { query += ' AND t.timestamp <= ?';     params.push(to_date); }

    const countQuery = query.replace('SELECT t.*', 'SELECT COUNT(*) AS total');
    const [[{ total }]] = await pool.execute(countQuery, params);

    query += ` ORDER BY t.timestamp DESC LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;
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
    if (!await hasCaseAccess(req, caseId)) return res.status(404).json({ error: 'Case not found.' });
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
    if (!await hasCaseAccess(req, case_id)) return res.status(404).json({ error: 'Case not found.' });

    const [result] = await pool.execute(
      `INSERT INTO transmission_audit_trail (case_id, user_id, user_name, target_system, payload_summary, status, response_code)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [case_id, req.user.userId, req.user.email,
       target_system, payload_summary || null, status || 'Sent', response_code || null]
    );
    res.status(201).json({ message: 'Transmission recorded.', id: result.insertId });
  } catch (err) {
    console.error('POST /transmission-audit-trail error:', err);
    await logTransmissionError(
      req.user?.orgId, req.body?.case_id, req.body?.target_system,
      'API_ERROR', err.message, { route: 'POST transmission-audit-trail', user: req.user?.email }
    );
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/transmission-error-logs
router.get('/transmission-error-logs', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { case_id, target_system, error_type, from_date, to_date, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `SELECT * FROM transmission_error_logs WHERE 1=1`;
    const params = [];

    if (!isSuperadmin(req)) { query += ' AND org_id = ?'; params.push(req.user.orgId); }
    if (case_id)      { query += ' AND case_id = ?';          params.push(case_id); }
    if (target_system){ query += ' AND target_system LIKE ?'; params.push(`%${target_system}%`); }
    if (error_type)   { query += ' AND error_type LIKE ?';    params.push(`%${error_type}%`); }
    if (from_date)    { query += ' AND created_at >= ?';      params.push(from_date); }
    if (to_date)      { query += ' AND created_at <= ?';      params.push(to_date + ' 23:59:59'); }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) AS total');
    const [[{ total }]] = await pool.execute(countQuery, params);
    query += ` ORDER BY created_at DESC LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;
    const [entries] = await pool.execute(query, params);

    res.json({ entries, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /transmission-error-logs error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/transmission-screen-audit — log a user interaction event
router.post('/transmission-screen-audit', authenticate, async (req, res) => {
  try {
    const { action, context } = req.body;
    if (!action) return res.status(400).json({ error: 'action is required.' });
    await pool.execute(
      `INSERT INTO transmission_screen_audit (org_id, user_id, user_name, action, context)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.orgId, req.user.userId, req.user.email,
       String(action).slice(0, 100), context ? JSON.stringify(context) : null]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('POST /transmission-screen-audit error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/transmission-screen-audit — list user interaction events (admin/superadmin only)
router.get('/transmission-screen-audit', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { user_id, action, from_date, to_date, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `SELECT * FROM transmission_screen_audit WHERE 1=1`;
    const params = [];

    if (!isSuperadmin(req)) { query += ' AND org_id = ?'; params.push(req.user.orgId); }
    if (user_id)   { query += ' AND user_id = ?';           params.push(user_id); }
    if (action)    { query += ' AND action LIKE ?';          params.push(`%${action}%`); }
    if (from_date) { query += ' AND created_at >= ?';        params.push(from_date); }
    if (to_date)   { query += ' AND created_at <= ?';        params.push(to_date + ' 23:59:59'); }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) AS total');
    const [[{ total }]] = await pool.execute(countQuery, params);
    query += ` ORDER BY created_at DESC LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;
    const [entries] = await pool.execute(query, params);

    res.json({ entries, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /transmission-screen-audit error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
