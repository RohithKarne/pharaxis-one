'use strict';

/**
 * Migration 184 — Group Security lists only permissions that do something
 * (access review, Saad 2026-10-14).
 *
 * WHY
 * The Group Security screen offered 80 permissions. 46 were checked nowhere:
 * ticking them changed nothing. They were
 *   - every "admin." permission: MIMS Admin is open to administrators only,
 *     and an administrator held every "admin." permission whatever was ticked;
 *   - permissions for screens that do not exist (chat, case query, insight)
 *     or that the module already decides (view inbox, browse and download
 *     content, view reports and transmissions);
 *   - case permissions no route asks for (AE and PC view, edit and submit,
 *     comments, contacts, privacy and ICSR view, draft letter, review case,
 *     bulk action, export cases).
 * Two permissions had two rows each, with different defaults. And many
 * defaults named a "manager" role that no person can have.
 *
 * WHAT
 * Removes those permissions, their grants and the conflict rules that named
 * them, keeps one row of each duplicate, drops "manager" from the defaults,
 * and keeps one of the two identical author-versus-approver rules.
 */

const REMOVED = [
  'admin.access.approve', 'admin.access.manage', 'admin.audit.export', 'admin.audit.view',
  'admin.auth_policy', 'admin.configuration', 'admin.division_parameters', 'admin.documents',
  'admin.escalation', 'admin.exception_log', 'admin.security_groups', 'admin.setup',
  'admin.system_parameters', 'admin.tables', 'admin.users', 'admin.view_data',
  'case.ae.edit', 'case.ae.submit', 'case.ae.view', 'case.pc.edit', 'case.pc.submit', 'case.pc.view',
  'case.bulk_action', 'case.comment.add', 'case.comment.delete', 'case.contact.manage',
  'case.dppr.view', 'case.export', 'case.export_all', 'case.icsr.view', 'case.letter.draft', 'case.review',
  'casequery.run', 'casequery.view', 'chat.participate', 'chat.view', 'insight.view',
  'content.browse', 'content.download', 'content.module.manage', 'content.template.configure',
  'inbox.notes', 'inbox.view', 'reports.view', 'transmission.manage', 'transmission.view',
];

async function up(conn) {
  const marks = REMOVED.map(() => '?').join(',');
  await conn.execute(`DELETE FROM access_group_privileges WHERE privilege_key IN (${marks})`, REMOVED);
  await conn.execute(`DELETE FROM access_activity_privileges WHERE privilege_key IN (${marks})`, REMOVED);
  await conn.execute(
    `DELETE FROM access_sod_rules WHERE first_privilege IN (${marks}) OR conflicting_privilege IN (${marks})`,
    [...REMOVED, ...REMOVED]
  );
  // Rules 1 and 5 were the same pair (author against approver); keep the blocking one.
  await conn.execute("DELETE FROM access_sod_rules WHERE rule_key = 'author_cannot_approve_content'");

  // One row per permission and organisation: keep the row with the most defaults.
  const [dupes] = await conn.execute(
    `SELECT privilege_key, org_id FROM access_activity_privileges
      GROUP BY privilege_key, org_id HAVING COUNT(*) > 1`
  );
  for (const { privilege_key: key, org_id: orgId } of dupes) {
    const [rows] = await conn.execute(
      `SELECT id FROM access_activity_privileges
        WHERE privilege_key = ? AND org_id <=> ?
        ORDER BY JSON_LENGTH(COALESCE(default_allowed_roles, JSON_ARRAY())) DESC, id ASC`,
      [key, orgId]
    );
    const extra = rows.slice(1).map((r) => r.id);
    if (extra.length) await conn.execute(`DELETE FROM access_activity_privileges WHERE id IN (${extra.map(() => '?').join(',')})`, extra);
  }

  // No person has the "manager" role.
  const [withManager] = await conn.execute(
    `SELECT id, default_allowed_roles FROM access_activity_privileges
      WHERE JSON_CONTAINS(COALESCE(default_allowed_roles, JSON_ARRAY()), '"manager"')`
  );
  for (const row of withManager) {
    const roles = typeof row.default_allowed_roles === 'string' ? JSON.parse(row.default_allowed_roles) : row.default_allowed_roles;
    await conn.execute('UPDATE access_activity_privileges SET default_allowed_roles = ? WHERE id = ?',
      [JSON.stringify(roles.filter((r) => r !== 'manager')), row.id]);
  }
}

module.exports = { up };
