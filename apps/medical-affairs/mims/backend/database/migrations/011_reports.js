'use strict';
// Migration 011 — Reports: report ledger, saved views, access controls, definitions, dashboards, module config

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS report_run_ledger (
      id              INT           NOT NULL AUTO_INCREMENT,
      org_id          INT           NOT NULL,
      report_key      VARCHAR(100)  NOT NULL,
      report_name     VARCHAR(255)  NOT NULL,
      run_mode        VARCHAR(20)   NOT NULL DEFAULT 'manual',
      triggered_by    INT,
      filters_json    JSON,
      timezone_name   VARCHAR(100),
      row_count       INT           NOT NULL DEFAULT 0,
      delivery_method VARCHAR(20),
      delivery_target VARCHAR(255),
      status          VARCHAR(20)   NOT NULL DEFAULT 'success',
      error_message   TEXT,
      created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_report_run_ledger_org (org_id),
      KEY idx_report_run_ledger_report (report_key),
      KEY idx_report_run_ledger_status (status),
      KEY idx_report_run_ledger_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  for (const sql of [
    `ALTER TABLE report_run_ledger ADD COLUMN target_type VARCHAR(20) NOT NULL DEFAULT 'report' AFTER report_name`,
    `ALTER TABLE report_run_ledger ADD COLUMN target_id INT NULL AFTER target_type`,
    `ALTER TABLE report_run_ledger ADD INDEX idx_report_run_target (target_type, target_id)`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_saved_views (
      id           INT           NOT NULL AUTO_INCREMENT,
      org_id       INT           NOT NULL,
      user_id      INT           NOT NULL,
      name         VARCHAR(255)  NOT NULL,
      scope        VARCHAR(50)   NOT NULL DEFAULT 'personal',
      filters_json JSON,
      is_shared    TINYINT(1)    NOT NULL DEFAULT 0,
      created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_case_saved_views_org_user (org_id, user_id),
      KEY idx_case_saved_views_shared (org_id, is_shared)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS org_report_access (
      id         INT          NOT NULL AUTO_INCREMENT,
      org_id     INT          NOT NULL,
      report_key VARCHAR(100) NOT NULL,
      is_enabled TINYINT(1)   NOT NULL DEFAULT 0,
      enabled_by INT,
      enabled_at DATETIME,
      created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_org_report_access (org_id, report_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS user_report_access (
      id         INT          NOT NULL AUTO_INCREMENT,
      org_id     INT          NOT NULL,
      user_id    INT          NOT NULL,
      report_key VARCHAR(100) NOT NULL,
      is_enabled TINYINT(1)   NOT NULL DEFAULT 0,
      granted_by INT,
      granted_at DATETIME,
      created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_user_report_access (org_id, user_id, report_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS report_access_requests (
      id           INT          NOT NULL AUTO_INCREMENT,
      org_id       INT          NOT NULL,
      requested_by INT          NOT NULL,
      user_id      INT          NOT NULL,
      report_key   VARCHAR(100) NOT NULL,
      status       VARCHAR(20)  NOT NULL DEFAULT 'pending',
      reviewed_by  INT,
      reviewed_at  DATETIME,
      notes        TEXT,
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_report_access_requests_org (org_id),
      KEY idx_report_access_requests_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS change_approval_requests (
      id             INT          NOT NULL AUTO_INCREMENT,
      org_id         INT          NOT NULL,
      requester_id   INT          NOT NULL,
      approver_id    INT,
      entity         VARCHAR(100) NOT NULL,
      entity_id      INT,
      field_name     VARCHAR(255),
      current_value  TEXT,
      proposed_value TEXT,
      reason         TEXT,
      status         VARCHAR(20)  NOT NULL DEFAULT 'pending',
      rejection_note TEXT,
      created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at    DATETIME,
      PRIMARY KEY (id),
      KEY idx_car_org_status (org_id, status),
      KEY idx_car_requester (requester_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS user_report_presets (
      id         INT           NOT NULL AUTO_INCREMENT,
      user_id    INT           NOT NULL,
      org_id     INT           NOT NULL,
      name       VARCHAR(255)  NOT NULL,
      group_key  VARCHAR(100)  NOT NULL,
      report_key VARCHAR(100)  NOT NULL,
      filters    JSON,
      created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_urp_user (user_id),
      KEY idx_urp_org  (org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS report_definitions (
      id               INT           NOT NULL AUTO_INCREMENT,
      org_id           INT           DEFAULT NULL,
      report_key       VARCHAR(120)  NOT NULL,
      dataset_key      VARCHAR(120)  NOT NULL,
      name             VARCHAR(255)  NOT NULL,
      description      TEXT,
      group_key        VARCHAR(80)   NOT NULL,
      allowed_filters  JSON,
      default_filters  JSON,
      selected_columns JSON,
      visibility_scope VARCHAR(40)   NOT NULL DEFAULT 'shared',
      is_system        TINYINT(1)    NOT NULL DEFAULT 0,
      is_active        TINYINT(1)    NOT NULL DEFAULT 1,
      created_by       INT           DEFAULT NULL,
      updated_by       INT           DEFAULT NULL,
      created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_report_definition_key (report_key),
      KEY idx_report_definitions_org (org_id, is_active),
      KEY idx_report_definitions_group (group_key, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS report_dashboards (
      id               INT           NOT NULL AUTO_INCREMENT,
      org_id           INT           DEFAULT NULL,
      dashboard_key    VARCHAR(120)  NOT NULL,
      name             VARCHAR(255)  NOT NULL,
      description      TEXT,
      layout_json      JSON,
      widgets_json     JSON,
      visibility_scope VARCHAR(40)   NOT NULL DEFAULT 'shared',
      is_system        TINYINT(1)    NOT NULL DEFAULT 0,
      is_active        TINYINT(1)    NOT NULL DEFAULT 1,
      created_by       INT           DEFAULT NULL,
      updated_by       INT           DEFAULT NULL,
      created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_report_dashboard_key (dashboard_key),
      KEY idx_report_dashboards_org (org_id, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS report_module_configs (
      id                      INT           NOT NULL AUTO_INCREMENT,
      org_id                  INT           NOT NULL,
      default_timezone        VARCHAR(100)  NOT NULL DEFAULT 'America/New_York',
      default_delivery_method VARCHAR(20)   NOT NULL DEFAULT 'email',
      default_delivery_target VARCHAR(255)  DEFAULT NULL,
      email_from_name         VARCHAR(255)  NOT NULL DEFAULT 'MIMS Reports',
      reply_to_email          VARCHAR(255)  DEFAULT NULL,
      scheduler_enabled       TINYINT(1)    NOT NULL DEFAULT 1,
      digest_subject_prefix   VARCHAR(255)  NOT NULL DEFAULT '[MIMS Reports]',
      run_log_retention_days  INT           NOT NULL DEFAULT 90,
      updated_by              INT           DEFAULT NULL,
      created_at              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at              DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_report_module_configs_org (org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS admin_impact_preview_log (
      id          INT           NOT NULL AUTO_INCREMENT,
      org_id      INT           NOT NULL,
      change_type VARCHAR(50)   NOT NULL,
      entity_id   INT           NOT NULL,
      impact_json JSON,
      computed_by INT,
      computed_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_aip_org_entity (org_id, change_type, entity_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
