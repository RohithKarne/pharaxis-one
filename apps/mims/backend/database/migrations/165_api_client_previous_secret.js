'use strict';

/**
 * Migration 165 — a connection's previous secret, kept for a short while after a
 * new one is issued (bridge plan P7, approved by Rohith 2026-10-10).
 *
 * A connection had one secret and no way to change it short of creating a new
 * connection, which would cut it off from every case the old one sent. Now a new
 * secret can be issued and the old one keeps working until previous_secret_expires_at,
 * so the portal can be switched over without a gap.
 */

async function columnExists(conn, table, column) {
  const [[row]] = await conn.execute(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`, [table, column]);
  return row.n > 0;
}

async function up(conn) {
  if (!(await columnExists(conn, 'api_clients', 'previous_secret_hash'))) {
    await conn.execute('ALTER TABLE api_clients ADD COLUMN previous_secret_hash VARCHAR(255) NULL');
  }
  if (!(await columnExists(conn, 'api_clients', 'previous_secret_expires_at'))) {
    await conn.execute('ALTER TABLE api_clients ADD COLUMN previous_secret_expires_at DATETIME NULL');
  }
}

async function down(_conn) {}

module.exports = { up, down };
