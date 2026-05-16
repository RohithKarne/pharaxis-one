'use strict';
// Migration 046 — Theme 8 Case-level Smart Actions (Wave 4).
// case_templates: prebuilt case shells (e.g. "fatal AE skeleton")
// case_macros:    multi-step canned actions applied to a case
// case_macro_steps: ordered steps inside a macro
// user_pinned_cases: per-user pin list
// user_recent_cases:per-user "last 25 opened" cache (TTL'd via cleanup)

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_templates (
      id            INT NOT NULL AUTO_INCREMENT,
      org_id        INT NULL,
      case_type     VARCHAR(40) NOT NULL,        -- 'ae','pc','mi'
      name          VARCHAR(160) NOT NULL,
      description   VARCHAR(500) NULL,
      payload_json  JSON NOT NULL,               -- prefilled section→{field:value} map
      created_by    INT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_case_template (org_id, case_type, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_macros (
      id            INT NOT NULL AUTO_INCREMENT,
      org_id        INT NULL,
      name          VARCHAR(160) NOT NULL,
      description   VARCHAR(500) NULL,
      created_by    INT NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_case_macro (org_id, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_macro_steps (
      id            INT NOT NULL AUTO_INCREMENT,
      macro_id      INT NOT NULL,
      step_index    INT NOT NULL,
      action        VARCHAR(40) NOT NULL,        -- 'set_field','assign','add_watcher','comment','transition','tag'
      action_args   JSON NOT NULL,
      PRIMARY KEY (id),
      KEY idx_macro_steps (macro_id, step_index),
      FOREIGN KEY (macro_id) REFERENCES case_macros(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS user_pinned_cases (
      id            INT NOT NULL AUTO_INCREMENT,
      org_id        INT NOT NULL,
      user_id       INT NOT NULL,
      case_id       BIGINT NOT NULL,
      pinned_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      note          VARCHAR(255) NULL,
      sort_order    INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      UNIQUE KEY uq_pinned (user_id, case_id),
      KEY idx_pinned_user (user_id, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS user_recent_cases (
      id            INT NOT NULL AUTO_INCREMENT,
      org_id        INT NOT NULL,
      user_id       INT NOT NULL,
      case_id       BIGINT NOT NULL,
      last_seen_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_recent (user_id, case_id),
      KEY idx_recent_user (user_id, last_seen_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function down(conn) {
  for (const t of ['user_recent_cases','user_pinned_cases','case_macro_steps','case_macros','case_templates']) {
    try { await conn.execute(`DROP TABLE IF EXISTS ${t}`); } catch (_) {}
  }
}

module.exports = { up, down };
