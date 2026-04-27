'use strict';
// Migration 002 — Email accounts, inquiry inbox, routing rules, attachments, service logs

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS email_accounts (
      id                    INT           NOT NULL AUTO_INCREMENT,
      org_id                INT           NOT NULL,
      account_name          VARCHAR(255)  NOT NULL,
      provider              VARCHAR(100)  NOT NULL DEFAULT 'Generic',
      direction             VARCHAR(50)   NOT NULL DEFAULT 'Both',
      is_active             TINYINT(1)    NOT NULL DEFAULT 1,
      mailbox_email         VARCHAR(255),
      from_email            VARCHAR(255),
      display_name          VARCHAR(255),
      is_default_outbound   TINYINT(1)    NOT NULL DEFAULT 0,
      imap_host             VARCHAR(255),
      imap_port             INT,
      imap_encryption       VARCHAR(50),
      imap_username         VARCHAR(255),
      imap_password         VARCHAR(255),
      smtp_host             VARCHAR(255),
      smtp_port             INT,
      smtp_encryption       VARCHAR(50),
      smtp_username         VARCHAR(255),
      smtp_password         VARCHAR(255),
      polling_interval_min  INT           NOT NULL DEFAULT 5,
      initial_fetch_days    INT           NOT NULL DEFAULT 7,
      mailbox_folder        VARCHAR(100)  NOT NULL DEFAULT 'INBOX',
      ingest_attachments    TINYINT(1)    NOT NULL DEFAULT 0,
      max_attachment_mb     INT           NOT NULL DEFAULT 10,
      last_imap_test_at     DATETIME,
      last_imap_test_status VARCHAR(50),
      last_imap_test_error  TEXT,
      last_smtp_test_at     DATETIME,
      last_smtp_test_status VARCHAR(50),
      last_smtp_test_error  TEXT,
      last_send_test_at     DATETIME,
      last_send_test_status VARCHAR(50),
      last_send_test_error  TEXT,
      last_ingest_at        DATETIME,
      created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY fk_email_accounts_org (org_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id                    INT           NOT NULL AUTO_INCREMENT,
      org_id                INT,
      email_account_id      INT,
      message_id            VARCHAR(500),
      message_hash          VARCHAR(500),
      sender                VARCHAR(500),
      recipient             VARCHAR(500),
      subject               TEXT,
      body                  MEDIUMTEXT,
      received_at           VARCHAR(100),
      status                VARCHAR(50)   NOT NULL DEFAULT 'inbox',
      attachments_count     INT           NOT NULL DEFAULT 0,
      source_tag            VARCHAR(100),
      is_locked             TINYINT(1)    NOT NULL DEFAULT 0,
      locked_by             VARCHAR(255),
      color                 VARCHAR(50),
      is_read               TINYINT(1)    NOT NULL DEFAULT 0,
      assigned_to           VARCHAR(255),
      priority              VARCHAR(50),
      due_date              VARCHAR(100),
      triage_state          VARCHAR(50)   NOT NULL DEFAULT 'new',
      queue_name            VARCHAR(100),
      mailbox_name          VARCHAR(255),
      snoozed_until         DATETIME,
      first_touched_at      DATETIME,
      first_response_at     DATETIME,
      first_touch_alerted_at DATETIME,
      response_alerted_at   DATETIME,
      last_action_at        DATETIME,
      closed_at             DATETIME,
      routing_reason        VARCHAR(500),
      exception_reason      VARCHAR(255),
      original_inquiry_id   INT,
      case_id               INT,
      created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_inquiries_account (email_account_id),
      KEY idx_inquiries_status (status),
      KEY idx_inquiries_received (received_at),
      KEY idx_inquiries_case (case_id),
      KEY idx_inquiries_triage_state (triage_state),
      KEY idx_inquiries_queue_name (queue_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // Idempotent Sprint 18 inbox alters
  const sprint18InquiryAlters = [
    `ALTER TABLE inquiries ADD COLUMN triage_state VARCHAR(50) NOT NULL DEFAULT 'new' AFTER due_date`,
    `ALTER TABLE inquiries ADD COLUMN queue_name VARCHAR(100) NULL AFTER triage_state`,
    `ALTER TABLE inquiries ADD COLUMN mailbox_name VARCHAR(255) NULL AFTER queue_name`,
    `ALTER TABLE inquiries ADD COLUMN snoozed_until DATETIME NULL AFTER mailbox_name`,
    `ALTER TABLE inquiries ADD COLUMN first_touched_at DATETIME NULL AFTER snoozed_until`,
    `ALTER TABLE inquiries ADD COLUMN first_response_at DATETIME NULL AFTER first_touched_at`,
    `ALTER TABLE inquiries ADD COLUMN first_touch_alerted_at DATETIME NULL AFTER first_response_at`,
    `ALTER TABLE inquiries ADD COLUMN response_alerted_at DATETIME NULL AFTER first_touch_alerted_at`,
    `ALTER TABLE inquiries ADD COLUMN last_action_at DATETIME NULL AFTER response_alerted_at`,
    `ALTER TABLE inquiries ADD COLUMN closed_at DATETIME NULL AFTER last_action_at`,
    `ALTER TABLE inquiries ADD COLUMN routing_reason VARCHAR(500) NULL AFTER closed_at`,
    `ALTER TABLE inquiries ADD COLUMN exception_reason VARCHAR(255) NULL AFTER routing_reason`,
    `ALTER TABLE inquiries ADD INDEX idx_inquiries_triage_state (triage_state)`,
    `ALTER TABLE inquiries ADD INDEX idx_inquiries_queue_name (queue_name)`,
    `ALTER TABLE inquiries ADD COLUMN case_id INT`,
    `ALTER TABLE inquiries ADD KEY idx_inquiries_case (case_id)`,
  ];
  for (const sql of sprint18InquiryAlters) {
    try { await conn.execute(sql); } catch (_) {}
  }

  // Unique indexes — ignore ER_DUP_KEYNAME
  await conn.execute(`CREATE UNIQUE INDEX idx_inquiries_msgid ON inquiries (email_account_id, message_id)`)
    .catch(err => { if (err.code !== 'ER_DUP_KEYNAME') throw err; });
  await conn.execute(`CREATE UNIQUE INDEX idx_inquiries_msghash ON inquiries (email_account_id, message_hash)`)
    .catch(err => { if (err.code !== 'ER_DUP_KEYNAME') throw err; });

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS inbox_routing_rules (
      id                 INT           NOT NULL AUTO_INCREMENT,
      org_id             INT           NOT NULL,
      name               VARCHAR(120)  NOT NULL,
      priority           INT           NOT NULL DEFAULT 100,
      is_active          TINYINT(1)    NOT NULL DEFAULT 1,
      sender_contains    VARCHAR(255),
      recipient_contains VARCHAR(255),
      subject_contains   VARCHAR(255),
      body_contains      VARCHAR(255),
      queue_name         VARCHAR(100)  NOT NULL,
      assign_to_user_id  INT,
      routing_note       VARCHAR(255),
      created_by         INT,
      created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_inbox_routing_rules_org_active (org_id, is_active, priority),
      KEY idx_inbox_routing_rules_user (assign_to_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS reply_templates (
      id         INT           NOT NULL AUTO_INCREMENT,
      name       VARCHAR(255)  NOT NULL,
      subject    VARCHAR(500),
      body       TEXT          NOT NULL,
      created_by INT,
      is_active  TINYINT(1)    NOT NULL DEFAULT 1,
      created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY fk_reply_templates_user (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS inquiry_notes (
      id          INT           NOT NULL AUTO_INCREMENT,
      inquiry_id  INT           NOT NULL,
      user_id     INT,
      user_name   VARCHAR(255)  NOT NULL,
      note        TEXT          NOT NULL,
      created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_inquiry_notes_inquiry (inquiry_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS service_logs (
      id            INT           NOT NULL AUTO_INCREMENT,
      source        VARCHAR(100)  NOT NULL,
      service_type  VARCHAR(100)  NOT NULL,
      description   VARCHAR(500)  NOT NULL,
      details       TEXT,
      status        VARCHAR(50)   NOT NULL DEFAULT 'success',
      created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_service_logs_source (source),
      KEY idx_service_logs_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS inquiry_attachments (
      id            INT           NOT NULL AUTO_INCREMENT,
      inquiry_id    INT           NOT NULL,
      filename      VARCHAR(500),
      mime_type     VARCHAR(255),
      size_bytes    INT,
      storage_path  TEXT,
      created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_inquiry_attachments_inquiry (inquiry_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS email_retry_log (
      id           INT NOT NULL AUTO_INCREMENT,
      site_id      INT,
      recipient    VARCHAR(255),
      subject      VARCHAR(500),
      attempt_no   INT NOT NULL DEFAULT 1,
      status       VARCHAR(50) NOT NULL DEFAULT 'pending',
      error_msg    TEXT,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
