'use strict';

/**
 * Migration 193 — L3, personal emails per client (Rohith, 2026-11-13).
 * - organisations.allow_personal_emails: may this client's people use a personal
 *   email (contractors)? Off unless the client asks.
 * - organisations.company_email_domains: the client's own email domains, beside
 *   those its company login lists; an email outside them is personal.
 * - user_org_access.access_ends_on: the day a personal-email contractor's access to
 *   that organisation ends; a nightly job removes them from it.
 */

async function addColumn(conn, table, column, definition) {
  const [cols] = await conn.execute(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
  if (!cols.length) await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function up(conn) {
  await addColumn(conn, 'organisations', 'allow_personal_emails', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn(conn, 'organisations', 'company_email_domains', 'TEXT NULL');
  await addColumn(conn, 'user_org_access', 'access_ends_on', 'DATE NULL');
}

async function down(_conn) {}

module.exports = { up, down };
