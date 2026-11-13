'use strict';

/**
 * Migration 194 — A4, screens per organisation (Rohith, 2026-11-13).
 * user_module_permissions gets org_id: 0 = applies in every organisation (all
 * existing rows, and the platform-console permission); N = only in organisation N,
 * applied on top. 0, not NULL, so the unique key and ON DUPLICATE KEY UPDATE work.
 */

async function up(conn) {
  const [cols] = await conn.execute("SHOW COLUMNS FROM user_module_permissions LIKE 'org_id'");
  if (!cols.length) {
    await conn.execute('ALTER TABLE user_module_permissions ADD COLUMN org_id INT NOT NULL DEFAULT 0 AFTER user_id');
  }
  const [idx] = await conn.execute("SHOW INDEX FROM user_module_permissions WHERE Key_name = 'uq_user_module'");
  const cols2 = idx.map((r) => r.Column_name);
  if (idx.length && !cols2.includes('org_id')) {
    await conn.execute('ALTER TABLE user_module_permissions DROP INDEX uq_user_module, ADD UNIQUE KEY uq_user_module (user_id, module, org_id)');
  } else if (!idx.length) {
    await conn.execute('ALTER TABLE user_module_permissions ADD UNIQUE KEY uq_user_module (user_id, module, org_id)');
  }
}

async function down(_conn) {}

module.exports = { up, down };
