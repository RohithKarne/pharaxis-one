'use strict';
// Migration 030 — Case form conditional logic/rules engine.

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_form_rules (
      id INT NOT NULL AUTO_INCREMENT,
      org_id INT NOT NULL,
      case_type ENUM('AE','MI','PC','ALL') NOT NULL DEFAULT 'ALL',
      section_name VARCHAR(100) NULL,
      field_name VARCHAR(100) NULL,
      rule_type ENUM('visibility','required','default','validation','cascade') NOT NULL,
      condition_json JSON NULL,
      action_json JSON NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      priority INT NOT NULL DEFAULT 0,
      created_by INT NULL,
      updated_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_case_form_rules_org_case (org_id, case_type, is_active),
      KEY idx_case_form_rules_field (org_id, section_name, field_name, rule_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  try { await conn.execute(`ALTER TABLE picklists ADD COLUMN parent_value_id INT NULL`); } catch (_) {}
  try { await conn.execute(`CREATE INDEX idx_picklists_parent ON picklists(parent_value_id)`); } catch (_) {}
}

async function down(conn) {
  try { await conn.execute('DROP TABLE IF EXISTS case_form_rules'); } catch (_) {}
  try { await conn.execute('DROP INDEX idx_picklists_parent ON picklists'); } catch (_) {}
  try { await conn.execute('ALTER TABLE picklists DROP COLUMN parent_value_id'); } catch (_) {}
}

module.exports = { up, down };
