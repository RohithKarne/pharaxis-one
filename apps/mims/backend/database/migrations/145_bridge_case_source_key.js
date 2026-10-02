'use strict';

/**
 * Migration 145 — a case sent by a connected system is matched on that report's own
 * key, not on its reference number alone (post-merge review of bridge #701).
 *
 * WHY
 * A repeat delivery was recognised by "this connection, this reference". A portal set
 * up again on a fresh database, or a second portal database using the same connection,
 * numbers its reports from the start again, so its new CP-000150 was handed the
 * existing case CP-000150 — another person's — with no error anywhere. Found on the
 * review walk, 2 Oct 2026.
 *
 * WHAT
 * cases.source_key — a random key the sender gives each report, unique per
 * connection. A delivery is a repeat only when its key matches. Empty for cases sent
 * before this; those are matched as before only within two hours of being created (the
 * portal's own retries finish within about 40 minutes). Idempotent.
 */

async function columnExists(conn, table, column) {
  const [[row]] = await conn.execute(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`, [table, column]);
  return row.n > 0;
}

async function up(conn) {
  if (!(await columnExists(conn, 'cases', 'source_key'))) {
    await conn.execute(
      `ALTER TABLE cases ADD COLUMN source_key VARCHAR(64) NULL,
         ADD UNIQUE KEY uq_cases_source_key (source_api_client_id, source_key)`);
  }
}

module.exports = { up };
