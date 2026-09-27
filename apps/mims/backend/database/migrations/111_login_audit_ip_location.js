'use strict';

/**
 * Migration 111 — login_audit.ip_address and login_audit.location.
 *
 * The sign-in log writer (logLoginAudit in controllers/authController.js) inserts
 * both columns, but 001 creates login_audit without them and no later migration
 * adds them. Long-lived databases picked them up outside the migrations; a
 * database built from the migrations alone did not, so every sign-in log insert
 * failed and nothing was recorded. Found 2026-09-27 (lane 4, audit-trail holes).
 *
 * Types match the writer and the existing dev database: VARCHAR(45) NULL (fits a
 * full IPv6 address) and VARCHAR(255) NULL. Each column is added only when it is
 * missing, so on a database that already has them this is a no-op.
 *
 * 108–110 are taken on other branches; the runner applies files by name and does
 * not require consecutive numbers.
 */

const COLUMNS = [
  ['ip_address', 'VARCHAR(45) NULL'],
  ['location', 'VARCHAR(255) NULL'],
];

async function up(conn) {
  for (const [column, definition] of COLUMNS) {
    const [rows] = await conn.execute(
      `SELECT 1
         FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'login_audit'
          AND column_name = ?
        LIMIT 1`,
      [column]
    );
    if (rows.length) continue; // already present
    await conn.execute(`ALTER TABLE login_audit ADD COLUMN ${column} ${definition}`);
  }
}

module.exports = { up };
