'use strict';

/**
 * Migration 126 — switching a user back on gives back the organisation access
 * that switching them off took away (MIPM-35).
 *
 * WHY
 * When a platform admin switches a user off, every organisation-access row of
 * theirs is switched off too (M-16). Switching them back on restored the
 * account but none of that access, and while it was off an org admin could no
 * longer see or re-enable the person at all.
 *
 * WHAT
 * user_org_access.ended_with_user marks a row that was switched off only
 * because its user was. Switching the user back on restores exactly the marked
 * rows; a deliberate change to a person's organisations clears the mark.
 *
 * Rows switched off before this ran carry no mark, so they stay off: we cannot
 * tell them apart from access an admin removed on purpose.
 *
 * Idempotent: the column is added only if it is missing.
 */

async function up(conn) {
  const [rows] = await conn.execute(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'user_org_access'
        AND column_name = 'ended_with_user'
      LIMIT 1`
  );
  if (rows.length) return; // already present
  await conn.execute(
    'ALTER TABLE user_org_access ADD COLUMN ended_with_user TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active'
  );
}

module.exports = { up };
