'use strict';
// Migration 014 — Cases extended: dynamic fields, reporter/patient/intake, MI responses,
//                AE/PC transmissions, DPPR, help articles, PC flex fields

const MYSQL_DATABASE_ENV = process.env.MYSQL_DATABASE || 'pharaxis_mims_dev';

async function up(conn) {
  const dbName = conn.config?.database || MYSQL_DATABASE_ENV;

  async function ensureColumn(tableName, columnName, definitionSql) {
    const [rows] = await conn.execute(
      `SELECT COLUMN_NAME FROM information_schema.columns
        WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
      [dbName, tableName, columnName]
    );
    if (!rows.length) {
      await conn.execute(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definitionSql}`);
    }
  }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_dynamic_field_values (
      id         INT           NOT NULL AUTO_INCREMENT,
      case_id    INT           NOT NULL,
      field_id   INT           NOT NULL,
      field_value TEXT,
      created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_case_field (case_id, field_id),
      KEY idx_cdfv_case (case_id),
      KEY idx_cdfv_field (field_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_reporter (
      id            INT           NOT NULL AUTO_INCREMENT,
      case_id       INT           NOT NULL,
      first_name    VARCHAR(100),
      last_name     VARCHAR(100),
      email         VARCHAR(255),
      phone         VARCHAR(50),
      reporter_type VARCHAR(50)   NOT NULL DEFAULT 'HCP',
      country       VARCHAR(100),
      organisation  VARCHAR(255),
      created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_case_reporter (case_id),
      KEY idx_case_reporter_case (case_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_patient (
      id         INT           NOT NULL AUTO_INCREMENT,
      case_id    INT           NOT NULL,
      initials   VARCHAR(20),
      age        INT,
      age_unit   VARCHAR(20)   NOT NULL DEFAULT 'years',
      gender     VARCHAR(20),
      weight_kg  DECIMAL(6,2),
      created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_case_patient (case_id),
      KEY idx_case_patient_case (case_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_ae_intake (
      id                           INT           NOT NULL AUTO_INCREMENT,
      case_id                      INT           NOT NULL,
      suspect_drug_name            VARCHAR(255),
      batch_lot_number             VARCHAR(100),
      dose                         VARCHAR(100),
      route_of_admin               VARCHAR(100),
      treatment_start_date         DATE,
      treatment_stop_date          DATE,
      reaction_description         TEXT,
      reaction_onset_date          DATE,
      outcome                      VARCHAR(100),
      is_serious                   TINYINT(1)    NOT NULL DEFAULT 0,
      is_death                     TINYINT(1)    NOT NULL DEFAULT 0,
      is_life_threatening          TINYINT(1)    NOT NULL DEFAULT 0,
      is_hospitalization           TINYINT(1)    NOT NULL DEFAULT 0,
      is_prolonged_hospitalization TINYINT(1)    NOT NULL DEFAULT 0,
      is_disability                TINYINT(1)    NOT NULL DEFAULT 0,
      is_congenital_anomaly        TINYINT(1)    NOT NULL DEFAULT 0,
      is_other_medically_important TINYINT(1)    NOT NULL DEFAULT 0,
      created_at                   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at                   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_case_ae_intake (case_id),
      KEY idx_case_ae_intake_case (case_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_pc_intake (
      id                           INT           NOT NULL AUTO_INCREMENT,
      case_id                      INT           NOT NULL,
      product_name                 VARCHAR(255),
      batch_lot_number             VARCHAR(100),
      expiry_date                  DATE,
      purchase_date                DATE,
      complaint_category           VARCHAR(100),
      complaint_taxonomy_id        INT,
      complaint_taxonomy_label     VARCHAR(255),
      complaint_taxonomy_effective_from DATE,
      complaint_taxonomy_effective_to   DATE,
      complaint_description        TEXT,
      sample_available             TINYINT(1)    NOT NULL DEFAULT 0,
      sample_return_requested      TINYINT(1)    NOT NULL DEFAULT 0,
      created_at                   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at                   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_case_pc_intake (case_id),
      KEY idx_case_pc_intake_case (case_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  for (const sql of [
    `ALTER TABLE case_pc_intake ADD COLUMN complaint_taxonomy_id INT NULL AFTER complaint_category`,
    `ALTER TABLE case_pc_intake ADD COLUMN complaint_taxonomy_label VARCHAR(255) NULL AFTER complaint_taxonomy_id`,
    `ALTER TABLE case_pc_intake ADD COLUMN complaint_taxonomy_effective_from DATE NULL AFTER complaint_taxonomy_label`,
    `ALTER TABLE case_pc_intake ADD COLUMN complaint_taxonomy_effective_to DATE NULL AFTER complaint_taxonomy_effective_from`,
    `ALTER TABLE case_pc_intake ADD KEY idx_case_pc_taxonomy_id (complaint_taxonomy_id)`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_mi_responses (
      id                 INT           NOT NULL AUTO_INCREMENT,
      case_id            INT           NOT NULL,
      mi_tab_id          INT,
      response_text      TEXT,
      response_channel   VARCHAR(100),
      response_date      DATE,
      follow_up_required TINYINT(1)    NOT NULL DEFAULT 0,
      response_status    VARCHAR(20)   NOT NULL DEFAULT 'DRAFT',
      draft_saved_at     DATETIME      NULL,
      approved_by        INT           NULL,
      approved_at        DATETIME      NULL,
      is_finalized       TINYINT(1)    NOT NULL DEFAULT 0,
      voided_at          DATETIME      NULL,
      voided_by          INT           NULL,
      cm_document_id     INT,
      cm_document_name   VARCHAR(500),
      author_id          INT,
      author_name        VARCHAR(255),
      created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_case_mi_resp_case (case_id),
      KEY idx_case_mi_resp_tab (mi_tab_id),
      KEY idx_case_mi_resp_status (response_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  for (const sql of [
    `ALTER TABLE case_mi_responses ADD COLUMN response_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' AFTER follow_up_required`,
    `ALTER TABLE case_mi_responses ADD COLUMN draft_saved_at DATETIME NULL AFTER response_status`,
    `ALTER TABLE case_mi_responses ADD COLUMN approved_by INT NULL AFTER draft_saved_at`,
    `ALTER TABLE case_mi_responses ADD COLUMN approved_at DATETIME NULL AFTER approved_by`,
    `ALTER TABLE case_mi_responses ADD INDEX idx_case_mi_resp_status (response_status)`,
    `ALTER TABLE case_mi_responses MODIFY COLUMN response_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'`,
    `ALTER TABLE case_mi_responses ADD COLUMN is_finalized TINYINT(1) NOT NULL DEFAULT 0 AFTER approved_at`,
    `ALTER TABLE case_mi_responses ADD COLUMN voided_at DATETIME NULL AFTER is_finalized`,
    `ALTER TABLE case_mi_responses ADD COLUMN voided_by INT NULL AFTER voided_at`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_ae_transmissions (
      id               INT           NOT NULL AUTO_INCREMENT,
      case_id          INT           NOT NULL,
      assigned_to      INT,
      assigned_name    VARCHAR(255),
      priority         VARCHAR(50)   NOT NULL DEFAULT 'standard',
      due_date         DATE,
      narrative        TEXT,
      status           VARCHAR(50)   NOT NULL DEFAULT 'Pending',
      sla_status       VARCHAR(20)   NOT NULL DEFAULT 'on_track',
      reminder_sent_at DATETIME      NULL,
      escalated_at     DATETIME      NULL,
      escalation_level INT           NOT NULL DEFAULT 0,
      resolution_notes TEXT,
      created_by       INT,
      created_by_name  VARCHAR(255),
      created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_ae_trans_case (case_id),
      KEY idx_ae_trans_assigned (assigned_to),
      KEY idx_ae_trans_status (status),
      KEY idx_ae_trans_sla_status (sla_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  for (const sql of [
    `ALTER TABLE case_ae_transmissions ADD COLUMN sla_status VARCHAR(20) NOT NULL DEFAULT 'on_track' AFTER status`,
    `ALTER TABLE case_ae_transmissions ADD COLUMN reminder_sent_at DATETIME NULL AFTER sla_status`,
    `ALTER TABLE case_ae_transmissions ADD COLUMN escalated_at DATETIME NULL AFTER reminder_sent_at`,
    `ALTER TABLE case_ae_transmissions ADD COLUMN escalation_level INT NOT NULL DEFAULT 0 AFTER escalated_at`,
    `ALTER TABLE case_ae_transmissions ADD INDEX idx_ae_trans_sla_status (sla_status)`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_pc_transmissions (
      id               INT           NOT NULL AUTO_INCREMENT,
      case_id          INT           NOT NULL,
      assigned_to      INT,
      assigned_name    VARCHAR(255),
      priority         VARCHAR(50)   NOT NULL DEFAULT 'standard',
      due_date         DATE,
      resolution_notes TEXT,
      status           VARCHAR(50)   NOT NULL DEFAULT 'Pending',
      sla_status       VARCHAR(20)   NOT NULL DEFAULT 'on_track',
      reminder_sent_at DATETIME      NULL,
      escalated_at     DATETIME      NULL,
      escalation_level INT           NOT NULL DEFAULT 0,
      created_by       INT,
      created_by_name  VARCHAR(255),
      created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_pc_trans_case (case_id),
      KEY idx_pc_trans_assigned (assigned_to),
      KEY idx_pc_trans_status (status),
      KEY idx_pc_trans_sla_status (sla_status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  for (const sql of [
    `ALTER TABLE case_pc_transmissions ADD COLUMN sla_status VARCHAR(20) NOT NULL DEFAULT 'on_track' AFTER status`,
    `ALTER TABLE case_pc_transmissions ADD COLUMN reminder_sent_at DATETIME NULL AFTER sla_status`,
    `ALTER TABLE case_pc_transmissions ADD COLUMN escalated_at DATETIME NULL AFTER reminder_sent_at`,
    `ALTER TABLE case_pc_transmissions ADD COLUMN escalation_level INT NOT NULL DEFAULT 0 AFTER escalated_at`,
    `ALTER TABLE case_pc_transmissions ADD INDEX idx_pc_trans_sla_status (sla_status)`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  // Sprint 21: In-App Help System
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS help_articles (
      id               INT NOT NULL AUTO_INCREMENT,
      feature_key      VARCHAR(120) NOT NULL,
      feature_group    VARCHAR(80),
      tags             JSON,
      title            VARCHAR(500) NOT NULL,
      content_html     MEDIUMTEXT NOT NULL,
      summary          VARCHAR(500),
      audience         JSON NOT NULL DEFAULT ('["all"]'),
      org_id           INT DEFAULT NULL,
      version          INT NOT NULL DEFAULT 1,
      last_reviewed_at DATETIME DEFAULT NULL,
      reviewed_by      INT DEFAULT NULL,
      is_active        TINYINT(1) NOT NULL DEFAULT 1,
      sort_order       INT NOT NULL DEFAULT 100,
      view_count       INT NOT NULL DEFAULT 0,
      created_by       INT DEFAULT NULL,
      updated_by       INT DEFAULT NULL,
      created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_help_feature_active (feature_key, is_active),
      KEY idx_help_group          (feature_group, is_active),
      KEY idx_help_org            (org_id, feature_key, is_active),
      FULLTEXT KEY ft_help_search (title, content_html, summary)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // DPPR — Data Protection & Privacy Rules
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS dppr_rules (
      id             INT NOT NULL AUTO_INCREMENT,
      org_id         INT NOT NULL,
      rule_name      VARCHAR(255) NOT NULL,
      domain         VARCHAR(100) NOT NULL,
      contact_type   VARCHAR(50) NOT NULL DEFAULT 'all',
      consent_type   VARCHAR(50) NOT NULL DEFAULT 'all',
      action         ENUM('None','Anonymize','Delete') NOT NULL DEFAULT 'None',
      retention_days INT NOT NULL DEFAULT 365,
      is_active      TINYINT(1) NOT NULL DEFAULT 1,
      created_by     INT DEFAULT NULL,
      updated_by     INT DEFAULT NULL,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_dppr_org_active (org_id, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS dppr_execution_log (
      id               INT NOT NULL AUTO_INCREMENT,
      org_id           INT NOT NULL,
      rule_id          INT DEFAULT NULL,
      triggered_by     ENUM('scheduler','manual') NOT NULL DEFAULT 'scheduler',
      executed_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      records_scanned  INT NOT NULL DEFAULT 0,
      records_affected INT NOT NULL DEFAULT 0,
      action_taken     VARCHAR(50) NOT NULL,
      status           ENUM('success','partial','failed') NOT NULL DEFAULT 'success',
      error_message    TEXT DEFAULT NULL,
      duration_ms      INT DEFAULT NULL,
      run_summary      JSON DEFAULT NULL,
      PRIMARY KEY (id),
      KEY idx_dppr_log_org  (org_id),
      KEY idx_dppr_log_rule (rule_id),
      KEY idx_dppr_log_date (executed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_dppr_overrides (
      id              INT NOT NULL AUTO_INCREMENT,
      case_id         INT NOT NULL,
      org_id          INT NOT NULL,
      domain          VARCHAR(100) NOT NULL,
      action          ENUM('None','Anonymize','Delete') NOT NULL DEFAULT 'None',
      retention_days  INT NOT NULL DEFAULT 365,
      override_reason VARCHAR(500) DEFAULT NULL,
      created_by      INT DEFAULT NULL,
      updated_by      INT DEFAULT NULL,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_case_domain (case_id, domain),
      KEY idx_dppr_ov_case (case_id),
      KEY idx_dppr_ov_org  (org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // PC QA Fix: missing columns + flex-fields table
  await ensureColumn('case_pc_general', 'pc_status', 'VARCHAR(50) NULL AFTER pc_category');
  await ensureColumn('case_pc_general', 'pc_classification', 'VARCHAR(100) NULL AFTER pc_status');
  await ensureColumn('case_pc_patient_info', 'injury_experienced', 'VARCHAR(100) NULL AFTER indication');

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_pc_flex_fields (
      id         INT  NOT NULL AUTO_INCREMENT,
      version_id INT  NOT NULL,
      pc_flex_1  VARCHAR(500),
      pc_flex_2  VARCHAR(500),
      pc_flex_3  VARCHAR(500),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_pc_flex_version (version_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
