'use strict';
// Migration 041 — Theme 2 Smart Field Behaviors (Wave 2).
// Holds the rule definitions admins configure via Customize Forms ⚙ Smart:
//   - auto_calc:    derive this field's value from a formula over other fields
//   - smart_default: prefill a field on case creation (constant, lookup, or expression)
//   - typeahead:    declare a remote source for autocomplete suggestions

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS smart_field_rules (
      id              INT NOT NULL AUTO_INCREMENT,
      org_id          INT NULL,                          -- NULL = global / shared
      section_name    VARCHAR(120) NOT NULL,
      field_name      VARCHAR(120) NOT NULL,
      rule_type       ENUM('auto_calc','smart_default','typeahead') NOT NULL,
      formula         TEXT NULL,                         -- safe-eval expression for auto_calc / smart_default
      lookup_source   VARCHAR(80) NULL,                  -- typeahead source key, e.g. 'products','contacts','meddra'
      lookup_filter   TEXT NULL,                         -- optional JSON filter
      depends_on      TEXT NULL,                         -- comma-separated field_names; auto_calc retriggers when any change
      trigger_on      ENUM('change','create','blur') NOT NULL DEFAULT 'change',
      enabled         TINYINT(1) NOT NULL DEFAULT 1,
      priority        INT NOT NULL DEFAULT 0,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_smart_rule (org_id, section_name, field_name, rule_type),
      KEY idx_smart_section (section_name),
      KEY idx_smart_field   (section_name, field_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Seed a couple of reasonable defaults for common case fields. Tenants can
  // override per-org. All disabled by default to keep behavior unchanged.
  const seed = [
    // case_id = 'C' + YYYY + '-' + auto-increment (smart default on create)
    [null, 'case_meta', 'case_number', 'smart_default',
     "'C' + new Date().getFullYear() + '-' + (id || '----')", null, null, null, 'create', 0, 100],
    // patient_age_years from date_of_birth
    [null, 'patient', 'age_years', 'auto_calc',
     "dob ? Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000) : null",
     null, null, 'dob', 'change', 0, 50],
  ];
  for (const row of seed) {
    await conn.execute(
      `INSERT IGNORE INTO smart_field_rules
        (org_id, section_name, field_name, rule_type, formula,
         lookup_source, lookup_filter, depends_on, trigger_on, enabled, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row
    );
  }
}

async function down(conn) {
  try { await conn.execute(`DROP TABLE IF EXISTS smart_field_rules`); } catch (_) {}
}

module.exports = { up, down };
