'use strict';

/**
 * Migration 157 — sessions remember when they were last used (MIPM-211).
 *
 * The idle timeout lived only in the browser cookie's lifetime: the server kept
 * every token valid for its full 8 hours, and Session Management counted idle
 * sessions as active. Existing rows start from their sign-in time.
 */

async function up(conn) {
  const [cols] = await conn.execute("SHOW COLUMNS FROM sessions LIKE 'last_seen_at'");
  if (cols.length) return;
  await conn.execute('ALTER TABLE sessions ADD COLUMN last_seen_at DATETIME NULL DEFAULT CURRENT_TIMESTAMP');
  await conn.execute('UPDATE sessions SET last_seen_at = created_at');
}

async function down(_conn) {}

module.exports = { up, down };
