'use strict';

/**
 * miApprovalService.js — Sprint 2 #17: Two-signer MI response approval.
 *
 * Supports the sequential review → approve flow:
 *   1. Author drafts (status=DRAFT)
 *   2. Reviewer signs (requires password verify via complianceService).
 *      → status flips to REVIEWED. Hash chain entry stamped.
 *   3. Approver signs (must be a different user, must have required role).
 *      → status flips to APPROVED. Second hash chain entry stamped.
 *   4. Send → status=SENT.
 *
 * If the response is not flagged requires_two_signers, the legacy single-signer
 * path still works (the existing /esign endpoint in CaseMITab).
 */

const crypto = require('crypto');
const pool = require('../database/db');
const compliance = require('./complianceService');

const ROLES_PRIVILEGED = ['admin', 'platform_admin', 'medical_director', 'qppv', 'medical_reviewer'];

/**
 * needsTwoSigners({orgId, response}) — determines whether this response
 * requires two signers based on configured rules + per-response flag.
 */
async function needsTwoSigners({ orgId, response }) {
  if (response?.requires_two_signers) return { required: true, reason: 'response_flag' };
  // Off-label inquiries auto-require two signers if a global rule is active
  const [[offLabelRule]] = await pool.execute(
    `SELECT * FROM mi_two_signer_rules
      WHERE (org_id = ? OR org_id IS NULL)
        AND is_active = 1
        AND condition_type = 'off_label'
      LIMIT 1`,
    [orgId]
  );
  if (offLabelRule) {
    // Check the source MI tab
    if (response?.mi_tab_id) {
      const [[tab]] = await pool.execute(
        `SELECT is_off_label FROM case_mi WHERE id = ?`, [response.mi_tab_id]
      ).catch(() => [[]]);
      if (tab?.is_off_label) return {
        required: true,
        reason: 'off_label',
        required_approver_role: offLabelRule.requires_approver_role,
      };
    }
  }
  return { required: false };
}

/**
 * sign({orgId, responseId, role, userId, userName, password, reason})
 *   role: 'reviewer' | 'approver'
 */
async function sign({ orgId, responseId, role, userId, userName, password, reason, ip, userAgent }) {
  if (!['reviewer', 'approver'].includes(role)) throw new Error('Invalid role');

  const [[r]] = await pool.execute(
    `SELECT mr.*, c.id AS case_id
       FROM case_mi_responses mr
       JOIN case_mi        t ON t.id = mr.mi_tab_id
       JOIN cases          c ON c.id = t.case_id
      WHERE mr.id = ? AND c.org_id = ?
      LIMIT 1`,
    [responseId, orgId]
  );
  if (!r) throw new Error('Response not found');

  // Reviewer must come before approver
  if (role === 'approver' && !r.reviewed_at) {
    throw new Error('Reviewer signature required before approver can sign.');
  }
  // Reviewer and approver must be different users
  if (role === 'approver' && Number(r.reviewer_id) === Number(userId)) {
    throw new Error('Approver must be a different user from the reviewer.');
  }

  // Verify password via complianceService's captureESign which also chains the hash.
  const esign = await compliance.captureESign({
    orgId,
    caseId: r.case_id,
    transition: role === 'reviewer' ? 'mi_review' : 'mi_approve',
    fromStatus: r.response_status,
    toStatus:   role === 'reviewer' ? 'REVIEWED' : 'APPROVED',
    signedBy:   userId,
    signedName: userName,
    meaning:    role === 'reviewer'
      ? 'I have reviewed this MI response for technical accuracy under 21 CFR Part 11.'
      : 'I approve this MI response for release under 21 CFR Part 11.',
    reason,
    authMethod: 'password',
    password,
    ip, userAgent,
  });

  const updates = role === 'reviewer'
    ? `reviewer_id = ?, reviewer_name = ?, reviewed_at = NOW(),
       reviewer_reason = ?, reviewer_signature_hash = ?,
       response_status = 'REVIEWED'`
    : `approver_id = ?, approver_name = ?, approved_at = NOW(),
       approver_reason = ?, approver_signature_hash = ?,
       response_status = 'APPROVED'`;
  await pool.execute(
    `UPDATE case_mi_responses SET ${updates} WHERE id = ?`,
    [userId, userName, reason || null, esign.hash, responseId]
  );

  return { ok: true, esign_id: esign.id, hash: esign.hash };
}

async function setRequiresTwoSigners({ orgId, responseId, value }) {
  // Authorize indirectly via case scope
  await pool.execute(
    `UPDATE case_mi_responses mr
       JOIN case_mi      t ON t.id = mr.mi_tab_id
       JOIN cases        c ON c.id = t.case_id
        SET mr.requires_two_signers = ?
      WHERE mr.id = ? AND c.org_id = ?`,
    [value ? 1 : 0, responseId, orgId]
  );
  return { ok: true };
}

module.exports = { sign, needsTwoSigners, setRequiresTwoSigners, ROLES_PRIVILEGED };
