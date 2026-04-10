require('dotenv').config()
const bcrypt = require('bcrypt')
const mysql = require('mysql2/promise')
const { DEFAULT_SYSTEM_CONFIG, ROLES } = require('../constants')

const DB_NAME = process.env.MYSQL_DATABASE || 'pharaxis_safety_dev'

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'devuser',
  password: process.env.MYSQL_PASSWORD || 'devpass',
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
})

async function createDatabaseIfNeeded() {
  const bootstrapPool = mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'devuser',
    password: process.env.MYSQL_PASSWORD || 'devpass',
    waitForConnections: true,
    connectionLimit: 2
  })

  await bootstrapPool.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``)
  await bootstrapPool.end()
}

async function runSchema() {
  const queries = [
    `CREATE TABLE IF NOT EXISTS organisations (
      org_id INT AUTO_INCREMENT PRIMARY KEY,
      org_name VARCHAR(150) NOT NULL,
      org_slug VARCHAR(150) NOT NULL UNIQUE,
      org_type ENUM('CRO', 'pharma_direct', 'platform') NOT NULL DEFAULT 'pharma_direct',
      status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
      settings_json JSON DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS pharma_clients (
      client_id INT AUTO_INCREMENT PRIMARY KEY,
      parent_org_id INT NOT NULL,
      client_name VARCHAR(150) NOT NULL,
      client_code VARCHAR(100) NOT NULL,
      status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_client_code_per_parent (parent_org_id, client_code),
      FOREIGN KEY (parent_org_id) REFERENCES organisations(org_id)
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      user_id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      client_id INT DEFAULT NULL,
      full_name VARCHAR(120) NOT NULL,
      email VARCHAR(160) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('SUPER_ADMIN', 'CRO_ADMIN', 'SAFETY_SCIENTIST', 'MEDICAL_REVIEWER', 'READ_ONLY') NOT NULL,
      status ENUM('invited', 'active', 'inactive') NOT NULL DEFAULT 'invited',
      must_reset_password TINYINT(1) NOT NULL DEFAULT 1,
      first_login_completed TINYINT(1) NOT NULL DEFAULT 0,
      last_login_at DATETIME DEFAULT NULL,
      created_by INT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_email_org (org_id, email),
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (client_id) REFERENCES pharma_clients(client_id)
    )`,
    `CREATE TABLE IF NOT EXISTS user_invitations (
      invitation_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      client_id INT DEFAULT NULL,
      invited_user_id INT NOT NULL,
      email VARCHAR(160) NOT NULL,
      role ENUM('SUPER_ADMIN', 'CRO_ADMIN', 'SAFETY_SCIENTIST', 'MEDICAL_REVIEWER', 'READ_ONLY') NOT NULL,
      token_hash VARCHAR(128) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      invited_by INT NOT NULL,
      accepted_at DATETIME DEFAULT NULL,
      status ENUM('pending', 'accepted', 'expired', 'cancelled') NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (client_id) REFERENCES pharma_clients(client_id),
      FOREIGN KEY (invited_user_id) REFERENCES users(user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      user_id INT NOT NULL,
      token_hash VARCHAR(128) NOT NULL UNIQUE,
      token_type ENUM('forgot', 'first_login') NOT NULL,
      expires_at DATETIME NOT NULL,
      consumed_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS password_history (
      history_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      user_id INT NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS user_sessions (
      session_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      user_id INT NOT NULL,
      jti VARCHAR(64) NOT NULL UNIQUE,
      issued_at DATETIME NOT NULL,
      last_activity_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME DEFAULT NULL,
      revoked_by INT DEFAULT NULL,
      revoke_reason VARCHAR(255) DEFAULT NULL,
      ip_address VARCHAR(45) DEFAULT NULL,
      user_agent VARCHAR(255) DEFAULT NULL,
      status ENUM('active', 'revoked', 'expired', 'logged_out') NOT NULL DEFAULT 'active',
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS session_activity_log (
      activity_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      user_id INT NOT NULL,
      jti VARCHAR(64) NOT NULL,
      event_type ENUM('login', 'logout', 'revoked', 'timed_out', 'activity') NOT NULL,
      event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ip_address VARCHAR(45) DEFAULT NULL,
      metadata JSON DEFAULT NULL,
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      product_id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      client_id INT DEFAULT NULL,
      product_name VARCHAR(180) NOT NULL,
      product_code VARCHAR(80) NOT NULL,
      status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
      created_by INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_product_code_scope (org_id, client_id, product_code),
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (client_id) REFERENCES pharma_clients(client_id)
    )`,
    `CREATE TABLE IF NOT EXISTS product_indications (
      indication_id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      product_id INT NOT NULL,
      indication_name VARCHAR(180) NOT NULL,
      status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (product_id) REFERENCES products(product_id)
    )`,
    `CREATE TABLE IF NOT EXISTS product_study_codes (
      study_id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      product_id INT NOT NULL,
      study_code VARCHAR(120) NOT NULL,
      status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_product_study (product_id, study_code),
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (product_id) REFERENCES products(product_id)
    )`,
    `CREATE TABLE IF NOT EXISTS case_id_config (
      config_id INT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      case_prefix VARCHAR(20) NOT NULL,
      sequence_padding INT NOT NULL DEFAULT 5,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      updated_by INT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_case_config_org (org_id),
      FOREIGN KEY (org_id) REFERENCES organisations(org_id)
    )`,
    `CREATE TABLE IF NOT EXISTS case_id_sequences (
      sequence_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      case_year YEAR NOT NULL,
      last_sequence INT NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_case_seq_org_year (org_id, case_year),
      FOREIGN KEY (org_id) REFERENCES organisations(org_id)
    )`,
    `CREATE TABLE IF NOT EXISTS system_config (
      system_config_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      config_key VARCHAR(120) NOT NULL,
      config_value TEXT NOT NULL,
      updated_by INT DEFAULT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_system_config (org_id, config_key),
      FOREIGN KEY (org_id) REFERENCES organisations(org_id)
    )`,
    `CREATE TABLE IF NOT EXISTS case_tenant_scope (
      scope_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      client_id INT DEFAULT NULL,
      source_type ENUM('manual', 'api', 'migration') NOT NULL DEFAULT 'manual',
      source_ref VARCHAR(120) DEFAULT NULL,
      created_by INT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_case_scope_org_client (org_id, client_id),
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (client_id) REFERENCES pharma_clients(client_id),
      FOREIGN KEY (created_by) REFERENCES users(user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS safety_cases (
      case_pk_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      client_id INT DEFAULT NULL,
      case_number VARCHAR(40) NOT NULL,
      reporter_name VARCHAR(150) NOT NULL,
      reporter_email VARCHAR(160) DEFAULT NULL,
      patient_reference VARCHAR(120) NOT NULL,
      ae_description TEXT NOT NULL,
      ae_onset_date DATE DEFAULT NULL,
      suspect_product_id INT DEFAULT NULL,
      seriousness ENUM('non_serious', 'serious') NOT NULL DEFAULT 'non_serious',
      causality ENUM('related', 'not_related', 'unknown') NOT NULL DEFAULT 'unknown',
      priority ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
      status ENUM('new', 'triaged', 'in_review', 'closed') NOT NULL DEFAULT 'new',
      received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      regulatory_clock_days INT NOT NULL DEFAULT 15,
      regulatory_due_at DATETIME DEFAULT NULL,
      assigned_medical_reviewer_id INT DEFAULT NULL,
      created_by INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_case_number_org (org_id, case_number),
      INDEX idx_safety_cases_org_client (org_id, client_id),
      INDEX idx_safety_cases_status_priority (org_id, status, priority),
      INDEX idx_safety_cases_due (org_id, regulatory_due_at),
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (client_id) REFERENCES pharma_clients(client_id),
      FOREIGN KEY (suspect_product_id) REFERENCES products(product_id),
      FOREIGN KEY (assigned_medical_reviewer_id) REFERENCES users(user_id),
      FOREIGN KEY (created_by) REFERENCES users(user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS case_workflow_events (
      event_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      case_pk_id BIGINT NOT NULL,
      org_id INT NOT NULL,
      client_id INT DEFAULT NULL,
      from_status ENUM('new', 'triaged', 'in_review', 'closed', 'exception') DEFAULT NULL,
      to_status ENUM('new', 'triaged', 'in_review', 'closed', 'exception') NOT NULL,
      transition_note VARCHAR(255) DEFAULT NULL,
      changed_by INT NOT NULL,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_case_workflow_case (case_pk_id, changed_at),
      FOREIGN KEY (case_pk_id) REFERENCES safety_cases(case_pk_id),
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (client_id) REFERENCES pharma_clients(client_id),
      FOREIGN KEY (changed_by) REFERENCES users(user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS case_record_audit (
      audit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      case_pk_id BIGINT NOT NULL,
      org_id INT NOT NULL,
      client_id INT DEFAULT NULL,
      actor_user_id INT NOT NULL,
      action_type VARCHAR(120) NOT NULL,
      before_value JSON DEFAULT NULL,
      after_value JSON DEFAULT NULL,
      metadata JSON DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_case_audit_case (case_pk_id, created_at),
      INDEX idx_case_audit_org (org_id, created_at),
      FOREIGN KEY (case_pk_id) REFERENCES safety_cases(case_pk_id),
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (client_id) REFERENCES pharma_clients(client_id),
      FOREIGN KEY (actor_user_id) REFERENCES users(user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS case_intake_drafts (
      draft_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      client_id INT DEFAULT NULL,
      draft_key VARCHAR(80) NOT NULL,
      draft_payload JSON NOT NULL,
      created_by INT NOT NULL,
      updated_by INT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_case_draft_scope (org_id, created_by, draft_key),
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (client_id) REFERENCES pharma_clients(client_id),
      FOREIGN KEY (created_by) REFERENCES users(user_id),
      FOREIGN KEY (updated_by) REFERENCES users(user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS case_regulatory_alerts (
      alert_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      case_pk_id BIGINT NOT NULL,
      org_id INT NOT NULL,
      client_id INT DEFAULT NULL,
      alert_type ENUM('due_soon', 'overdue', 'escalated') NOT NULL,
      alert_message VARCHAR(255) NOT NULL,
      resolved_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_case_reg_alert_org (org_id, alert_type, created_at),
      INDEX idx_case_reg_alert_case (case_pk_id, created_at),
      FOREIGN KEY (case_pk_id) REFERENCES safety_cases(case_pk_id),
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (client_id) REFERENCES pharma_clients(client_id)
    )`,
    `CREATE TABLE IF NOT EXISTS case_narratives (
      narrative_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      case_pk_id BIGINT NOT NULL,
      org_id INT NOT NULL,
      client_id INT DEFAULT NULL,
      narrative_version INT NOT NULL,
      narrative_text TEXT NOT NULL,
      generated_by INT NOT NULL,
      approved_by INT DEFAULT NULL,
      approved_at DATETIME DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_case_narrative_version (case_pk_id, narrative_version),
      FOREIGN KEY (case_pk_id) REFERENCES safety_cases(case_pk_id),
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (client_id) REFERENCES pharma_clients(client_id),
      FOREIGN KEY (generated_by) REFERENCES users(user_id),
      FOREIGN KEY (approved_by) REFERENCES users(user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS case_listedness_assessments (
      assessment_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      case_pk_id BIGINT NOT NULL,
      org_id INT NOT NULL,
      client_id INT DEFAULT NULL,
      expectedness ENUM('expected', 'unexpected', 'unknown') NOT NULL DEFAULT 'unknown',
      listedness ENUM('listed', 'unlisted', 'unknown') NOT NULL DEFAULT 'unknown',
      source_label VARCHAR(160) DEFAULT NULL,
      rationale TEXT DEFAULT NULL,
      assessed_by INT NOT NULL,
      assessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_case_listedness_case (case_pk_id, assessed_at),
      FOREIGN KEY (case_pk_id) REFERENCES safety_cases(case_pk_id),
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (client_id) REFERENCES pharma_clients(client_id),
      FOREIGN KEY (assessed_by) REFERENCES users(user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS case_dashboard_filters (
      filter_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      client_id INT DEFAULT NULL,
      created_by INT NOT NULL,
      filter_name VARCHAR(120) NOT NULL,
      filter_payload JSON NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_case_dashboard_filter (org_id, created_by, filter_name),
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (client_id) REFERENCES pharma_clients(client_id),
      FOREIGN KEY (created_by) REFERENCES users(user_id)
    )`,
    `ALTER TABLE safety_cases
      MODIFY COLUMN status ENUM('new', 'triaged', 'in_review', 'closed', 'exception') NOT NULL DEFAULT 'new'`,
    `ALTER TABLE case_workflow_events
      MODIFY COLUMN from_status ENUM('new', 'triaged', 'in_review', 'closed', 'exception') DEFAULT NULL`,
    `ALTER TABLE case_workflow_events
      MODIFY COLUMN to_status ENUM('new', 'triaged', 'in_review', 'closed', 'exception') NOT NULL`,
    `CREATE TABLE IF NOT EXISTS admin_audit_log (
      audit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
      org_id INT NOT NULL,
      actor_user_id INT NOT NULL,
      action_type VARCHAR(120) NOT NULL,
      entity_type VARCHAR(100) NOT NULL,
      entity_id VARCHAR(80) DEFAULT NULL,
      before_value JSON DEFAULT NULL,
      after_value JSON DEFAULT NULL,
      metadata JSON DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_org_created (org_id, created_at),
      INDEX idx_audit_actor (actor_user_id),
      INDEX idx_audit_action (action_type),
      FOREIGN KEY (org_id) REFERENCES organisations(org_id),
      FOREIGN KEY (actor_user_id) REFERENCES users(user_id)
    )`,
    'DROP TRIGGER IF EXISTS trg_case_tenant_scope_insert',
    `CREATE TRIGGER trg_case_tenant_scope_insert
      BEFORE INSERT ON case_tenant_scope
      FOR EACH ROW
      BEGIN
        DECLARE v_org_type VARCHAR(20);
        DECLARE v_parent_org_id INT;

        SELECT org_type INTO v_org_type
        FROM organisations
        WHERE org_id = NEW.org_id
        LIMIT 1;

        IF v_org_type IS NULL THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid org_id on case_tenant_scope';
        END IF;

        IF v_org_type = 'CRO' AND NEW.client_id IS NULL THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CRO case records require client_id';
        END IF;

        IF v_org_type <> 'CRO' AND NEW.client_id IS NOT NULL THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'pharma_direct/platform case records must not include client_id';
        END IF;

        IF NEW.client_id IS NOT NULL THEN
          SELECT parent_org_id INTO v_parent_org_id
          FROM pharma_clients
          WHERE client_id = NEW.client_id
          LIMIT 1;

          IF v_parent_org_id IS NULL OR v_parent_org_id <> NEW.org_id THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'client_id does not belong to org_id';
          END IF;
        END IF;
      END`,
    'DROP TRIGGER IF EXISTS trg_case_tenant_scope_update',
    `CREATE TRIGGER trg_case_tenant_scope_update
      BEFORE UPDATE ON case_tenant_scope
      FOR EACH ROW
      BEGIN
        DECLARE v_org_type VARCHAR(20);
        DECLARE v_parent_org_id INT;

        SELECT org_type INTO v_org_type
        FROM organisations
        WHERE org_id = NEW.org_id
        LIMIT 1;

        IF v_org_type IS NULL THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Invalid org_id on case_tenant_scope';
        END IF;

        IF v_org_type = 'CRO' AND NEW.client_id IS NULL THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CRO case records require client_id';
        END IF;

        IF v_org_type <> 'CRO' AND NEW.client_id IS NOT NULL THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'pharma_direct/platform case records must not include client_id';
        END IF;

        IF NEW.client_id IS NOT NULL THEN
          SELECT parent_org_id INTO v_parent_org_id
          FROM pharma_clients
          WHERE client_id = NEW.client_id
          LIMIT 1;

          IF v_parent_org_id IS NULL OR v_parent_org_id <> NEW.org_id THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'client_id does not belong to org_id';
          END IF;
        END IF;
      END`
  ]

  for (const query of queries) {
    await pool.query(query)
  }

  await ensureColumn({
    tableName: 'safety_cases',
    columnName: 'reporter_json',
    definitionSql: 'JSON DEFAULT NULL',
    afterColumn: 'reporter_email'
  })
  await ensureColumn({
    tableName: 'safety_cases',
    columnName: 'patient_json',
    definitionSql: 'JSON DEFAULT NULL',
    afterColumn: 'patient_reference'
  })
  await ensureColumn({
    tableName: 'safety_cases',
    columnName: 'ae_json',
    definitionSql: 'JSON DEFAULT NULL',
    afterColumn: 'ae_description'
  })
  await ensureColumn({
    tableName: 'safety_cases',
    columnName: 'ae_onset_date',
    definitionSql: 'DATE DEFAULT NULL',
    afterColumn: 'ae_json'
  })
  await ensureColumn({
    tableName: 'safety_cases',
    columnName: 'product_json',
    definitionSql: 'JSON DEFAULT NULL',
    afterColumn: 'suspect_product_id'
  })
  await ensureColumn({
    tableName: 'safety_cases',
    columnName: 'attachments_json',
    definitionSql: 'JSON DEFAULT NULL',
    afterColumn: 'product_json'
  })
  await ensureColumn({
    tableName: 'safety_cases',
    columnName: 'duplicate_flags_json',
    definitionSql: 'JSON DEFAULT NULL',
    afterColumn: 'attachments_json'
  })
  await ensureColumn({
    tableName: 'safety_cases',
    columnName: 'regulatory_clock_status',
    definitionSql: "ENUM('running', 'paused', 'stopped') NOT NULL DEFAULT 'running'",
    afterColumn: 'regulatory_due_at'
  })
  await ensureColumn({
    tableName: 'safety_cases',
    columnName: 'regulatory_paused_at',
    definitionSql: 'DATETIME DEFAULT NULL',
    afterColumn: 'regulatory_clock_status'
  })
  await ensureColumn({
    tableName: 'safety_cases',
    columnName: 'regulatory_total_paused_minutes',
    definitionSql: 'INT NOT NULL DEFAULT 0',
    afterColumn: 'regulatory_paused_at'
  })
  await ensureColumn({
    tableName: 'safety_cases',
    columnName: 'regulatory_timezone',
    definitionSql: "VARCHAR(64) NOT NULL DEFAULT 'UTC'",
    afterColumn: 'regulatory_total_paused_minutes'
  })
  await ensureColumn({
    tableName: 'safety_cases',
    columnName: 'exception_reason',
    definitionSql: 'VARCHAR(255) DEFAULT NULL',
    afterColumn: 'assigned_medical_reviewer_id'
  })

  // Backfill/normalize persisted due date so reads never depend on application-side recompute.
  await pool.query(
    `UPDATE safety_cases
     SET regulatory_due_at = DATE_ADD(
       DATE_ADD(received_at, INTERVAL COALESCE(regulatory_clock_days, 15) DAY),
       INTERVAL COALESCE(regulatory_total_paused_minutes, 0) MINUTE
     )
     WHERE received_at IS NOT NULL
       AND (
         regulatory_due_at IS NULL OR
         TIMESTAMPDIFF(
           SECOND,
           regulatory_due_at,
           DATE_ADD(
             DATE_ADD(received_at, INTERVAL COALESCE(regulatory_clock_days, 15) DAY),
             INTERVAL COALESCE(regulatory_total_paused_minutes, 0) MINUTE
           )
         ) <> 0
       )`
  )

  // DB-level guardrail: regulatory_due_at must always match receipt + clock days + paused minutes.
  await pool.query('DROP TRIGGER IF EXISTS trg_safety_cases_due_insert')
  await pool.query(
    `CREATE TRIGGER trg_safety_cases_due_insert
      BEFORE INSERT ON safety_cases
      FOR EACH ROW
      BEGIN
        DECLARE v_due_at DATETIME;

        IF NEW.received_at IS NULL THEN
          SET NEW.received_at = CURRENT_TIMESTAMP;
        END IF;

        IF NEW.regulatory_clock_days IS NULL OR NEW.regulatory_clock_days < 1 THEN
          SET NEW.regulatory_clock_days = 15;
        END IF;

        IF NEW.regulatory_total_paused_minutes IS NULL OR NEW.regulatory_total_paused_minutes < 0 THEN
          SET NEW.regulatory_total_paused_minutes = 0;
        END IF;

        SET v_due_at = DATE_ADD(
          DATE_ADD(NEW.received_at, INTERVAL NEW.regulatory_clock_days DAY),
          INTERVAL NEW.regulatory_total_paused_minutes MINUTE
        );

        IF NEW.regulatory_due_at IS NOT NULL
           AND TIMESTAMPDIFF(SECOND, NEW.regulatory_due_at, v_due_at) <> 0 THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'regulatory_due_at must equal received_at + regulatory_clock_days + regulatory_total_paused_minutes';
        END IF;

        SET NEW.regulatory_due_at = v_due_at;
      END`
  )

  await pool.query('DROP TRIGGER IF EXISTS trg_safety_cases_due_update')
  await pool.query(
    `CREATE TRIGGER trg_safety_cases_due_update
      BEFORE UPDATE ON safety_cases
      FOR EACH ROW
      BEGIN
        DECLARE v_due_at DATETIME;

        IF NEW.received_at IS NULL THEN
          SET NEW.received_at = OLD.received_at;
        END IF;

        IF NEW.regulatory_clock_days IS NULL OR NEW.regulatory_clock_days < 1 THEN
          SET NEW.regulatory_clock_days = COALESCE(OLD.regulatory_clock_days, 15);
        END IF;

        IF NEW.regulatory_total_paused_minutes IS NULL OR NEW.regulatory_total_paused_minutes < 0 THEN
          SET NEW.regulatory_total_paused_minutes = COALESCE(OLD.regulatory_total_paused_minutes, 0);
        END IF;

        SET v_due_at = DATE_ADD(
          DATE_ADD(NEW.received_at, INTERVAL NEW.regulatory_clock_days DAY),
          INTERVAL NEW.regulatory_total_paused_minutes MINUTE
        );

        IF NEW.regulatory_due_at IS NOT NULL
           AND NEW.regulatory_due_at <> OLD.regulatory_due_at
           AND TIMESTAMPDIFF(SECOND, NEW.regulatory_due_at, v_due_at) <> 0 THEN
          SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'regulatory_due_at must equal received_at + regulatory_clock_days + regulatory_total_paused_minutes';
        END IF;

        SET NEW.regulatory_due_at = v_due_at;
      END`
  )
}

