'use strict';

/**
 * Migration 101 — Allow system-authored case comments (Email Case Import, MIMS-29)
 *
 * case_comments.user_id was NOT NULL, so automated pipeline comments (the
 * "created from email — AI-assisted" label, follow-up attachments) could not
 * be written. Widen to NULL; the read path LEFT JOINs users already, and the
 * comments endpoint renders NULL authors as "System".
 *
 * Side effect fixed: caseConversionService's system comments were silently
 * failing on this constraint (swallowed by .catch) — they start working now.
 */

async function up(conn) {
  try {
    await conn.execute(`ALTER TABLE case_comments MODIFY COLUMN user_id INT NULL`);
  } catch (_) {}
}

async function down(conn) {
  try {
    await conn.execute(`DELETE FROM case_comments WHERE user_id IS NULL`);
    await conn.execute(`ALTER TABLE case_comments MODIFY COLUMN user_id INT NOT NULL`);
  } catch (_) {}
}

module.exports = { up, down };
