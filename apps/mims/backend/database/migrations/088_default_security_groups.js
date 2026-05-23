'use strict';

/**
 * Migration 088 — Default global security groups.
 *
 * Guarantees two always-available default groups (org_id NULL = visible under
 * every tenant): "Administrators" and "Platform Administrators". Both are seeded
 * with the full capability catalog as sensible high-privilege defaults (trim per
 * deployment). Idempotent — safe on existing and fresh databases.
 */

const DEFAULT_GROUPS = ['Administrators', 'Platform Administrators'];

async function up(conn) {
  for (const name of DEFAULT_GROUPS) {
    const [existing] = await conn.execute(
      'SELECT id FROM security_groups WHERE name = ? AND org_id IS NULL LIMIT 1', [name]
    );
    let groupId = existing[0]?.id;
    if (!groupId) {
      const [ins] = await conn.execute(
        'INSERT INTO security_groups (name, org_id, is_active, is_template) VALUES (?, NULL, 1, 0)', [name]
      );
      groupId = ins.insertId;
    } else {
      await conn.execute('UPDATE security_groups SET is_active = 1, is_template = 0 WHERE id = ?', [groupId]);
    }
    // Grant the full active catalog (idempotent: clear then re-insert).
    const [caps] = await conn.execute('SELECT DISTINCT privilege_key FROM access_activity_privileges WHERE is_active = 1');
    await conn.execute('DELETE FROM access_group_privileges WHERE group_id = ?', [groupId]);
    for (const c of caps) {
      await conn.execute(
        'INSERT INTO access_group_privileges (group_id, privilege_key, is_allowed) VALUES (?, ?, 1)',
        [groupId, c.privilege_key]
      );
    }
  }
}

async function down(_conn) {}

module.exports = { up, down };
