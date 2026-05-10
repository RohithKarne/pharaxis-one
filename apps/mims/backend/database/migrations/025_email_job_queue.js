'use strict';
// Migration 025 — Email job queue for async SMTP delivery
// Decouples MI response email sending from the API request path.

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS email_job_queue (
      id            INT          NOT NULL AUTO_INCREMENT,
      org_id        INT          NULL,
      case_id       INT          NULL,
      response_id   INT          NULL,
      job_type      VARCHAR(50)  NOT NULL DEFAULT 'mi_response',
      status        ENUM('pending','processing','sent','failed') NOT NULL DEFAULT 'pending',
      attempts      INT          NOT NULL DEFAULT 0,
      max_attempts  INT          NOT NULL DEFAULT 3,
      payload       JSON         NULL,
      error_message TEXT         NULL,
      created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      scheduled_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at  DATETIME     NULL,
      PRIMARY KEY (id),
      INDEX idx_status_scheduled (status, scheduled_at),
      INDEX idx_case_response    (case_id, response_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
