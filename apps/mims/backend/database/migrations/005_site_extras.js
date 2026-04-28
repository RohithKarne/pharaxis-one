'use strict';
// Migration 005 — Site extras: email accounts, response templates, data retention, alerts, product approvals,
//                workflow activities + triggers, case/transmission audit trails, error logs

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS site_email_accounts (
      id         INT NOT NULL AUTO_INCREMENT,
      site_id    INT NOT NULL,
      email      VARCHAR(255) NOT NULL,
      label      VARCHAR(100),
      case_types VARCHAR(50) NOT NULL DEFAULT 'ALL',
      is_active  TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_site_email_accounts_site (site_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS site_response_templates (
      id        INT NOT NULL AUTO_INCREMENT,
      site_id   INT NOT NULL,
      subject   VARCHAR(500),
      body_html MEDIUMTEXT,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_site_response (site_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS site_data_retention (
      id                  INT NOT NULL AUTO_INCREMENT,
      site_id             INT NOT NULL,
      retention_days      INT NOT NULL DEFAULT 2555,
      regulation          VARCHAR(50) NOT NULL DEFAULT 'GDPR',
      auto_delete_enabled TINYINT(1) NOT NULL DEFAULT 0,
      notes               TEXT,
      created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_site_data_retention (site_id, regulation)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS site_alerts (
      id              INT NOT NULL AUTO_INCREMENT,
      site_id         INT NOT NULL,
      alert_type      VARCHAR(50) NOT NULL,
      threshold_value INT NOT NULL DEFAULT 10,
      notify_emails   TEXT,
      is_active       TINYINT(1) NOT NULL DEFAULT 1,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_site_alerts_site (site_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS product_approvals (
      id              INT NOT NULL AUTO_INCREMENT,
      product_id      INT NOT NULL,
      approval_number VARCHAR(255) NOT NULL,
      regulatory_body VARCHAR(255),
      approval_date   DATE,
      expiry_date     DATE,
      status          VARCHAR(50) NOT NULL DEFAULT 'Active',
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_product_approvals_product (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS product_country_authorizations (
      id          INT NOT NULL AUTO_INCREMENT,
      product_id  INT NOT NULL,
      country     VARCHAR(100) NOT NULL,
      auth_number VARCHAR(255),
      auth_date   DATE,
      status      VARCHAR(50) NOT NULL DEFAULT 'Active',
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_product_country_auth_product (product_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS workflow_activities (
      id          INT NOT NULL AUTO_INCREMENT,
      name        VARCHAR(255) NOT NULL,
      description TEXT,
      is_active   TINYINT(1) NOT NULL DEFAULT 1,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_workflow_activity_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [[{ actCount }]] = await conn.execute('SELECT COUNT(*) AS actCount FROM workflow_activities');
  if (actCount === 0) {
    const activities = [
      ['Version Created', 'A new case version was created'],
      ['Document Uploaded', 'A document was uploaded to the case'],
      ['Comment Added', 'A comment was added to the case'],
      ['Seriousness Flag Set', 'The seriousness flag was set or changed on a case'],
      ['Case Closed', 'The case was closed'],
      ['Transmission Sent', 'A transmission was sent to an external system'],
    ];
    for (const [name, description] of activities) {
      await conn.execute(
        'INSERT IGNORE INTO workflow_activities (name, description) VALUES (?, ?)',
        [name, description]
      );
    }
  }

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS workflow_activity_triggers (
      id              INT NOT NULL AUTO_INCREMENT,
      activity_id     INT NOT NULL,
      trigger_type    VARCHAR(50) NOT NULL,
      target_state_id INT,
      alert_rule      VARCHAR(255),
      assign_to       VARCHAR(255),
      is_active       TINYINT(1) NOT NULL DEFAULT 1,
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_wat_activity (activity_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS case_audit_trail (
      id          INT NOT NULL AUTO_INCREMENT,
      case_id     INT NOT NULL,
      user_id     INT NOT NULL,
      user_name   VARCHAR(255),
      action_type VARCHAR(100) NOT NULL,
      field_name  VARCHAR(255),
      old_value   TEXT,
      new_value   TEXT,
      timestamp   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_case_audit_case (case_id),
      KEY idx_case_audit_ts (timestamp)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS transmission_audit_trail (
      id              INT NOT NULL AUTO_INCREMENT,
      case_id         INT NOT NULL,
      user_id         INT NOT NULL,
      user_name       VARCHAR(255),
      target_system   VARCHAR(100) NOT NULL,
      payload_summary TEXT,
      status          VARCHAR(50) NOT NULL DEFAULT 'Sent',
      response_code   VARCHAR(50),
      timestamp       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_trans_audit_case (case_id),
      KEY idx_trans_audit_system (target_system)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS response_error_logs (
      id           INT NOT NULL AUTO_INCREMENT,
      log_id       VARCHAR(36) NOT NULL,
      org_id       INT NOT NULL,
      case_id      INT,
      error_type   VARCHAR(100) NOT NULL,
      error_message TEXT,
      details      JSON,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_resp_err_log_id (log_id),
      KEY idx_resp_err_org (org_id),
      KEY idx_resp_err_case (case_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS transmission_error_logs (
      id            INT NOT NULL AUTO_INCREMENT,
      log_id        VARCHAR(36) NOT NULL,
      org_id        INT NOT NULL,
      case_id       INT,
      target_system VARCHAR(100),
      error_type    VARCHAR(100) NOT NULL,
      error_message TEXT,
      details       JSON,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uk_trans_err_log_id (log_id),
      KEY idx_trans_err_org (org_id),
      KEY idx_trans_err_case (case_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS transmission_screen_audit (
      id         INT NOT NULL AUTO_INCREMENT,
      org_id     INT NOT NULL,
      user_id    INT NOT NULL,
      user_name  VARCHAR(255),
      action     VARCHAR(100) NOT NULL,
      context    JSON,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_tsa_org     (org_id),
      KEY idx_tsa_user    (user_id),
      KEY idx_tsa_action  (action),
      KEY idx_tsa_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
