'use strict';

/**
 * Migration 188 — two columns the code added at run time move into the schema
 * (full audit, 2026-11-10).
 *
 * WHY
 * cm_faqs.view_count was added by an ALTER when the FAQ routes loaded. On a new
 * database that ran before the table existed and failed quietly, so a new
 * install never had the column and FAQ views were never counted.
 * user_2fa_challenges.attempts was added by the first email-code check, which
 * needs the application's database user to hold ALTER at sign-in time.
 */

async function addColumn(conn, table, column, definition) {
  const [cols] = await conn.execute(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
  if (!cols.length) await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function up(conn) {
  await addColumn(conn, 'cm_faqs', 'view_count', 'INT DEFAULT 0');
  await addColumn(conn, 'user_2fa_challenges', 'attempts', 'INT NOT NULL DEFAULT 0');
}

async function down(_conn) {}

module.exports = { up, down };
