'use strict';
// Migration 030 — Track schema snapshots through the migration system.

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS mims_schema_snapshots (
      id BIGINT NOT NULL AUTO_INCREMENT,
      snapshot_json LONGTEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_schema_snapshots_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function down(conn) {
  try { await conn.execute('DROP TABLE IF EXISTS mims_schema_snapshots'); } catch (_) {}
}

module.exports = { up, down };
