'use strict';

/**
 * Migration 142 — where a case sent by a connected system lands (bridge row 6).
 *
 * WHY
 * Every portal case went to the organisation's first site and the first workflow state
 * by id — "Email Intake" — whatever the portal was and wherever its reporters were.
 *
 * WHAT
 * api_clients.default_site_id and api_clients.initial_status_id, set per connection in
 * MIMS Admin > API connections. Empty means: first site, and the state named "New"
 * (the organisation's own, else the platform's), else the first state as before.
 * Idempotent.
 */

async function columnExists(conn, table, column) {
  const [[row]] = await conn.execute(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`, [table, column]);
  return row.n > 0;
}

async function up(conn) {
  if (!(await columnExists(conn, 'api_clients', 'default_site_id'))) {
    await conn.execute('ALTER TABLE api_clients ADD COLUMN default_site_id INT NULL');
  }
  if (!(await columnExists(conn, 'api_clients', 'initial_status_id'))) {
    await conn.execute('ALTER TABLE api_clients ADD COLUMN initial_status_id INT NULL');
  }
}

module.exports = { up };
