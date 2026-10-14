'use strict';

/**
 * Migration 183 — an index on each organisation's cases by Date Received
 * (reports review, Saad 2026-10-14).
 *
 * WHY
 * Reports now count cases from their Date Received (day 0), not the day the row
 * was created. created_at had an index; date_received had none, so every period
 * report read all of the organisation's cases.
 */

async function up(conn) {
  const [[exists]] = await conn.execute(
    "SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cases' AND INDEX_NAME = 'idx_cases_org_received'"
  );
  if (!exists.n) await conn.execute('ALTER TABLE cases ADD INDEX idx_cases_org_received (org_id, date_received)');
}

module.exports = { up };
