'use strict';
/**
 * Migration 187 — Inquiry Ledger alerts (MIPM-223, Rohith 2026-10-27).
 *
 * The Inquiry Ledger tells people once when an open case turns red: its owner, or
 * the case supervisors when nobody owns it. One row per case and stage it was told
 * about (waiting for an owner, with an owner), so the next sweep does not tell them
 * again; `summary` marks cases covered by one summary notice instead of their own.
 */
async function up(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS inquiry_ledger_alerts (
      case_id    INT         NOT NULL,
      stage      VARCHAR(20) NOT NULL,
      org_id     INT         NOT NULL,
      summary    TINYINT(1)  NOT NULL DEFAULT 0,
      alerted_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (case_id, stage),
      KEY idx_inquiry_ledger_alerts_org (org_id, alerted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

module.exports = { up };
