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

module.exports = { getUserModules };
