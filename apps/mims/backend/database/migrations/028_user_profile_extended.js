'use strict';
// Migration 028 — Extended User Profile
// Adds new fields to the users table required for
// MIMS Admin > System > Security > Add / Edit Users.

async function up(conn) {
  // Idempotent column additions — safe to re-run
  const cols = [
    ['user_id',           'VARCHAR(50) NULL'],
    ['initials',          'VARCHAR(10) NULL'],
    ['security_group_id', 'INT NULL'],
    ['network_user_id',   'VARCHAR(255) NULL'],
    ['department',        'VARCHAR(255) NULL'],
    ['is_primary_ref',    'TINYINT(1) NOT NULL DEFAULT 0'],
    ['is_disabled',       'TINYINT(1) NOT NULL DEFAULT 0'],
    ['access_admin_site', 'TINYINT(1) NOT NULL DEFAULT 0'],
    ['case_admin',        'TINYINT(1) NOT NULL DEFAULT 0'],
    ['password_expires_at','DATETIME NULL'],
  ];

  for (const [col, def] of cols) {
    try {
      await conn.execute(`ALTER TABLE users ADD COLUMN \`${col}\` ${def}`);
    } catch (_) { /* column already exists — safe to ignore */ }
  }

  // Globally unique index on user_id (nullable — existing rows stay NULL)
  try {
    await conn.execute(`ALTER TABLE users ADD UNIQUE KEY uq_users_user_id (user_id)`);
  } catch (_) {}
}

async function down(conn) {
  const cols = [
    'user_id', 'initials', 'security_group_id', 'network_user_id',
    'department', 'is_primary_ref', 'is_disabled',
    'access_admin_site', 'case_admin', 'password_expires_at',
  ];
  for (const col of cols) {
    try { await conn.execute(`ALTER TABLE users DROP COLUMN \`${col}\``); } catch (_) {}
  }
  try { await conn.execute(`ALTER TABLE users DROP KEY uq_users_user_id`); } catch (_) {}
}

module.exports = { up, down };
