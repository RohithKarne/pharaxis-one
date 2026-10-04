'use strict';

/**
 * admin/supportAccess.js — an organisation grants, sees and revokes Pharaxis
 * support access to its cases (Rohith's decision, 2026-10-04).
 *
 * Only the organisation's own admin grants or revokes; a platform admin may
 * look, so they can see whether they have access and until when. Every grant
 * and revocation is written to the audit log, as is each case a platform admin
 * opens under a grant (middleware/supportAccess.js).
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');
const { isTenantAdmin } = require('../../utils/adminScope');
const { logAudit } = require('../../utils/auditLog');

const MAX_DAYS = 90;

function requireOrgAdmin(req, res, next) {
  if (!isTenantAdmin(req.user)) {
    return res.status(403).json({ error: 'Only this organisation\'s administrator can grant or revoke support access.' });
  }
  next();
}

// GET /api/admin/support-access — grants for the active organisation, newest first
router.get('/support-access', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const [grants] = await pool.execute(
      `SELECT g.id, g.reason, g.expires_at, g.revoked_at, g.created_at,
              gb.name AS granted_by_name, rb.name AS revoked_by_name,
              (g.revoked_at IS NULL AND g.expires_at > NOW()) AS is_active
       FROM org_support_access g
       LEFT JOIN users gb ON gb.id = g.granted_by
       LEFT JOIN users rb ON rb.id = g.revoked_by
       WHERE g.org_id = ?
       ORDER BY g.created_at DESC
       LIMIT 100`,
      [req.user.orgId]
    );
    const [views] = await pool.execute(
      `SELECT a.created_at, a.user_name, a.entity_id AS case_id, c.case_number
       FROM audit_logs a
       LEFT JOIN cases c ON c.id = a.entity_id
       WHERE a.action = 'SUPPORT_ACCESS_CASE_VIEW' AND c.org_id = ?
       ORDER BY a.created_at DESC
       LIMIT 50`,
      [req.user.orgId]
    );
    res.json({ grants: grants.map((g) => ({ ...g, is_active: !!g.is_active })), views });
  } catch (err) {
    console.error('GET /support-access error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/support-access — grant for N days with a reason
router.post('/support-access', authenticate, requireRole('admin'), requireOrg, requireOrgAdmin, async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    const days = parseInt(req.body?.days, 10);
    if (!reason) return res.status(400).json({ error: 'Say why support access is being granted.' });
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
      return res.status(400).json({ error: `Choose between 1 and ${MAX_DAYS} days.` });
    }
    const [result] = await pool.execute(
      `INSERT INTO org_support_access (org_id, granted_by, reason, expires_at)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
      [req.user.orgId, req.user.userId, reason, days]
    );
    await logAudit(req.user.userId, req.user.email, 'SUPPORT_ACCESS_GRANTED', 'organisation', Number(req.user.orgId), {
      grant_id: result.insertId, reason, days,
    });
    res.status(201).json({ message: `Support access granted for ${days} day${days === 1 ? '' : 's'}.`, id: result.insertId });
  } catch (err) {
    console.error('POST /support-access error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/support-access/:id — revoke now
router.delete('/support-access/:id', authenticate, requireRole('admin'), requireOrg, requireOrgAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute(
      `UPDATE org_support_access SET revoked_at = NOW(), revoked_by = ?
       WHERE id = ? AND org_id = ? AND revoked_at IS NULL`,
      [req.user.userId, req.params.id, req.user.orgId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'No active grant with that id.' });
    await logAudit(req.user.userId, req.user.email, 'SUPPORT_ACCESS_REVOKED', 'organisation', Number(req.user.orgId), {
      grant_id: Number(req.params.id),
    });
    res.json({ message: 'Support access revoked.' });
  } catch (err) {
    console.error('DELETE /support-access/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
