'use strict';

/**
 * leaverCasesService.js — a switched-off user's open cases go to the unassigned queue (MIPM-33).
 *
 * The unassigned queue is every case with no owner, so moving a case means clearing
 * its owner. Only open cases move (not deleted, workflow state not "Closed"); closed
 * cases keep the person as owner so history shows who handled them. Due dates are
 * untouched, so overdue work stays overdue.
 *
 * moveOpenCasesToUnassigned runs on the caller's transaction connection, with the
 * switch-off itself, so either both happen or neither does. History shows the move as
 * done by "System"; the row's user id is the admin whose switch-off caused it, so the
 * audit trail still records who set it off. notifyCaseAdmins runs
 * after the commit: one notification per organisation to its case administrators,
 * or its organisation administrators when it has none.
 */

const pool = require('../database/db');
const { writeCaseAudit } = require('./caseHelpers');
const { createNotifications } = require('./notificationCenterService');

const MOVE_REASON = "Moved to unassigned — owner's access ended";

async function moveOpenCasesToUnassigned(conn, userIds, actorId) {
  const ids = [...new Set((userIds || []).map(Number).filter(Boolean))];
  if (!ids.length) return [];
  const [cases] = await conn.query(
    `SELECT c.id, c.org_id, c.case_owner_id
       FROM cases c
       LEFT JOIN workflow_states ws ON ws.id = c.status_id
      WHERE c.case_owner_id IN (?) AND c.is_deleted = 0
        AND (ws.name IS NULL OR ws.name <> 'Closed')
      FOR UPDATE`,
    [ids]
  );
  if (!cases.length) return [];
  await conn.query('UPDATE cases SET case_owner_id = NULL WHERE id IN (?)', [cases.map((c) => c.id)]);
  for (const c of cases) {
    // Same two rows a manual reassignment writes, recorded as done by the system.
    await writeCaseAudit(c.id, actorId, 'System', 'REASSIGNED', 'case_owner_id', c.case_owner_id, null, conn);
    await writeCaseAudit(c.id, actorId, 'System', 'REASSIGN_REASON', 'reason', null, MOVE_REASON, conn);
  }
  return cases;
}

// Who is told in an organisation: its active case administrators, else its active admins.
async function recipientsFor(orgId) {
  const [caseAdmins] = await pool.query(
    `SELECT DISTINCT u.id FROM users u
       JOIN user_org_access uoa ON uoa.user_id = u.id AND uoa.org_id = ? AND uoa.is_active = 1
      WHERE u.case_admin = 1 AND u.is_active = 1 AND u.is_disabled = 0`,
    [orgId]
  );
  if (caseAdmins.length) return caseAdmins.map((r) => r.id);
  const [admins] = await pool.query(
    `SELECT DISTINCT u.id FROM users u
       JOIN user_org_access uoa ON uoa.user_id = u.id AND uoa.org_id = ? AND uoa.is_active = 1
      WHERE COALESCE(uoa.role_at_org, u.role) = 'admin' AND u.is_active = 1 AND u.is_disabled = 0`,
    [orgId]
  );
  return admins.map((r) => r.id);
}

async function notifyCaseAdmins(movedCases) {
  const byOrgAndOwner = new Map();
  for (const c of movedCases || []) {
    const key = `${c.org_id}:${c.case_owner_id}`;
    byOrgAndOwner.set(key, (byOrgAndOwner.get(key) || 0) + 1);
  }
  for (const [key, count] of byOrgAndOwner) {
    const [orgId, ownerId] = key.split(':').map(Number);
    const [[owner]] = await pool.query('SELECT name FROM users WHERE id = ?', [ownerId]);
    const recipients = await recipientsFor(orgId);
    if (!recipients.length) {
      console.error(`[MIPM-33] No case administrator or administrator to tell about ${count} moved case(s) in organisation ${orgId}.`);
      continue;
    }
    await createNotifications(recipients, {
      category: 'case',
      title: `${count} case${count === 1 ? '' : 's'} moved to unassigned`,
      message: `${owner?.name || 'A user'}'s access ended. Their ${count} open case${count === 1 ? ' is' : 's are'} in the unassigned queue, ready to assign.`,
      linkUrl: '/cases?tab=unassigned',
      metadata: { reason: 'owner_access_ended', owner_id: ownerId, org_id: orgId, count },
    });
  }
}

module.exports = { moveOpenCasesToUnassigned, notifyCaseAdmins, MOVE_REASON };