async function columnExists(tableName, columnName) {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
     LIMIT 1`,
    [DB_NAME, tableName, columnName]
  )
  return rows.length > 0
}

async function ensureColumn({ tableName, columnName, definitionSql, afterColumn = null }) {
  if (await columnExists(tableName, columnName)) return
  const afterSql = afterColumn ? ` AFTER \`${afterColumn}\`` : ''
  await pool.query(
    `ALTER TABLE \`${tableName}\`
     ADD COLUMN \`${columnName}\` ${definitionSql}${afterSql}`
  )
}

async function ensureConfigForOrg(orgId, actorUserId) {
  for (const [key, value] of Object.entries(DEFAULT_SYSTEM_CONFIG)) {
    await pool.execute(
      `INSERT INTO system_config (org_id, config_key, config_value, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE config_value = config_value`,
      [orgId, key, value, actorUserId]
    )
  }
}

async function seedData() {
  const defaultOrgs = [
    { org_name: 'Pharaxis Platform', org_slug: 'pharaxis-platform', org_type: 'platform' },
    { org_name: 'Eversana', org_slug: 'eversana', org_type: 'CRO' },
    { org_name: 'PrimeVigilance', org_slug: 'primevigilance', org_type: 'CRO' },
    { org_name: 'Sun Pharma', org_slug: 'sun-pharma', org_type: 'pharma_direct' },
    { org_name: 'Viatris', org_slug: 'viatris', org_type: 'pharma_direct' }
  ]

  for (const org of defaultOrgs) {
    await pool.execute(
      `INSERT INTO organisations (org_name, org_slug, org_type, status)
       VALUES (?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE org_name = VALUES(org_name), org_type = VALUES(org_type)`,
      [org.org_name, org.org_slug, org.org_type]
    )
  }

  const [[platformOrg]] = await pool.execute(
    'SELECT org_id FROM organisations WHERE org_slug = ?',
    ['pharaxis-platform']
  )

  const [orgRows] = await pool.execute('SELECT org_id FROM organisations')
  for (const row of orgRows) {
    await ensureConfigForOrg(row.org_id, platformOrg.org_id)
  }

  const [[eversana]] = await pool.execute(
    'SELECT org_id FROM organisations WHERE org_slug = ?',
    ['eversana']
  )

  if (eversana) {
    await pool.execute(
      `INSERT INTO pharma_clients (parent_org_id, client_name, client_code, status)
       VALUES (?, ?, ?, 'active')
       ON DUPLICATE KEY UPDATE client_name = VALUES(client_name)`,
      [eversana.org_id, 'Sample Pharma Client', 'SPC-001']
    )
  }

  const superAdminEmail = (process.env.SUPERADMIN_EMAIL || 'safety.superadmin@pharaxis.one').toLowerCase()
  const superAdminPassword = process.env.SUPERADMIN_PASSWORD || 'SafetyAdmin@123'
  const superAdminHash = await bcrypt.hash(superAdminPassword, 10)

  await pool.execute(
    `INSERT INTO users
      (org_id, full_name, email, password_hash, role, status, must_reset_password, first_login_completed, created_by)
     VALUES (?, ?, ?, ?, ?, 'active', 0, 1, NULL)
     ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), role = VALUES(role), status = 'active'`,
    [platformOrg.org_id, 'Safety Super Admin', superAdminEmail, superAdminHash, ROLES.SUPER_ADMIN]
  )

  const [[superAdminUser]] = await pool.execute(
    'SELECT user_id, org_id, password_hash FROM users WHERE org_id = ? AND email = ?',
    [platformOrg.org_id, superAdminEmail]
  )

  await pool.execute(
    `INSERT INTO password_history (org_id, user_id, password_hash)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE password_hash = password_hash`,
    [superAdminUser.org_id, superAdminUser.user_id, superAdminUser.password_hash]
  )

  await pool.execute(
    `INSERT INTO case_id_config (org_id, case_prefix, sequence_padding, is_active, updated_by)
     SELECT org_id, UPPER(SUBSTRING(REPLACE(REPLACE(org_slug, '-', ''), '_', ''), 1, 3)), 5, 1, ?
     FROM organisations
     ON DUPLICATE KEY UPDATE case_prefix = case_prefix`,
    [superAdminUser.user_id]
  )
}

async function initializeDatabase() {
  await createDatabaseIfNeeded()
  await runSchema()
  await seedData()
}

module.exports = {
  pool,
  initializeDatabase
}
