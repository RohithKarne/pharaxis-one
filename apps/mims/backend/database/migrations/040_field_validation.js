'use strict';
// Migration 040 — Theme 3 Inline Validation (Wave 1).
// Extends field_setup with rich validation knobs + introduces phase-aware
// required rules. Per cf.theme3_inline_validation flag (strict_mode=1, so
// legacy + new code paths coexist until QA-approved).

async function up(conn) {
  // ── A. Extend field_setup with validation columns ──────────────────────────
  const adds = [
    `ALTER TABLE field_setup ADD COLUMN format_hint     VARCHAR(120) NULL`,   // e.g. 'MM/DD/YYYY', 'NDC-####-####'
    `ALTER TABLE field_setup ADD COLUMN validation_regex VARCHAR(500) NULL`,   // user-defined regex
    `ALTER TABLE field_setup ADD COLUMN validation_message VARCHAR(255) NULL`, // message shown on regex failure
    `ALTER TABLE field_setup ADD COLUMN min_value DECIMAL(18,4) NULL`,         // numeric/date range floor
    `ALTER TABLE field_setup ADD COLUMN max_value DECIMAL(18,4) NULL`,         // numeric/date range ceiling
    `ALTER TABLE field_setup ADD COLUMN min_length INT NULL`,                  // text length floor
    `ALTER TABLE field_setup ADD COLUMN duplicate_check TINYINT(1) NOT NULL DEFAULT 0`, // enable duplicate guard
    `ALTER TABLE field_setup ADD COLUMN duplicate_scope VARCHAR(30) NOT NULL DEFAULT 'org'`, // 'org' | 'global' | 'case'
    `ALTER TABLE field_setup ADD COLUMN duplicate_match VARCHAR(20) NOT NULL DEFAULT 'exact'`, // 'exact' | 'case-insensitive' | 'normalized'
  ];
  for (const sql of adds) { try { await conn.execute(sql); } catch (_) {} }

  // ── B. Phase-aware required rules ──────────────────────────────────────────
  // A field can be required only in certain workflow phases (e.g. "intake → submitted"
  // requires reporter_name but "draft" doesn't). One row per (field, phase) combo.
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS field_phase_required (
      id            INT NOT NULL AUTO_INCREMENT,
      org_id        INT NULL,                    -- NULL = global / shared
      section_name  VARCHAR(120) NOT NULL,
      field_name    VARCHAR(120) NOT NULL,
      phase         VARCHAR(60)  NOT NULL,       -- workflow phase name, e.g. 'submitted','approved'
      is_required   TINYINT(1) NOT NULL DEFAULT 1,
      message       VARCHAR(255) NULL,           -- shown in the validation error
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_phase_required (org_id, section_name, field_name, phase),
      KEY idx_phase_field (section_name, field_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ── C. Duplicate detection log (audit trail for soft / hard hits) ─────────
  // When duplicate_check=1 and a write happens, the validation engine records
  // a row here so the inspector can review near-miss patterns. Hard hits block
  // the save; soft hits log + warn.
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS duplicate_detection_log (
      id            BIGINT NOT NULL AUTO_INCREMENT,
      org_id        INT NOT NULL,
      entity_type   VARCHAR(40) NOT NULL,
      entity_id     BIGINT NULL,
      section_name  VARCHAR(120) NOT NULL,
      field_name    VARCHAR(120) NOT NULL,
      submitted_value VARCHAR(500) NULL,
      matched_entity_id BIGINT NULL,
      severity      ENUM('soft','hard') NOT NULL DEFAULT 'soft',
      decided_by    INT NULL,             -- user who overrode a soft warning
      decided_at    DATETIME NULL,
      detected_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_dup_entity (entity_type, entity_id),
      KEY idx_dup_org    (org_id, detected_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function down(conn) {
  try { await conn.execute(`DROP TABLE IF EXISTS duplicate_detection_log`); } catch (_) {}
  try { await conn.execute(`DROP TABLE IF EXISTS field_phase_required`); } catch (_) {}
  const cols = [
    'format_hint','validation_regex','validation_message',
    'min_value','max_value','min_length',
    'duplicate_check','duplicate_scope','duplicate_match',
  ];
  for (const c of cols) {
    try { await conn.execute(`ALTER TABLE field_setup DROP COLUMN ${c}`); } catch (_) {}
  }
}

module.exports = { up, down };
