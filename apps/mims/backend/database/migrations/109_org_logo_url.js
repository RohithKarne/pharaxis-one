'use strict';

/**
 * Migration 109 — organisations.logo_url
 *
 * The org logo upload (POST /api/admin/platform/orgs/:orgId/logo) writes
 * organisations.logo_url and GET /api/auth/org-logo reads it, but no migration
 * ever created the column. Databases that have it were given it by hand; a
 * database built from these migrations was not, so every logo upload on a fresh
 * install failed with a 500 ("Unknown column 'logo_url'").
 *
 * Adds the column only when it is missing, with the definition the existing dev
 * database already carries (VARCHAR(500) NULL), so there this is a no-op. Any
 * other failure stops startup rather than leaving the column silently absent.
 */

async function up(conn) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'organisations' AND column_name = 'logo_url'
      LIMIT 1`
  );
  if (!rows.length) {
    await conn.execute('ALTER TABLE organisations ADD COLUMN logo_url VARCHAR(500) NULL');
  }
}

module.exports = { up };
