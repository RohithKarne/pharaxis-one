'use strict';
// Migration 034 — User preferences (Saved Views v1).
// Stores per-user "saved views" of filter combinations on admin list screens.

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      id          INT NOT NULL AUTO_INCREMENT,
      user_id     INT NOT NULL,
      screen_key  VARCHAR(64) NOT NULL,         -- e.g. 'users', 'organizations'
      view_name   VARCHAR(120) NOT NULL,
      filter_json JSON NOT NULL,
      is_default  TINYINT(1) NOT NULL DEFAULT 0,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_user_screen_view (user_id, screen_key, view_name),
      KEY idx_user_screen (user_id, screen_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function down(conn) {
  try { await conn.execute(`DROP TABLE IF EXISTS user_preferences`); } catch (_) {}
}

module.exports = { up, down };
