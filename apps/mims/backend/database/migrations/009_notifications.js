'use strict';
// Migration 009 — Platform Admin alerts, notifications, outbound events, process explorer, regression runs

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS superadmin_alert_rules (
      id               INT           NOT NULL AUTO_INCREMENT,
      name             VARCHAR(255)  NOT NULL,
      event_type       VARCHAR(100)  NOT NULL,
      severity         VARCHAR(20)   NOT NULL DEFAULT 'medium',
      channels         VARCHAR(50)   NOT NULL DEFAULT 'email,in_app',
      recipient_emails TEXT,
      threshold_value  INT           NOT NULL DEFAULT 1,
      window_minutes   INT           NOT NULL DEFAULT 15,
      cooldown_minutes INT           NOT NULL DEFAULT 30,
      is_active        TINYINT(1)    NOT NULL DEFAULT 1,
      created_by       INT,
      updated_by       INT,
      created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_sa_alert_rules_event (event_type),
      KEY idx_sa_alert_rules_active (is_active),
      UNIQUE KEY uq_sa_alert_rules_event_type (event_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Remove duplicates before adding unique key on existing DBs
  await conn.execute(`
    DELETE r1 FROM superadmin_alert_rules r1
    INNER JOIN superadmin_alert_rules r2
      ON r1.event_type = r2.event_type AND r1.id > r2.id
  `);
  try {
    await conn.execute(
      `ALTER TABLE superadmin_alert_rules ADD UNIQUE KEY uq_sa_alert_rules_event_type (event_type)`
    );
  } catch (_) {}

  const defaultRules = [
    ['Failed Login Spike', 'failed_login_spike', 'high', 'email,in_app', '', 5, 15, 30],
    ['Repeated 2FA Lockouts', 'two_factor_lockout', 'high', 'email,in_app', '', 2, 30, 30],
    ['SMTP Failure', 'smtp_failure', 'high', 'email,in_app', '', 1, 15, 15],
    ['Mailbox Failure', 'mailbox_failure', 'high', 'email,in_app', '', 1, 15, 15],
    ['Organisation Deactivated', 'organization_deactivated', 'medium', 'email,in_app', '', 1, 60, 10],
    ['Site Deactivated', 'site_deactivated', 'medium', 'email,in_app', '', 1, 60, 10],
    ['Sensitive Config Change', 'sensitive_config_change', 'medium', 'email,in_app', '', 1, 60, 10],
    ['Service Error Threshold', 'service_error_threshold', 'high', 'email,in_app', '', 3, 30, 30],
  ];
  for (const rule of defaultRules) {
    await conn.execute(
      `INSERT INTO superadmin_alert_rules
       (name, event_type, severity, channels, recipient_emails, threshold_value, window_minutes, cooldown_minutes, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), severity = VALUES(severity), channels = VALUES(channels),
         threshold_value = VALUES(threshold_value), window_minutes = VALUES(window_minutes),
         cooldown_minutes = VALUES(cooldown_minutes)`,
      rule
    );
  }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS superadmin_alert_events (
      id            INT           NOT NULL AUTO_INCREMENT,
      rule_id       INT           DEFAULT NULL,
      event_type    VARCHAR(100)  NOT NULL,
      severity      VARCHAR(20)   NOT NULL DEFAULT 'medium',
      title         VARCHAR(255)  NOT NULL,
      message       TEXT,
      metadata      TEXT,
      email_status  VARCHAR(20)   NOT NULL DEFAULT 'pending',
      in_app_status VARCHAR(20)   NOT NULL DEFAULT 'pending',
      created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_sa_alert_events_rule (rule_id),
      KEY idx_sa_alert_events_event (event_type),
      KEY idx_sa_alert_events_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS notifications (
      id         INT           NOT NULL AUTO_INCREMENT,
      user_id    INT           NOT NULL,
      category   VARCHAR(100)  NOT NULL DEFAULT 'general',
      title      VARCHAR(255)  NOT NULL,
      message    TEXT,
      link_url   VARCHAR(500),
      metadata   TEXT,
      is_read    TINYINT(1)    NOT NULL DEFAULT 0,
      created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      read_at    DATETIME      DEFAULT NULL,
      PRIMARY KEY (id),
      KEY idx_notifications_user (user_id),
      KEY idx_notifications_category (category),
      KEY idx_notifications_read (is_read),
      KEY idx_notifications_created (created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  for (const sql of [
    `ALTER TABLE notifications ADD COLUMN severity VARCHAR(20) NOT NULL DEFAULT 'info' AFTER metadata`,
    `ALTER TABLE notifications ADD COLUMN requires_acknowledgement TINYINT(1) NOT NULL DEFAULT 0 AFTER severity`,
    `ALTER TABLE notifications ADD COLUMN event_key VARCHAR(100) NULL AFTER requires_acknowledgement`,
    `ALTER TABLE notifications ADD COLUMN acknowledged_at DATETIME NULL AFTER read_at`,
    `ALTER TABLE notifications ADD COLUMN acknowledged_by INT NULL AFTER acknowledged_at`,
    `ALTER TABLE notifications ADD INDEX idx_notifications_severity (severity)`,
    `ALTER TABLE notifications ADD INDEX idx_notifications_ack (requires_acknowledgement, acknowledged_at)`,
    `ALTER TABLE notifications ADD COLUMN delivery_status VARCHAR(30) NOT NULL DEFAULT 'delivered' AFTER acknowledged_by`,
    `ALTER TABLE notifications ADD COLUMN delivery_attempts INT NOT NULL DEFAULT 1 AFTER delivery_status`,
    `ALTER TABLE notifications ADD COLUMN max_delivery_attempts INT NOT NULL DEFAULT 3 AFTER delivery_attempts`,
    `ALTER TABLE notifications ADD COLUMN last_delivery_attempt_at DATETIME NULL AFTER max_delivery_attempts`,
    `ALTER TABLE notifications ADD COLUMN next_retry_at DATETIME NULL AFTER last_delivery_attempt_at`,
    `ALTER TABLE notifications ADD COLUMN failure_reason TEXT NULL AFTER next_retry_at`,
    `ALTER TABLE notifications ADD COLUMN delivered_at DATETIME NULL AFTER failure_reason`,
    `ALTER TABLE notifications ADD INDEX idx_notifications_delivery_status (delivery_status, next_retry_at)`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS notification_delivery_attempts (
      id              BIGINT        NOT NULL AUTO_INCREMENT,
      notification_id INT           NOT NULL,
      attempt_no      INT           NOT NULL,
      status          VARCHAR(30)   NOT NULL,
      error_message   VARCHAR(500),
      attempted_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_notif_attempts_notification (notification_id),
      KEY idx_notif_attempts_status (status),
      KEY idx_notif_attempts_attempted_at (attempted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS outbound_event_log (
      id              BIGINT        NOT NULL AUTO_INCREMENT,
      org_id          INT           NOT NULL,
      event_type      VARCHAR(100)  NOT NULL,
      entity_type     VARCHAR(100),
      entity_id       VARCHAR(100),
      payload_json    LONGTEXT,
      status          VARCHAR(30)   NOT NULL DEFAULT 'queued',
      attempts        INT           NOT NULL DEFAULT 0,
      last_attempt_at DATETIME,
      last_error      VARCHAR(500),
      created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_outbound_event_org (org_id),
      KEY idx_outbound_event_status (status),
      KEY idx_outbound_event_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS mims_process_logs (
      id            BIGINT        NOT NULL AUTO_INCREMENT,
      org_id        INT           DEFAULT NULL,
      source_module VARCHAR(100)  NOT NULL,
      method        VARCHAR(10)   NOT NULL,
      path          VARCHAR(500)  NOT NULL,
      path_pattern  VARCHAR(500)  NOT NULL,
      status_code   INT           NOT NULL,
      duration_ms   INT           DEFAULT NULL,
      event_type    VARCHAR(50)   DEFAULT NULL,
      entity_type   VARCHAR(100)  DEFAULT NULL,
      entity_id     VARCHAR(255)  DEFAULT NULL,
      summary       VARCHAR(500)  DEFAULT NULL,
      request_payload TEXT,
      error_message VARCHAR(255),
      created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_mims_process_logs_created_at (created_at),
      KEY idx_mims_process_logs_org_created (org_id, created_at),
      KEY idx_mims_process_logs_module_created (source_module, created_at),
      KEY idx_mims_process_logs_status_created (status_code, created_at),
      KEY idx_mims_process_logs_event_created (event_type, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  for (const sql of [
    `ALTER TABLE mims_process_logs ADD COLUMN event_type VARCHAR(50) DEFAULT NULL`,
    `ALTER TABLE mims_process_logs ADD COLUMN entity_type VARCHAR(100) DEFAULT NULL`,
    `ALTER TABLE mims_process_logs ADD COLUMN entity_id VARCHAR(255) DEFAULT NULL`,
    `ALTER TABLE mims_process_logs ADD COLUMN summary VARCHAR(500) DEFAULT NULL`,
    `ALTER TABLE mims_process_logs ADD KEY idx_mims_process_logs_event_created (event_type, created_at)`,
  ]) { try { await conn.execute(sql); } catch (_) {} }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS process_explorer_saved_queries (
      id                  INT           NOT NULL AUTO_INCREMENT,
      org_id              INT           NOT NULL,
      created_by_user_id  INT           NOT NULL,
      name                VARCHAR(255)  NOT NULL,
      description         VARCHAR(500),
      category            VARCHAR(100)  NOT NULL DEFAULT 'general',
      tags_json           JSON,
      sql_text            MEDIUMTEXT    NOT NULL,
      is_shared           TINYINT(1)    NOT NULL DEFAULT 0,
      is_active           TINYINT(1)    NOT NULL DEFAULT 1,
      last_used_at        DATETIME,
      created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_saved_queries_org_active (org_id, is_active),
      KEY idx_saved_queries_org_category (org_id, category),
      KEY idx_saved_queries_creator (created_by_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS process_explorer_sql_audit (
      id             BIGINT        NOT NULL AUTO_INCREMENT,
      org_id         INT,
      user_id        INT,
      user_role      VARCHAR(50),
      mode           VARCHAR(20)   NOT NULL,
      statement_type VARCHAR(20)   NOT NULL,
      sql_preview    TEXT          NOT NULL,
      params_json    JSON,
      status         VARCHAR(20)   NOT NULL,
      row_count      INT,
      affected_rows  INT,
      error_message  VARCHAR(500),
      metadata_json  JSON,
      created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_sql_audit_org_created (org_id, created_at),
      KEY idx_sql_audit_type_created (statement_type, created_at),
      KEY idx_sql_audit_status_created (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS process_explorer_ops_requests (
      id                   BIGINT        NOT NULL AUTO_INCREMENT,
      org_id               INT           NOT NULL,
      requested_by_user_id INT           NOT NULL,
      requested_by_role    VARCHAR(50)   NOT NULL,
      action_type          VARCHAR(50)   NOT NULL,
      route_method         VARCHAR(10),
      route_path_pattern   VARCHAR(500),
      entity_type          VARCHAR(100),
      entity_id            VARCHAR(255),
      reason               VARCHAR(1000) NOT NULL,
      request_payload      JSON,
      status               VARCHAR(30)   NOT NULL DEFAULT 'pending',
      approval_required    TINYINT(1)    NOT NULL DEFAULT 1,
      approved_by_user_id  INT           DEFAULT NULL,
      approved_at          DATETIME      DEFAULT NULL,
      rejected_by_user_id  INT           DEFAULT NULL,
      rejected_at          DATETIME      DEFAULT NULL,
      reject_reason        VARCHAR(1000),
      executed_at          DATETIME      DEFAULT NULL,
      execution_result     JSON,
      created_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_ops_req_org_created (org_id, created_at),
      KEY idx_ops_req_status_created (status, created_at),
      KEY idx_ops_req_action_created (action_type, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS process_explorer_ops_snapshots (
      id                BIGINT        NOT NULL AUTO_INCREMENT,
      ops_request_id    BIGINT        NOT NULL,
      snapshot_phase    VARCHAR(20)   NOT NULL,
      table_name        VARCHAR(128)  NOT NULL,
      row_count         BIGINT        NOT NULL DEFAULT 0,
      sampled_rows_json JSON,
      created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_ops_snap_req_phase (ops_request_id, snapshot_phase),
      KEY idx_ops_snap_table (table_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS regression_runs (
      id           INT NOT NULL AUTO_INCREMENT,
      run_by       INT,
      started_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      total_tests  INT NOT NULL DEFAULT 0,
      passed       INT NOT NULL DEFAULT 0,
      failed       INT NOT NULL DEFAULT 0,
      skipped      INT NOT NULL DEFAULT 0,
      health_score DECIMAL(5,2) NOT NULL DEFAULT 0,
      results      LONGTEXT,
      PRIMARY KEY (id),
      KEY idx_regression_runs_started (started_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
