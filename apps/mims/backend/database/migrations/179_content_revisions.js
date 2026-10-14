'use strict';

/**
 * Migration 179 — revisions of published content (content management review,
 * Rohith 2026-10-14).
 *
 * WHY
 * Changing a published document meant checking it out, which took it out of
 * Published at once: letters and Browse Content lost it until the new wording
 * was checked in, reviewed, approved and published again. A published template
 * went back to Draft the moment it was edited, with the same effect. Content
 * systems keep the published version in use while the next one is drafted.
 *
 * `revision_of` on a draft points at the published row it will replace. When
 * the draft is published, that row is archived as superseded.
 */

const COLUMNS = [
  ['cm_documents', 'revision_of', 'INT NULL'],
  ['cm_templates', 'revision_of', 'INT NULL'],
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
