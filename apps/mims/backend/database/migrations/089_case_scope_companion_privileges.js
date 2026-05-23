'use strict';

const COMPANION_PRIVILEGES = [
  ['case.view_all', 'Cases', 'View all cases', 'View all cases in the organisation', 1, JSON.stringify([])],
  ['case.update_all', 'Cases', 'Update all cases', 'Edit any case in the organisation, not just owned/created cases', 1, JSON.stringify([])],
  ['case.close_all', 'Cases', 'Close all cases', 'Close any case in the organisation, not just owned/created cases', 1, JSON.stringify([])],
  ['case.assign_all', 'Cases', 'Assign all cases', 'Assign or reassign any case in the organisation', 1, JSON.stringify([])],
  ['case.export_all', 'Cases', 'Export all cases', 'Export any case in the organisation', 1, JSON.stringify([])],
  ['case.unmask_all', 'Cases', 'Unmask all case data', 'View masked requester and reporter data for any case in the organisation', 1, JSON.stringify([])],
];

const BACKFILL_PAIRS = [
  ['case.view', 'case.view_all'],
  ['case.update', 'case.update_all'],
  ['case.close', 'case.close_all'],
  ['case.assign', 'case.assign_all'],
  ['case.export', 'case.export_all'],
  ['case.unmask', 'case.unmask_all'],
];

async function up(conn) {
  for (const [key, category, label, description, sensitive, rolesJson] of COMPANION_PRIVILEGES) {
    await conn.execute(
      `INSERT IGNORE INTO access_activity_privileges
         (org_id, privilege_key, category, label, description, is_sensitive, default_allowed_roles, is_active)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, 1)`,
      [key, category, label, description, sensitive, rolesJson]
    );
  }

  for (const [baseKey, companionKey] of BACKFILL_PAIRS) {
    await conn.execute(
      `INSERT IGNORE INTO access_group_privileges (group_id, privilege_key, is_allowed, updated_by)
       SELECT agp.group_id, ?, 1, agp.updated_by
       FROM access_group_privileges agp
       WHERE agp.privilege_key = ? AND agp.is_allowed = 1`,
      [companionKey, baseKey]
    );
  }
}

async function down(_conn) {}

module.exports = { up, down };
