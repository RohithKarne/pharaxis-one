'use strict';

/**
 * Migration 111 — index for counting an organisation's cases (T12, M-30).
 *
 * Every Case Query / case list page counts the organisation's live cases
 * (org_id = ? AND is_deleted = 0). With only idx_cases_org the count read every
 * row: about 1.1 s for 100k cases, the slowest part of the page once the
 * correspondence totals were taken out of it. (org_id, is_deleted) answers the
 * count from the index alone.
 *
 * Adds an index only; no data changes. Skipped only when the index already
 * exists (ER_DUP_KEYNAME); any other failure stops startup.
 */

async function up(conn) {
  try {
    await conn.execute('ALTER TABLE cases ADD INDEX idx_cases_org_deleted (org_id, is_deleted)');
  } catch (err) {
    if (err && err.code === 'ER_DUP_KEYNAME') return; // already applied
    throw err;
  }
}

module.exports = { up };
