'use strict';

/**
 * Migration 103 — mark PV signal reviews as not statistically validated.
 *
 * MIMS-46, Option B (decided by Rohith 2026-07-30, recommended by Sowmya):
 * automatic PRR/ROR flags are disabled until a real background-reporting-rate
 * comparator dataset exists, and the feature is labelled "not yet statistically
 * validated".
 *
 * Why: signalDetectionService called
 *   computePrRor({ a: row.case_count, b: 5, c: 3, d: 30 })
 * with the comparator cells hardcoded. That reduces to ror = 2a against a
 * threshold of ror >= 2, so EVERY product/reaction pair with at least one case
 * was flagged `review_required`. Combined with `HAVING COUNT(...) >= 1`, the
 * module flagged everything it found. The flag carried no information at all.
 *
 * Existing rows are marked, not deleted: they are a record of what the system
 * told reviewers, and a pharmacovigilance audit trail is not something to
 * quietly rewrite. They are simply no longer presentable as valid signals.
 */

async function up(conn) {
  try {
    await conn.execute(
      `ALTER TABLE pv_signal_reviews
         ADD COLUMN is_statistically_validated TINYINT(1) NOT NULL DEFAULT 0`
    );
  } catch (_) { /* already applied */ }

  try {
    await conn.execute(
      `ALTER TABLE pv_signal_reviews
         ADD COLUMN validation_note VARCHAR(255) NULL`
    );
  } catch (_) { /* already applied */ }

  // Every existing row was produced by the hardcoded-comparator calculation.
  await conn.execute(
    `UPDATE pv_signal_reviews
        SET is_statistically_validated = 0,
            validation_note = 'Generated before MIMS-46: hardcoded comparators, flag was always true. Not a valid signal.'
      WHERE validation_note IS NULL`
  );
}

module.exports = { up };
