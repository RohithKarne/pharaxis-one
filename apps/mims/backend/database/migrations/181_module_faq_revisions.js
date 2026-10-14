'use strict';

/**
 * Migration 181 — revisions of published modules and FAQs (content management
 * review follow-up, Rohith 2026-10-14: "go with both recommendations").
 *
 * WHY
 * Migration 179 let a published document or template stay in use while its next
 * version is drafted. Modules and FAQs still had to leave Published to change:
 * a module went back to Draft, which stopped every document built from it from
 * being sent; a published FAQ could not be changed at all. `revision_of` on a
 * draft points at the published row it will replace when it is published.
 */

const COLUMNS = [
  ['cm_modules', 'revision_of', 'INT NULL'],
  ['cm_faqs', 'revision_of', 'INT NULL'],
];

async function up(conn) {
  for (const [table, column, definition] of COLUMNS) {
    const [[exists]] = await conn.execute(
      'SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, column]
    );
    if (!exists.n) await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}, ADD INDEX idx_${table}_revision_of (${column})`);
  }
}

module.exports = { up };
