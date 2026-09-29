'use strict';

/**
 * miApproval.js — Sprint 2 #17 + #16 surface.
 *
 *   GET  /api/mi-responses/:id/approval-state            — { needs_two_signers, reviewer, approver, status }
 *   POST /api/mi-responses/:id/review                    body { password, reason }
 *   POST /api/mi-responses/:id/approve                   body { password, reason }
 *   PUT  /api/mi-responses/:id/requires-two-signers      body { value: bool } (admin)
 *
 *   GET    /api/admin/mi-two-signer-rules
 *   POST   /api/admin/mi-two-signer-rules
 *   DELETE /api/admin/mi-two-signer-rules/:id            soft via is_active=0
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
const miApproval = require('../../services/miApprovalService');
const { userHasActivityPrivilege } = require('../../services/accessConfigurationService');

const ADMIN = ['admin', 'platform_admin'];

function clientMeta(req) {
  return {
    ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 255),
  };
}

// A wrong password is 401; a signature out of turn, or by the writer, is 400 —
// it is not a sign-in problem.
function signErrorStatus(err) {
  if (/password/i.test(err.message)) return 401;
  if (/not found/i.test(err.message)) return 404;
  return 400;
}

// An org admin manages their own organisation's two-signer rules; a platform
// admin manages any, including the platform-wide ones. Anyone with the admin
// role could read, change or switch off every organisation's rules (M-87).
function ruleScope(req) {
  return hasGlobalAdminScope(req.user) ? null : req.user.orgId;
}

router.get('/mi-responses/:id/approval-state', authenticate, async (req, res) => {
  try {
    const globalScope = hasGlobalAdminScope(req.user);
    const orgClause = globalScope ? '1 = 1' : 'c.org_id = ?';
    const params = globalScope ? [req.params.id] : [req.params.id, req.user.orgId];
    const [[r]] = await pool.execute(
      `SELECT mr.id, mr.response_status, mr.mi_tab_id, mr.requires_two_signers, mr.author_id,
              mr.reviewer_id, mr.reviewer_name, mr.reviewed_at,
              mr.approver_id, mr.approver_name, mr.approved_at,
              t.is_off_label, c.org_id
         FROM case_mi_responses mr
         JOIN case_mi      t ON t.id = mr.mi_tab_id
         JOIN cases        c ON c.id = t.case_id
        WHERE mr.id = ? AND ${orgClause}`,
      params
    );
    if (!r) return res.status(404).json({ error: 'Not found' });
    const needs = await miApproval.needsTwoSigners({ orgId: r.org_id || req.user.orgId, response: r });
    res.json({
      status: r.response_status,
      author_id: r.author_id,
      reviewer: r.reviewed_at ? { id: r.reviewer_id, name: r.reviewer_name, at: r.reviewed_at } : null,
      // approved_at is also set by the single-signer Approve, which has no approver slot.
      approver: r.approver_id && r.approved_at ? { id: r.approver_id, name: r.approver_name, at: r.approved_at } : null,
      is_off_label: !!r.is_off_label,
      ...needs,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/mi-responses/:id/review', authenticate, async (req, res) => {
  try {
    if (!(await userHasActivityPrivilege(req.user, 'case.letter.approve'))) {
      return res.status(403).json({ error: 'You do not have permission to sign off response letters.' });
    }
    const { password, reason } = req.body || {};
    const meta = clientMeta(req);
    const out = await miApproval.sign({
      orgId:    req.user.orgId,
      globalScope: hasGlobalAdminScope(req.user),
      responseId: req.params.id,
      role:     'reviewer',
      userId:   req.user.userId,
      userName: req.user.name || req.user.email,
      password, reason, ip: meta.ip, userAgent: meta.userAgent,
    });
    res.json(out);
  } catch (err) { res.status(signErrorStatus(err)).json({ error: err.message }); }
});

router.post('/mi-responses/:id/approve', authenticate, async (req, res) => {
  try {
    if (!(await userHasActivityPrivilege(req.user, 'case.letter.approve'))) {
      return res.status(403).json({ error: 'You do not have permission to sign off response letters.' });
    }
    const { password, reason } = req.body || {};
    const meta = clientMeta(req);
    const out = await miApproval.sign({
      orgId:    req.user.orgId,
      globalScope: hasGlobalAdminScope(req.user),
      responseId: req.params.id,
      role:     'approver',
      userId:   req.user.userId,
      userName: req.user.name || req.user.email,
      password, reason, ip: meta.ip, userAgent: meta.userAgent,
    });
    res.json(out);
  } catch (err) { res.status(signErrorStatus(err)).json({ error: err.message }); }
});

router.put('/mi-responses/:id/requires-two-signers', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    await miApproval.setRequiresTwoSigners({
      orgId: req.user.orgId,
      globalScope: hasGlobalAdminScope(req.user),
      responseId: req.params.id,
      value: !!(req.body || {}).value,
    });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Two-signer rules admin
router.get('/admin/mi-two-signer-rules', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = ruleScope(req);
    // An org admin also sees the platform-wide rules that apply to them.
    const [rows] = await pool.execute(
      `SELECT * FROM mi_two_signer_rules
        ${orgId ? 'WHERE org_id = ? OR org_id IS NULL' : ''}
        ORDER BY org_id IS NULL DESC, condition_type`,
      orgId ? [orgId] : []
    );
    res.json({ rules: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/mi-two-signer-rules', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const scope = ruleScope(req);
    const {
      id, condition_type, condition_value = null,
      requires_approver_role = null, is_active = 1,
    } = req.body || {};
    const org_id = scope || (req.body || {}).org_id || null;
    if (!condition_type) return res.status(400).json({ error: 'condition_type required' });
    if (id) {
      const [result] = await pool.execute(
        `UPDATE mi_two_signer_rules
            SET requires_approver_role = ?, is_active = ?, updated_at = NOW()
          WHERE id = ?${scope ? ' AND org_id = ?' : ''}`,
        scope ? [requires_approver_role, is_active ? 1 : 0, id, scope] : [requires_approver_role, is_active ? 1 : 0, id]
      );
      if (!result.affectedRows) return res.status(404).json({ error: 'Rule not found.' });
    } else {
      await pool.execute(
        `INSERT INTO mi_two_signer_rules (org_id, condition_type, condition_value, requires_approver_role, is_active)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           requires_approver_role = VALUES(requires_approver_role),
           is_active = VALUES(is_active),
           updated_at = NOW()`,
        [org_id, condition_type, condition_value, requires_approver_role, is_active ? 1 : 0]
      );
    }
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/admin/mi-two-signer-rules/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const scope = ruleScope(req);
    const [result] = await pool.execute(
      `UPDATE mi_two_signer_rules SET is_active = 0 WHERE id = ?${scope ? ' AND org_id = ?' : ''}`,
      scope ? [req.params.id, scope] : [req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Rule not found.' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
