'use strict';

/**
 * Migration 164 — the fingerprint of the report a bridge case was created from
 * (bridge plan P5, approved by Rohith 2026-10-10).
 *
 * MIMS computes it from the report as it arrived, stores it here and returns it
 * with the case number, so the sending portal holds a receipt for exactly what
 * MIMS received. Reconciliation (P6) compares the two. Empty for cases created
 * before this migration or outside the bridge.
 */

async function columnExists(conn, table, column) {
  const [[row]] = await conn.execute(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`, [table, column]);
  return row.n > 0;
}

async function up(conn) {
  if (!(await columnExists(conn, 'cases', 'source_fingerprint'))) {
    await conn.execute('ALTER TABLE cases ADD COLUMN source_fingerprint CHAR(64) NULL');
  }
}

async function down(_conn) {}

module.exports = { up, down };
