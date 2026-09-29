'use strict';

/**
 * Migration 120 — reviewers may approve response letters (M-86).
 *
 * Decision (Rohith, 2026-09-29): signing off an MI response now needs the
 * "Approve letter" permission (case.letter.approve), which until now nothing
 * checked. Its default roles were manager and admin, so no reviewer could sign
 * off. Reviewers are added to the default roles; agents are not.
 *
 * Only the platform-wide row (org_id NULL) is changed, and only if reviewer is
 * not already there. An organisation that grants or withholds the permission
 * through its security groups keeps its own setting.
 */

async function up(conn) {
  await conn.execute(
    `UPDATE access_activity_privileges
        SET default_allowed_roles = JSON_ARRAY_APPEND(COALESCE(default_allowed_roles, JSON_ARRAY()), '$', 'reviewer')
      WHERE privilege_key = 'case.letter.approve'
        AND org_id IS NULL
        AND NOT JSON_CONTAINS(COALESCE(default_allowed_roles, JSON_ARRAY()), '"reviewer"')`
  );
}

module.exports = { up };
