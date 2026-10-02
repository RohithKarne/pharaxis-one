'use strict';

/**
 * Migration 144 — a case records when its reporter's identity was erased (bridge row 10).
 *
 * WHY
 * Erasure only travelled from the portal to MIMS. A person who asked MIMS (or the
 * company running it) to erase their details kept their name and email on the
 * portal's copy of the report, and MIMS had no way to say the erasure had happened.
 *
 * WHAT
 * cases.reporter_erased_at — set when the reporter's identity is blanked on the case,
 * whoever asked for it. The change feed reports it, so the portal blanks its copy too.
 * Filled from the case history for cases erased before this column existed; the fill
 * does not touch updated_at. Idempotent.
 */

async function columnExists(conn, table, column) {
  const [[row]] = await conn.execute(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`, [table, column]);
  return row.n > 0;
}

async function up(conn) {
  if (!(await columnExists(conn, 'cases', 'reporter_erased_at'))) {
    await conn.execute('ALTER TABLE cases ADD COLUMN reporter_erased_at DATETIME NULL');
  }
  await conn.execute(
    `UPDATE cases c
        JOIN (SELECT t.case_id, MIN(t.timestamp) AS at FROM case_audit_trail t
               WHERE t.action_type = 'REPORTER_IDENTITY_REDACTED' GROUP BY t.case_id) a ON a.case_id = c.id
        SET c.reporter_erased_at = a.at, c.updated_at = c.updated_at
      WHERE c.reporter_erased_at IS NULL`);
}

module.exports = { up };
