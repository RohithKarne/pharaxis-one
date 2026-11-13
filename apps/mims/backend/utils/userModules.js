'use strict';

const pool = require('../database/db');
const { PRIMARY_PLATFORM_ADMIN_MODULE } = require('./adminScope');

// A user's modules are their role's defaults (role_permissions, edited in Access
// Configurations) with their personal rows on top: a personal row grants or
// removes one module. Before MIPM-134 only personal rows were read, so anyone
// created from Add / Edit Users — which writes none — signed in to "No System
// Access". The platform-admin console is never inherited from a role default:
// it is granted to a person or not at all.
//
// A4 (Rohith, 2026-11-13): screens follow the organisation. With orgId, the role is
// the person's role in that organisation, and personal rows for that organisation
// (org_id = orgId) apply on top of the ones for every organisation (org_id = 0).
// Without orgId (no organisation in context), the person-wide role and org_id 0.
async function roleIn(userId, orgId, conn = pool) {
  const [[user]] = await conn.execute('SELECT role FROM users WHERE id = ?', [userId]);
  if (!orgId || user?.role === 'platform_admin') return user?.role || '';
  const [[access]] = await conn.execute(
    'SELECT role_at_org FROM user_org_access WHERE user_id = ? AND org_id = ? AND is_active = 1 LIMIT 1', [userId, orgId]);
  return access?.role_at_org || user?.role || '';
}

async function personalRows(userId, orgId, conn = pool) {
  const [rows] = await conn.execute(
    'SELECT module, can_access, org_id FROM user_module_permissions WHERE user_id = ? AND org_id IN (0, ?) ORDER BY org_id ASC',
    [userId, Number(orgId) || 0]);
  return rows;
}

async function getUserModules(userId, orgId = null, conn = pool) {
  const role = await roleIn(userId, orgId, conn);
  const [roleRows] = await conn.execute(
    'SELECT module FROM role_permissions WHERE role = ? AND can_access = 1 AND module <> ?',
    [role, PRIMARY_PLATFORM_ADMIN_MODULE]
  );
  const modules = new Set(roleRows.map(r => r.module));
  for (const row of await personalRows(userId, orgId, conn)) { // org 0 first, then this organisation
    if (row.can_access) modules.add(row.module);
    else modules.delete(row.module);
  }
  return [...modules];
}

// The screens a person can be given (access review, 2026-10-14). Six more
// module keys existed (case management, case query, utilities, analytics, user
// management, data visualisation) with no screen behind them.
const SCREEN_MODULES = ['mims_core', 'inbox', 'transmissions', 'browse_content', 'content_mgmt', 'reports', 'admin_console'];

// The modules a role opens by default.
async function getRoleModules(role, conn = pool) {
  const [rows] = await conn.execute('SELECT module FROM role_permissions WHERE role = ? AND can_access = 1', [role || '']);
  return rows.map((r) => r.module);
}

// Give a person exactly these screens (from `among`) in one organisation (A4), or
// in every organisation when orgId is empty. Only differences from what they would
// otherwise have there (role in that organisation, plus their org-0 rows) are stored,
// so a screen can be taken away as well as given; other modules are left alone.
async function setUserModules(conn, userId, modules, among = SCREEN_MODULES, orgId = null) {
  const scope = Number(orgId) || 0;
  const role = await roleIn(userId, scope || null, conn);
  const base = new Set(await getRoleModules(role, conn));
  if (scope) {
    const [wide] = await conn.execute('SELECT module, can_access FROM user_module_permissions WHERE user_id = ? AND org_id = 0', [userId]);
    for (const r of wide) { if (r.can_access) base.add(r.module); else base.delete(r.module); }
  }
  for (const module of among) {
    const want = modules.includes(module);
    if (want === base.has(module)) {
      await conn.execute('DELETE FROM user_module_permissions WHERE user_id = ? AND module = ? AND org_id = ?', [userId, module, scope]);
    } else {
      await conn.execute(
        `INSERT INTO user_module_permissions (user_id, org_id, module, can_access) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE can_access = VALUES(can_access)`,
        [userId, scope, module, want ? 1 : 0]
      );
    }
  }
}

module.exports = { getUserModules, getRoleModules, setUserModules, roleIn, SCREEN_MODULES };
