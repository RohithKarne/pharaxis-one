'use strict';
// Migration 010 — Integrations: Vault, EMIR, MIR, CRM, imports, scheduled jobs, OAuth2

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS org_integrations (
      id                   INT AUTO_INCREMENT PRIMARY KEY,
      org_id               INT NOT NULL,
      integration_type     VARCHAR(50) NOT NULL,
      endpoint_url         VARCHAR(500) DEFAULT NULL,
      api_key              VARCHAR(500) DEFAULT NULL,
      enabled              TINYINT(1) NOT NULL DEFAULT 0,
      event_triggers       JSON DEFAULT NULL,
      org_override_allowed TINYINT(1) NOT NULL DEFAULT 0,
      last_sync_at         DATETIME DEFAULT NULL,
      created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_org_integration_type (org_id, integration_type),
      FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  try { await conn.execute(`ALTER TABLE org_integrations ADD COLUMN config JSON NULL`); } catch (_) {}

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS org_vault_config (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      org_id              INT NOT NULL,
      vault_domain        VARCHAR(255) NOT NULL,
      vault_username      VARCHAR(255) NOT NULL,
      vault_password      VARCHAR(500) NOT NULL,
      vault_api_version   VARCHAR(20) NOT NULL DEFAULT 'v24.1',
      poll_interval_hours INT NOT NULL DEFAULT 12,
      last_poll_at        DATETIME DEFAULT NULL,
      enabled             TINYINT(1) NOT NULL DEFAULT 0,
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_org_vault (org_id),
      FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS vault_document_type_map (
      id                   INT AUTO_INCREMENT PRIMARY KEY,
      org_id               INT NOT NULL,
      vault_type           VARCHAR(100) NOT NULL,
      vault_subtype        VARCHAR(100) DEFAULT NULL,
      vault_classification VARCHAR(100) DEFAULT NULL,
      mims_cm_category     VARCHAR(100) NOT NULL,
      created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS org_emir_config (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      org_id           INT NOT NULL,
      inbound_email    VARCHAR(255) NOT NULL,
      sender_whitelist JSON DEFAULT NULL,
      ack_template     TEXT DEFAULT NULL,
      enabled          TINYINT(1) NOT NULL DEFAULT 0,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_org_emir (org_id),
      FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_vault_references (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      case_id          INT NOT NULL,
      org_id           INT NOT NULL,
      vault_doc_id     VARCHAR(100) NOT NULL,
      vault_doc_name   VARCHAR(500) DEFAULT NULL,
      vault_doc_type   VARCHAR(100) DEFAULT NULL,
      vault_doc_status VARCHAR(50) DEFAULT NULL,
      pulled_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
      FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS emir_requests (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      org_id           INT NOT NULL,
      reference_number VARCHAR(100) NOT NULL,
      from_email       VARCHAR(255) NOT NULL,
      subject          VARCHAR(500) DEFAULT NULL,
      body_raw         TEXT DEFAULT NULL,
      status           VARCHAR(50) NOT NULL DEFAULT 'received',
      ack_sent_at      DATETIME DEFAULT NULL,
      case_id          INT DEFAULT NULL,
      received_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_emir_ref (reference_number),
      FOREIGN KEY (org_id) REFERENCES organisations(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS emir_attachments (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      emir_request_id INT NOT NULL,
      filename        VARCHAR(500) NOT NULL,
      mimetype        VARCHAR(100) DEFAULT NULL,
      size_bytes      INT DEFAULT NULL,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (emir_request_id) REFERENCES emir_requests(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS emir_audit_log (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      emir_request_id INT NOT NULL,
      event_type      VARCHAR(50) NOT NULL,
      event_data      JSON DEFAULT NULL,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (emir_request_id) REFERENCES emir_requests(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS emir_sender_rules (
      id           INT           NOT NULL AUTO_INCREMENT,
      org_id       INT           NOT NULL,
      sender_email VARCHAR(255)  NOT NULL,
      sender_name  VARCHAR(255),
      is_trusted   TINYINT(1)    NOT NULL DEFAULT 1,
      notes        TEXT,
      created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_emir_sender_rules_org (org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS emir_routing_rules (
      id               INT           NOT NULL AUTO_INCREMENT,
      org_id           INT           NOT NULL,
      rule_name        VARCHAR(255)  NOT NULL,
      match_field      VARCHAR(100)  NOT NULL,
      match_value      VARCHAR(255)  NOT NULL,
      route_to_queue   VARCHAR(100),
      route_to_user_id INT,
      priority         INT           NOT NULL DEFAULT 0,
      is_active        TINYINT(1)    NOT NULL DEFAULT 1,
      created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_emir_routing_rules_org (org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS mir_sync_log (
      id            INT           NOT NULL AUTO_INCREMENT,
      org_id        INT           NOT NULL,
      case_id       INT,
      direction     VARCHAR(20)   NOT NULL DEFAULT 'outbound',
      status        VARCHAR(20)   NOT NULL,
      mir_reference VARCHAR(255),
      error_message TEXT,
      payload       JSON,
      created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_mir_sync_log_org (org_id),
      KEY idx_mir_sync_log_case (case_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS crm_sync_log (
      id            INT           NOT NULL AUTO_INCREMENT,
      org_id        INT           NOT NULL,
      case_id       INT,
      platform      VARCHAR(50),
      direction     VARCHAR(20)   NOT NULL DEFAULT 'outbound',
      status        VARCHAR(20)   NOT NULL,
      crm_reference VARCHAR(255),
      error_message TEXT,
      payload       JSON,
      created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_crm_sync_log_org (org_id),
      KEY idx_crm_sync_log_case (case_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_import_jobs (
      id            INT           NOT NULL AUTO_INCREMENT,
      org_id        INT           NOT NULL,
      filename      VARCHAR(255)  NOT NULL,
      status        VARCHAR(20)   NOT NULL DEFAULT 'pending',
      total_rows    INT           DEFAULT 0,
      imported_rows INT           DEFAULT 0,
      failed_rows   INT           DEFAULT 0,
      error_log     JSON,
      created_by    INT,
      created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_case_import_jobs_org (org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS scheduled_export_configs (
      id              INT           NOT NULL AUTO_INCREMENT,
      org_id          INT           NOT NULL,
      export_name     VARCHAR(255)  NOT NULL,
      export_format   VARCHAR(20)   NOT NULL DEFAULT 'csv',
      cron_expression VARCHAR(100)  NOT NULL DEFAULT '0 6 * * 1',
      filters         JSON,
      delivery_method VARCHAR(20)   NOT NULL DEFAULT 'email',
      delivery_target VARCHAR(255),
      is_active       TINYINT(1)    NOT NULL DEFAULT 1,
      last_run_at     DATETIME,
      last_run_status VARCHAR(20),
      created_by      INT,
      created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_scheduled_export_configs_org (org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  for (const sql of [
    `ALTER TABLE scheduled_export_configs ADD COLUMN report_key VARCHAR(100) NOT NULL DEFAULT 'case-summary' AFTER export_name`,
    `ALTER TABLE scheduled_export_configs ADD COLUMN schedule_frequency VARCHAR(20) NOT NULL DEFAULT 'weekly' AFTER cron_expression`,
    `ALTER TABLE scheduled_export_configs ADD COLUMN schedule_time_local VARCHAR(5) NOT NULL DEFAULT '06:00' AFTER schedule_frequency`,
    `ALTER TABLE scheduled_export_configs ADD COLUMN schedule_weekday TINYINT NOT NULL DEFAULT 1 AFTER schedule_time_local`,
    `ALTER TABLE scheduled_export_configs ADD COLUMN timezone_name VARCHAR(100) NOT NULL DEFAULT 'UTC' AFTER schedule_weekday`,
    `ALTER TABLE scheduled_export_configs ADD COLUMN next_run_at_utc DATETIME NULL AFTER timezone_name`,
    `ALTER TABLE scheduled_export_configs ADD COLUMN last_error TEXT NULL AFTER last_run_status`,
    `ALTER TABLE scheduled_export_configs ADD INDEX idx_scheduled_export_next_run (is_active, next_run_at_utc)`,
    `ALTER TABLE scheduled_export_configs ADD COLUMN target_type VARCHAR(20) NOT NULL DEFAULT 'report' AFTER export_name`,
    `ALTER TABLE scheduled_export_configs ADD COLUMN target_id INT NULL AFTER report_key`,
    `ALTER TABLE scheduled_export_configs ADD COLUMN email_subject VARCHAR(255) NULL AFTER delivery_target`,
    `ALTER TABLE scheduled_export_configs ADD INDEX idx_scheduled_export_target (target_type, target_id)`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id              INT           NOT NULL AUTO_INCREMENT,
      job_name        VARCHAR(100)  NOT NULL,
      cron_expression VARCHAR(100)  NOT NULL,
      description     VARCHAR(255),
      is_active       TINYINT(1)    NOT NULL DEFAULT 1,
      last_run_at     DATETIME,
      last_run_status VARCHAR(20)   DEFAULT 'never',
      last_error      TEXT,
      created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_scheduled_jobs_name (job_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  for (const sql of [
    `ALTER TABLE scheduled_jobs ADD COLUMN org_id INT NULL AFTER is_active`,
    `ALTER TABLE scheduled_jobs ADD COLUMN job_type VARCHAR(100) NULL AFTER org_id`,
    `ALTER TABLE scheduled_jobs ADD COLUMN job_config JSON NULL AFTER job_type`,
    `ALTER TABLE scheduled_jobs ADD COLUMN schedule_cron VARCHAR(100) NULL AFTER job_config`,
    `ALTER TABLE scheduled_jobs ADD INDEX idx_scheduled_jobs_type_org (job_type, org_id)`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS oauth2_tokens (
      id               INT           NOT NULL AUTO_INCREMENT,
      org_id           INT           NOT NULL,
      integration_type VARCHAR(50)   NOT NULL,
      access_token     TEXT          NOT NULL,
      refresh_token    TEXT,
      expires_at       DATETIME,
      created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_oauth2_tokens_org_type (org_id, integration_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
