'use strict';
const express = require('express');
const { authenticate, requireRole } = require('../../middleware/auth');
const pool = require('../../database/db');
const router = express.Router();

const ALL_REPORT_KEYS = [
  'case-volume','case-status','case-type','case-age','case-assignee',
  'case-by-org','case-intake-channel','case-priority','case-ae-summary',
  'case-duplicates','case-source','case-audit-trail','regulatory-readiness',
  'case-monthly-trend','case-closure-rate','user-activity','security-events',
  'module-usage','org-activity','user-roles','content-usage',
  'integration-sync','audit-summary','system-health','field-usage'
];

const REPORT_LABELS = {
  'case-volume': 'Case Volume',
  'case-status': 'Case Status',
  'case-type': 'Case Type',
  'case-age': 'Case Age',
  'case-assignee': 'Case by Assignee',
  'case-by-org': 'Cases by Organisation',
  'case-intake-channel': 'Intake Channel',
  'case-priority': 'Case Priority',
  'case-ae-summary': 'AE Summary',
  'case-duplicates': 'Duplicate Cases',
  'case-source': 'Case Source',
  'case-audit-trail': 'Case Audit Trail',
  'regulatory-readiness': 'Regulatory Readiness',
  'case-monthly-trend': 'Monthly Trend',
  'case-closure-rate': 'Closure Rate',
  'user-activity': 'User Activity',
  'security-events': 'Security Events',
  'module-usage': 'Module Usage',
  'org-activity': 'Org Activity',
  'user-roles': 'User Roles',
  'content-usage': 'Content Usage',
  'integration-sync': 'Integration Sync',
  'audit-summary': 'Audit Summary',
  'system-health': 'System Health',
  'field-usage': 'Field Usage'
};

// GET /api/superadmin/reports/orgs
router.get('/reports/orgs', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const [orgs] = await pool.query(`
      SELECT o.id, o.name, o.is_active,
        COUNT(ora.id) as reports_enabled
      FROM organisations o
      LEFT JOIN org_report_access ora ON ora.org_id = o.id AND ora.is_enabled = 1
      WHERE o.is_active = 1
      GROUP BY o.id, o.name, o.is_active
      ORDER BY o.name ASC
    `);
    res.json({ orgs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/superadmin/reports/org/:orgId
router.get('/reports/org/:orgId', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { orgId } = req.params;
    const [rows] = await pool.query(
      'SELECT report_key, is_enabled FROM org_report_access WHERE org_id = ?',
      [orgId]
    );
    const accessMap = {};
    rows.forEach(r => { accessMap[r.report_key] = r.is_enabled; });
    const reports = ALL_REPORT_KEYS.map(key => ({
      key,
      label: REPORT_LABELS[key] || key,
      is_enabled: accessMap[key] ? 1 : 0
    }));
    res.json({ orgId: parseInt(orgId), reports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/superadmin/reports/org/:orgId
router.put('/reports/org/:orgId', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { orgId } = req.params;
    const { report_key, is_enabled } = req.body;
    const enabledBy = is_enabled ? req.user.userId : null;
    const enabledAt = is_enabled ? new Date() : null;
    await pool.query(`
      INSERT INTO org_report_access (org_id, report_key, is_enabled, enabled_by, enabled_at)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        is_enabled = VALUES(is_enabled),
        enabled_by = VALUES(enabled_by),
        enabled_at = VALUES(enabled_at)
    `, [orgId, report_key, is_enabled ? 1 : 0, enabledBy, enabledAt]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/superadmin/reports/org/:orgId/users
router.get('/reports/org/:orgId/users', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { orgId } = req.params;
    const [users] = await pool.query(`
      SELECT u.id, u.name, u.email, u.role,
        COUNT(ura.id) as reports_granted
      FROM users u
      JOIN user_org_access uoa ON uoa.user_id = u.id AND uoa.org_id = ? AND uoa.is_active = 1
      LEFT JOIN user_report_access ura ON ura.user_id = u.id AND ura.org_id = ? AND ura.is_enabled = 1
      WHERE u.is_active = 1
      GROUP BY u.id, u.name, u.email, u.role
      ORDER BY u.name ASC
    `, [orgId, orgId]);
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/superadmin/reports/org/:orgId/user/:userId
router.put('/reports/org/:orgId/user/:userId', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { orgId, userId } = req.params;
    const { report_key, is_enabled } = req.body;
    const grantedBy = is_enabled ? req.user.userId : null;
    const grantedAt = is_enabled ? new Date() : null;
    await pool.query(`
      INSERT INTO user_report_access (org_id, user_id, report_key, is_enabled, granted_by, granted_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        is_enabled = VALUES(is_enabled),
        granted_by = VALUES(granted_by),
        granted_at = VALUES(granted_at)
    `, [orgId, userId, report_key, is_enabled ? 1 : 0, grantedBy, grantedAt]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/superadmin/reports/requests
router.get('/reports/requests', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const [requests] = await pool.query(`
      SELECT rar.*,
        u_req.name as requested_by_name,
        u_target.name as user_name,
        o.name as org_name
      FROM report_access_requests rar
      JOIN users u_req ON u_req.id = rar.requested_by
      JOIN users u_target ON u_target.id = rar.user_id
      JOIN organisations o ON o.id = rar.org_id
      ORDER BY rar.created_at DESC
      LIMIT 100
    `);
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/superadmin/reports/requests/:id
router.put('/reports/requests/:id', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const [existing] = await pool.query('SELECT * FROM report_access_requests WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ error: 'Request not found' });
    const req_row = existing[0];
    await pool.query(`
      UPDATE report_access_requests
      SET status = ?, reviewed_by = ?, reviewed_at = NOW(), notes = ?
      WHERE id = ?
    `, [status, req.user.userId, notes || null, id]);
    if (status === 'approved') {
      await pool.query(`
        INSERT INTO user_report_access (org_id, user_id, report_key, is_enabled, granted_by, granted_at)
        VALUES (?, ?, ?, 1, ?, NOW())
        ON DUPLICATE KEY UPDATE
          is_enabled = 1,
          granted_by = VALUES(granted_by),
          granted_at = VALUES(granted_at)
      `, [req_row.org_id, req_row.user_id, req_row.report_key, req.user.userId]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
