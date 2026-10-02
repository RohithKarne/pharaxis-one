'use strict';

/**
 * Migration 127 — a switched-off user carries why and when (MIPM-35).
 *
 * WHY
 * The user list said only "Inactive". MIPM-35 asks that it say why and when, and
 * that switching someone back on needs an administrator and a reason; the audit
 * trail keeps the full history.
 *
 * WHAT
 * users.inactive_reason and users.inactive_at, set when a user is switched off and
 * cleared when they are switched back on. Users already switched off have neither,
 * so the list shows them as plain "Inactive".
 *
 * Idempotent: each column is added only if it is missing.
 */

const COLUMNS = [
  ['inactive_reason', 'VARCHAR(255) NULL'],
  ['inactive_at', 'DATETIME NULL'],
];

async function up(conn) {
  for (const [column, definition] of COLUMNS) {
    const [rows] = await conn.execute(
      `SELECT 1
         FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'users'
          AND column_name = ?
        LIMIT 1`,
      [column]
    );
    if (rows.length) continue; // already present
    await conn.execute(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
  }
}

module.exports = { up };
