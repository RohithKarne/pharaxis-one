'use strict';

/**
 * admin/caseAuditTrail.js — Case Audit Trail API (F-09)
 * Immutable field-level change log per case. Accessible from Case Form (Phase 2).
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');

function isSuperadmin(req) {
  return req.user.role === 'superadmin';
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

function auditLogScope(req, alias = 'al') {
  if (isSuperadmin(req)) {
    return { joins: '', whereClause: '', params: [] };
  }
  return {
    joins: `
      LEFT JOIN users ${alias}_u ON ${alias}_u.id = ${alias}.user_id
      LEFT JOIN user_org_access ${alias}_uoa
        ON ${alias}_uoa.user_id = ${alias}_u.id
       AND ${alias}_uoa.org_id = ?
       AND ${alias}_uoa.is_active = 1
    `,
    whereClause: ` AND (${alias}_u.org_id = ? OR ${alias}_uoa.user_id IS NOT NULL)`,
    params: [req.user.orgId, req.user.orgId],
  };
}

// GET /api/admin/case-audit-trail/cases-summary — distinct cases that have audit entries
router.get('/case-audit-trail/cases-summary', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { search, from_date, to_date, page = 1, limit = 50 } = req.query;
    const lim    = Math.max(1, parseInt(limit, 10) || 50);
    const offset = (Math.max(1, parseInt(page, 10)) - 1) * lim;

    let where = 'WHERE 1=1';
    const params = [];
    if (!isSuperadmin(req)) { where += ' AND c.org_id = ?';        params.push(req.user.orgId); }
    if (search)              { where += ' AND c.case_number LIKE ?'; params.push(`%${search}%`); }
    if (from_date)           { where += ' AND cat.timestamp >= ?';   params.push(from_date); }
    if (to_date)             { where += ' AND cat.timestamp <= ?';   params.push(to_date + ' 23:59:59'); }

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(DISTINCT cat.case_id) AS total
       FROM case_audit_trail cat JOIN cases c ON c.id = cat.case_id ${where}`,
      params
    );
    const [cases] = await pool.execute(
      `SELECT cat.case_id, c.case_number, c.case_type,
              COUNT(cat.id) AS total_changes,
              MAX(cat.timestamp) AS last_changed_at,
              (SELECT user_name FROM case_audit_trail
               WHERE case_id = cat.case_id ORDER BY timestamp DESC LIMIT 1) AS last_changed_by
       FROM case_audit_trail cat JOIN cases c ON c.id = cat.case_id
       ${where}
       GROUP BY cat.case_id, c.case_number, c.case_type
       ORDER BY last_changed_at DESC
       LIMIT ${lim} OFFSET ${offset}`,
      params
    );
    res.json({ cases, total, page: parseInt(page, 10), limit: lim });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/case-audit-trail — list all audit entries for the org (Utilities page)
router.get('/case-audit-trail', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { case_id, action_type, user_id, from_date, to_date, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `
      SELECT cat.*, c.case_number, c.org_id
      FROM case_audit_trail cat
      JOIN cases c ON c.id = cat.case_id
      WHERE 1=1
    `;
    const params = [];

    if (!isSuperadmin(req)) {
      query += ' AND c.org_id = ?';
      params.push(req.user.orgId);
    }
    if (case_id)     { query += ' AND cat.case_id = ?';       params.push(case_id); }
    if (action_type) { query += ' AND cat.action_type = ?';   params.push(action_type); }
    if (user_id)     { query += ' AND cat.user_id = ?';       params.push(user_id); }
    if (from_date)   { query += ' AND cat.timestamp >= ?';    params.push(from_date); }
    if (to_date)     { query += ' AND cat.timestamp <= ?';    params.push(to_date + ' 23:59:59'); }

    const countQuery = query.replace('SELECT cat.*, c.case_number, c.org_id', 'SELECT COUNT(*) AS total');
    const [[{ total }]] = await pool.execute(countQuery, params);

    query += ` ORDER BY cat.timestamp DESC LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;
    const [entries] = await pool.execute(query, params);

    res.json({ entries, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /case-audit-trail error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/case-audit-trail/:caseId — list audit entries for a case
router.get('/case-audit-trail/:caseId', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { caseId } = req.params;
    if (!await hasCaseAccess(req, caseId)) {
      return res.status(404).json({ error: 'Case not found.' });
    }
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

// GET /api/admin/audit-trail — list audit_logs with advanced filters
router.get('/audit-trail', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { user_id, action, entity, date_from, date_to, page = 1, limit = 100 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const scope = auditLogScope(req, 'al');

    let query = `SELECT al.id, al.user_id, al.user_name, al.action, al.entity, al.entity_id, al.details, al.created_at
                 FROM audit_logs al
                 ${scope.joins}
                 WHERE 1=1${scope.whereClause}`;
    const params = [...scope.params];
    if (user_id)   { query += ` AND al.user_id = ?`;         params.push(user_id); }
    if (action)    { query += ` AND al.action LIKE ?`;        params.push(`%${action}%`); }
    if (entity)    { query += ` AND al.entity = ?`;           params.push(entity); }
    if (date_from) { query += ` AND al.created_at >= ?`;      params.push(date_from); }
    if (date_to)   { query += ` AND al.created_at <= ?`;      params.push(date_to + ' 23:59:59'); }

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM (${query}) scoped_audit_logs`,
      params
    );

    query += ` ORDER BY al.created_at DESC LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;
    const [entries] = await pool.execute(query, params);

    res.json({ entries, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /audit-trail error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/audit-trail/export — Export filtered audit trail as CSV
router.get('/audit-trail/export', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { user_id, action, entity, date_from, date_to } = req.query;
    const scope = auditLogScope(req, 'al');
    let query = `SELECT al.id, al.user_id, al.user_name, al.action, al.entity, al.entity_id, al.details, al.created_at
                 FROM audit_logs al
                 ${scope.joins}
                 WHERE 1=1${scope.whereClause}`;
    const params = [...scope.params];
    if (user_id)   { query += ` AND al.user_id = ?`;         params.push(user_id); }
    if (action)    { query += ` AND al.action LIKE ?`;        params.push(`%${action}%`); }
    if (entity)    { query += ` AND al.entity = ?`;           params.push(entity); }
    if (date_from) { query += ` AND al.created_at >= ?`;      params.push(date_from); }
    if (date_to)   { query += ` AND al.created_at <= ?`;      params.push(date_to + ' 23:59:59'); }
    query += ` ORDER BY al.created_at DESC LIMIT 10000`;
    const [rows] = await pool.execute(query, params);
    const header = 'id,user_id,user_name,action,entity,entity_id,details,created_at';
    const csvRows = rows.map(r => [
      r.id, r.user_id, `"${(r.user_name||'').replace(/"/g,'""')}"`,
      `"${(r.action||'').replace(/"/g,'""')}"`, r.entity, r.entity_id,
      `"${JSON.stringify(r.details||{}).replace(/"/g,'""')}"`,
      r.created_at
    ].join(','));
    const csv = [header, ...csvRows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit_trail.csv"');
    res.send(csv);
  } catch (err) {
    console.error('GET /audit-trail/export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/case-audit-trail — write an audit entry (called internally by Case Form)
router.post('/case-audit-trail', authenticate, async (req, res) => {
  try {
    const { case_id, action_type, field_name, old_value, new_value } = req.body;
    if (!case_id || !action_type) {
      return res.status(400).json({ error: 'case_id and action_type are required.' });
    }
    if (!await hasCaseAccess(req, case_id)) {
      return res.status(404).json({ error: 'Case not found.' });
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
