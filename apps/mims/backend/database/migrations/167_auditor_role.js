'use strict';

/**
 * Migration 167 — a read-only role for the Read-only Auditor template.
 *
 * A person's capabilities are their group's grants plus their role's defaults.
 * The Read-only Auditor template granted only "view reports" but gave the role
 * "reviewer", whose defaults include updating, closing and approving cases and
 * approving transmissions, so a read-only auditor could change a case. The
 * template now gives "auditor", a role whose defaults are viewing cases and
 * viewing reports, and nothing else.
 *
 * Groups made from that template that still give "reviewer" move to
 * "auditor", and so do the people in them. A group whose role an
 * administrator has changed is left alone.
 */

const MODULES = {
  mims_core: 1, case_mgmt: 1, browse_content: 1, reports: 1, analytics: 1, data_visualization: 1,
  inbox: 0, case_query: 0, utilities: 0, transmissions: 0, user_mgmt: 0, admin_console: 0,
  content_mgmt: 0, platform_admin_console: 0,
};

const VIEW_PRIVILEGES = ['case.view', 'reports.view'];

async function up(conn) {
  for (const [module, canAccess] of Object.entries(MODULES)) {
    await conn.execute(
      'INSERT INTO role_permissions (role, module, can_access) SELECT ?, ?, ? FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM role_permissions WHERE role = ? AND module = ?)',
      ['auditor', module, canAccess, 'auditor', module]
    );
  }

  for (const key of VIEW_PRIVILEGES) {
    await conn.execute(
      `UPDATE access_activity_privileges
          SET default_allowed_roles = JSON_ARRAY_APPEND(COALESCE(default_allowed_roles, JSON_ARRAY()), '$', 'auditor')
        WHERE privilege_key = ?
          AND NOT JSON_CONTAINS(COALESCE(default_allowed_roles, JSON_ARRAY()), '"auditor"')`,
      [key]
    );
  }

  const [groups] = await conn.execute(
    `SELECT id FROM security_groups
      WHERE template_key = 'readonly_auditor'
        AND JSON_UNQUOTE(JSON_EXTRACT(privileges, '$.role')) = 'reviewer'`
  );
  for (const { id } of groups) {
    await conn.execute(
      `UPDATE security_groups SET privileges = JSON_SET(privileges, '$.role', 'auditor') WHERE id = ?`,
      [id]
    );
    await conn.execute(
      `UPDATE users SET role = 'auditor'
        WHERE role = 'reviewer' AND security_group_id = ?`,
      [id]
    );
    await conn.execute(
      `UPDATE user_org_access uoa
         JOIN users u ON u.id = uoa.user_id
          SET uoa.role_at_org = 'auditor'
        WHERE uoa.role_at_org = 'reviewer' AND u.security_group_id = ?`,
      [id]
    );
  }
}

async function down(_conn) {}

module.exports = { up, down };
