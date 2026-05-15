'use strict';
// Migration 029 — Add `department` column to picklists
// Supports the new MIMS Admin > Tables > General picklists screen where
// admin can optionally tag a picklist value to a department for filtering.

async function up(conn) {
  try { await conn.execute(`ALTER TABLE picklists ADD COLUMN department VARCHAR(100) NULL`); } catch (_) {}
  try { await conn.execute(`CREATE INDEX idx_picklists_department ON picklists(department)`); } catch (_) {}
}

async function down(conn) {
  try { await conn.execute(`DROP INDEX idx_picklists_department ON picklists`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE picklists DROP COLUMN department`); } catch (_) {}
}

module.exports = { up, down };
