'use strict';

async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS inquiry_read_receipts (
      id             INT           NOT NULL AUTO_INCREMENT,
      inquiry_id     INT           NOT NULL,
      org_id         INT           NOT NULL,
      user_id        INT           NOT NULL,
      read_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_viewed_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_inquiry_user_read_receipt (inquiry_id, user_id),
      KEY idx_inquiry_read_receipts_inquiry (inquiry_id),
      KEY idx_inquiry_read_receipts_user (user_id),
      KEY idx_inquiry_read_receipts_org (org_id),
      KEY idx_inquiry_read_receipts_read_at (read_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
