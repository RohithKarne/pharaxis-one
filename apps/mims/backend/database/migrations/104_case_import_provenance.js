'use strict';

/**
 * Migration 104 — case import provenance.
 *
 * PAUD-4 item 4 (approved by Rohith 2026-08-03). The Implementation PMO question
 * was "how do five years of old enquiries get in, and how do we prove they
 * arrived intact?"
 *
 * The importer already existed (routes/integrations/caseImport.js) and already
 * counted imported and failed rows. What it could not do is *prove* the count,
 * because nothing tied an imported case back to the job that created it. The
 * job row said "4,987 imported" and there was no way to check that claim against
 * the database.
 *
 * A counter that cannot be reconciled against the records it claims to describe
 * is not migration evidence. This column is what makes the count-back possible.
 */

async function up(conn) {
  try {
    await conn.execute(
      `ALTER TABLE cases
         ADD COLUMN import_job_id INT NULL`
    );
  } catch (_) { /* already applied */ }

  try {
    await conn.execute(
      `ALTER TABLE cases
         ADD INDEX idx_cases_import_job (import_job_id)`
    );
  } catch (_) { /* already applied */ }

  // Cases already in the database predate this column. They are left NULL rather
  // than backfilled with a guess: "we do not know which job created this" is the
  // honest state, and inventing a provenance link would be worse than having none.
}

module.exports = { up };
