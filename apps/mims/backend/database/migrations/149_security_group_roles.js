'use strict';

/**
 * Migration 149 — every security group says which role it gives (MIPM-134).
 *
 * Add / Edit Users takes a person's role from the group chosen for them
 * (privileges.role). The two default groups from migration 088 and the
 * enterprise templates seeded from Access Configurations were created without
 * one, so everyone added to "Administrators" was saved as an agent.
 *
 * Only a group with no role yet is changed; a role an administrator has set is
 * kept. Groups with neither a known name nor a template stay as they are.
 */

const DEFAULT_GROUP_ROLES = [
  ['Administrators', 'admin'],
  ['Platform Administrators', 'platform_admin'],
];

const TEMPLATE_ROLES = [
  ['mims_admin', 'admin'],
  ['mi_agent', 'agent'],
  ['reviewer', 'reviewer'],
  ['manager', 'admin'],
  ['content_manager', 'content_manager'],
  ['readonly_auditor', 'reviewer'],
];

const NO_ROLE = "(privileges IS NULL OR JSON_EXTRACT(privileges, '$.role') IS NULL)";
const SET_ROLE = "privileges = JSON_SET(COALESCE(privileges, JSON_OBJECT()), '$.role', ?)";

async function up(conn) {
  for (const [name, role] of DEFAULT_GROUP_ROLES) {
    await conn.execute(`UPDATE security_groups SET ${SET_ROLE} WHERE name = ? AND org_id IS NULL AND ${NO_ROLE}`, [role, name]);
  }
  for (const [key, role] of TEMPLATE_ROLES) {
    await conn.execute(`UPDATE security_groups SET ${SET_ROLE} WHERE template_key = ? AND ${NO_ROLE}`, [role, key]);
  }
}

async function down(_conn) {}

module.exports = { up, down };
