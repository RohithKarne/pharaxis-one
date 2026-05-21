'use strict';

/**
 * Migration 084 — Manual case escalation + compliant letter supersede.
 *
 * Completes the last two division change-control rules:
 *  - cc_reason_escalation     → needs a user-initiated escalation action (case-level).
 *  - cc_reason_reopen_letter  → "reopen" implemented as compliant SUPERSEDE: a new
 *                               amended MI-response version that references the
 *                               original, leaving the finalized original intact
 *                               (preserves 21 CFR Part 11 immutability).
 */

const ALTERS = [
  // Case-level manual escalation
  `ALTER TABLE cases ADD COLUMN escalated_at DATETIME NULL`,
  `ALTER TABLE cases ADD COLUMN escalation_level INT NOT NULL DEFAULT 0`,
  `ALTER TABLE cases ADD COLUMN escalation_reason VARCHAR(1000) NULL`,
  // Letter supersede lineage (original is never mutated)
  `ALTER TABLE case_mi_responses ADD COLUMN supersedes_response_id INT NULL`,
  `ALTER TABLE case_mi_responses ADD COLUMN superseded_by_id INT NULL`,
  `ALTER TABLE case_mi_responses ADD COLUMN superseded_at DATETIME NULL`,
];

async function up(conn) {
  for (const sql of ALTERS) {
    try {
      await conn.execute(sql);
    } catch (e) {
      if (!/duplicate column/i.test(e.message)) throw e;
    }
  }
}

async function down(_conn) {}

module.exports = { up, down };
