'use strict';

/**
 * Migration 086 — Data hygiene: dedupe access_activity_privileges.
 *
 * The unique key (org_id, privilege_key) does not constrain rows where org_id IS
 * NULL (MySQL treats each NULL as distinct), so repeated per-startup seeding left
 * duplicate global rows. getPrivilegeCatalog() already dedupes by key for the UI,
 * but this cleans the underlying table. Keeps the lowest id per (org_id, key).
 *
 * Note: the seed source should also be made idempotent to stop re-duplication;
 * tracked separately. This migration is safe to run repeatedly.
 */

async function up(conn) {
  try {
    await conn.execute(`
      DELETE a1 FROM access_activity_privileges a1
      JOIN access_activity_privileges a2
        ON a1.privilege_key = a2.privilege_key
       AND ((a1.org_id IS NULL AND a2.org_id IS NULL) OR a1.org_id = a2.org_id)
       AND a1.id > a2.id
    `);
  } catch (_) { /* best-effort hygiene */ }
}

async function down(_conn) {}

module.exports = { up, down };
