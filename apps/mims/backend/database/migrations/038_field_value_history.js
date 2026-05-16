'use strict';
// Migration 038 — field_value_history (Wave 0 foundation).
// Captures every change to a structured case field for:
//   - Theme 2 (field history popover)
//   - Theme 9 (field-level audit with diff + reason-for-change)
//   - Inspector-ready case chronology PDF export
// Distinct from `audit_logs` (which is action-level) and `case_audit_trail`
// (which is case-level). This is per-field, immutable.

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS field_value_history (
      id              BIGINT NOT NULL AUTO_INCREMENT,
      org_id          INT NOT NULL,
      entity_type     VARCHAR(40) NOT NULL,   -- 'case', 'case_ae_version', 'case_pc_version', 'case_mi_response', etc.
      entity_id       INT NOT NULL,
      section_name    VARCHAR(120) NOT NULL,
      field_name      VARCHAR(120) NOT NULL,
      old_value       TEXT NULL,
      new_value       TEXT NULL,
      changed_by      INT NULL,
      changed_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reason          VARCHAR(500) NULL,      -- captured when Theme 9 "reason-for-change" is active
      request_id      VARCHAR(64) NULL,       -- correlate with audit_logs / observability
      source          VARCHAR(40) DEFAULT 'web', -- 'web' | 'mobile' | 'api' | 'sync'
      PRIMARY KEY (id),
      KEY idx_fvh_entity (entity_type, entity_id, changed_at),
      KEY idx_fvh_org    (org_id, changed_at),
      KEY idx_fvh_user   (changed_by, changed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function down(conn) {
  try { await conn.execute(`DROP TABLE IF EXISTS field_value_history`); } catch (_) {}
}

module.exports = { up, down };
