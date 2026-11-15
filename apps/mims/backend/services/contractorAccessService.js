'use strict';

// L3 (Rohith, 2026-11-13): a personal-email contractor's access to an organisation
// ends on its "Access ends on" day. Run nightly: removes them from that organisation
// only, moves their open cases there to unassigned (case admins are told), records
// it in the audit log, and ends their sessions so the next sign-in shows only the
// organisations they still have.

const pool = require('../database/db');
const { moveOpenCasesToUnassigned, notifyCaseAdmins } = require('./leaverCasesService');
const { logAudit } = require('../utils/auditLog');
const { endAllSessions } = require('../middleware/auth');

async function sweepEndedContractorAccess() {
  const [due] = await pool.execute(
    `SELECT uoa.user_id, uoa.org_id, DATE_FORMAT(uoa.access_ends_on, '%Y-%m-%d') AS ends_on, u.email
       FROM user_org_access uoa JOIN users u ON u.id = uoa.user_id
      WHERE uoa.is_active = 1 AND uoa.access_ends_on IS NOT NULL AND uoa.access_ends_on <= CURDATE()`);
  const ended = [];
  for (const row of due) {
    const conn = await pool.getConnection();
    let moved = [];
    try {
      await conn.beginTransaction();
      await conn.execute('UPDATE user_org_access SET is_active = 0, ended_with_user = 0 WHERE user_id = ? AND org_id = ?', [row.user_id, row.org_id]);
      moved = await moveOpenCasesToUnassigned(conn, [row.user_id], row.user_id, row.org_id);
      await logAudit(null, 'System', 'CONTRACTOR_ACCESS_ENDED', 'user_org_access', row.user_id,
        { org_id: row.org_id, email: row.email, access_ends_on: row.ends_on, cases_moved_to_unassigned: moved.length }, null, null, null, conn);
      await conn.commit();
    } catch (err) {
      await conn.rollback().catch(() => {});
      throw err;
    } finally {
      conn.release();
    }
    await endAllSessions(row.user_id).catch(() => {});
    if (moved.length) await notifyCaseAdmins(moved).catch(() => {});
    ended.push({ user_id: row.user_id, org_id: row.org_id, cases: moved.length });
  }
  return ended;
}

module.exports = { sweepEndedContractorAccess };
