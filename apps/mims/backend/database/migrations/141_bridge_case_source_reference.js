'use strict';

/**
 * Migration 141 — a case sent by a portal is matched on WHO sent it and THEIR
 * reference, not on the reference alone (bridge row 5).
 *
 * WHY
 * Intake treated "a case in this organisation already has number CP-000350" as "this
 * is a repeat of the same report" and returned that case. A second portal (or any
 * other system) using the same reference was handed someone else's case: its own
 * report never became a case, and that portal's closes and erasures would act on the
 * other portal's person.
 *
 * WHAT
 * cases.source_reference — the reference exactly as the sending connection gave it,
 * unique per connection (source_api_client_id from migration 140). The case number
 * stays the reference where it is free, and gets a suffix (CP-000350-2) where another
 * source already uses it. Filled from case_number for cases whose creator is known.
 * The fill does not touch updated_at. Idempotent.
 */

async function columnExists(conn, table, column) {
  const [[row]] = await conn.execute(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`, [table, column]);
  return row.n > 0;
}

async function up(conn) {
  if (!(await columnExists(conn, 'cases', 'source_reference'))) {
    await conn.execute(
      `ALTER TABLE cases ADD COLUMN source_reference VARCHAR(100) NULL,
         ADD UNIQUE KEY uq_cases_source_reference (source_api_client_id, source_reference)`);
  }
  await conn.execute(
    `UPDATE cases SET source_reference = case_number, updated_at = updated_at
      WHERE source_api_client_id IS NOT NULL AND source_reference IS NULL AND case_number IS NOT NULL`);
}

module.exports = { up };
