'use strict';

const pool = require('../database/db');
const { PRIMARY_PLATFORM_ADMIN_MODULE } = require('./adminScope');

// A user's modules are their role's defaults (role_permissions, edited in Access
// Configurations) with their personal rows on top: a personal row grants or
// removes one module. Before MIPM-134 only personal rows were read, so anyone
// created from Add / Edit Users — which writes none — signed in to "No System
// Access". The platform-admin console is never inherited from a role default:
// it is granted to a person or not at all.
async function getUserModules(userId) {
  const [[user]] = await pool.execute('SELECT role FROM users WHERE id = ?', [userId]);
  const [roleRows] = await pool.execute(
    'SELECT module FROM role_permissions WHERE role = ? AND can_access = 1 AND module <> ?',
    [user?.role || '', PRIMARY_PLATFORM_ADMIN_MODULE]
  );
  const [userRows] = await pool.execute(
    'SELECT module, can_access FROM user_module_permissions WHERE user_id = ?',
    [userId]
  );
  const modules = new Set(roleRows.map(r => r.module));
  for (const row of userRows) {
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

// Give a person exactly these screens (from `among`). Only differences from
// their role's defaults are stored, so a screen can be taken away as well as
// given; rows for other modules (the platform console) are left alone.
async function setUserModules(conn, userId, modules, among = SCREEN_MODULES) {
  const [[user]] = await conn.execute('SELECT role FROM users WHERE id = ?', [userId]);
  const byRole = new Set(await getRoleModules(user?.role, conn));
  for (const module of among) {
    const want = modules.includes(module);
    if (want === byRole.has(module)) {
      await conn.execute('DELETE FROM user_module_permissions WHERE user_id = ? AND module = ?', [userId, module]);
    } else {
      await conn.execute(
        `INSERT INTO user_module_permissions (user_id, module, can_access) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE can_access = VALUES(can_access)`,
        [userId, module, want ? 1 : 0]
      );
    }
  }
}

module.exports = { getUserModules, getRoleModules, setUserModules, SCREEN_MODULES };
