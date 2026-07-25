'use strict';

/**
 * Migration 100 — Email Case Import (Epic MIMS-29, locked feature #1 2026-07-23)
 *
 * Schema foundation for auto-creating cases from inbound email:
 *  - email_accounts.is_case_intake     — only admin-flagged mailboxes feed the pipeline (MIMS-30)
 *  - cases.secondary_case_type         — multi-issue email: primary type + secondary tag (MIMS-34)
 *  - intake_field_definitions          — per-org required intake fields + case-field mapping (MIMS-31)
 *  - email_case_import_config          — per-org import settings (MIMS-40)
 *  - email_case_sources                — immutable source-email records on the case (MIMS-39)
 *  - 'Email Intake' workflow state     — dedicated entry state (MIMS-34)
 */

async function up(conn) {
  try {
    await conn.execute(
      `ALTER TABLE email_accounts ADD COLUMN is_case_intake TINYINT(1) NOT NULL DEFAULT 0`
    );
  } catch (_) {}

  try {
    await conn.execute(
      `ALTER TABLE cases ADD COLUMN secondary_case_type ENUM('MI','AE','PC') NULL AFTER case_type`
    );
  } catch (_) {}

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS intake_field_definitions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      field_key VARCHAR(100) NOT NULL,
      label VARCHAR(255) NOT NULL,
      aliases VARCHAR(1000) NULL,
      target_entity VARCHAR(50) NOT NULL DEFAULT 'case',
      target_field VARCHAR(100) NOT NULL,
      is_required TINYINT(1) NOT NULL DEFAULT 1,
      sort_order INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_intake_field_org_key (org_id, field_key),
      KEY idx_intake_field_org (org_id, is_active)
    )
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS email_case_import_config (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      is_enabled TINYINT(1) NOT NULL DEFAULT 0,
      confidence_threshold DECIMAL(4,3) NOT NULL DEFAULT 0.850,
      assignment_rule VARCHAR(50) NOT NULL DEFAULT 'round_robin_workload',
      enable_mi TINYINT(1) NOT NULL DEFAULT 1,
      enable_ae TINYINT(1) NOT NULL DEFAULT 1,
      enable_pc TINYINT(1) NOT NULL DEFAULT 1,
      ack_enabled TINYINT(1) NOT NULL DEFAULT 1,
      ack_template TEXT NULL,
      ack_missing_fields_template TEXT NULL,
      sla_hours INT NOT NULL DEFAULT 24,
      alert_recipients VARCHAR(50) NOT NULL DEFAULT 'agent_lead',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_eci_org (org_id)
    )
  `);

  // Immutable source records: the received email is the source document (GVP).
  // No UPDATE/DELETE route will ever exist for this table.
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS email_case_sources (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      case_id INT NOT NULL,
      inquiry_id INT NULL,
      kind VARCHAR(20) NOT NULL DEFAULT 'original',
      message_id VARCHAR(500) NULL,
      sender VARCHAR(500) NULL,
      recipient VARCHAR(500) NULL,
      subject TEXT NULL,
      body MEDIUMTEXT NULL,
      received_at DATETIME NULL,
      eml_path VARCHAR(1000) NULL,
      content_sha256 CHAR(64) NULL,
      extraction JSON NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      KEY idx_ecs_case (case_id),
      KEY idx_ecs_inquiry (inquiry_id),
      KEY idx_ecs_org (org_id)
    )
  `);

  // Dedicated entry state for auto-created cases — channel visible at a glance.
  // Global row (org_id NULL), same pattern as ensureGlobalWorkflowStates.
  await conn.execute(
    `INSERT INTO workflow_states (name, org_id, is_active)
     SELECT 'Email Intake', NULL, 1
     WHERE NOT EXISTS (
       SELECT 1 FROM workflow_states WHERE name = 'Email Intake' LIMIT 1
     )`
  );
}

async function down(conn) {
  try { await conn.execute(`ALTER TABLE email_accounts DROP COLUMN is_case_intake`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE cases DROP COLUMN secondary_case_type`); } catch (_) {}
  try { await conn.execute(`DROP TABLE IF EXISTS intake_field_definitions`); } catch (_) {}
  try { await conn.execute(`DROP TABLE IF EXISTS email_case_import_config`); } catch (_) {}
  try { await conn.execute(`DROP TABLE IF EXISTS email_case_sources`); } catch (_) {}
  try {
    await conn.execute(
      `DELETE FROM workflow_states WHERE name = 'Email Intake' AND org_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM cases WHERE cases.status_id = workflow_states.id LIMIT 1)`
    );
  } catch (_) {}
}

module.exports = { up, down };
