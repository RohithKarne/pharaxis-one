'use strict';

/**
 * Migration 112 — switch off duplicate picklist values (T12, M-19 / M-28).
 *
 * Decision (Rohith, 2026-09-29): true duplicates are switched off, not deleted.
 * An inactive value stays on any record that already holds it and in the admin
 * picklist screen, where it can be switched back on; it is no longer offered.
 *
 *   response_channel "Phone"   — same as "Phone Call" (the seeded value)
 *   response_channel "Letter"  — same as "Written Letter" (the seeded value)
 *   priority         "Medium"  — same as "Normal"; the app only knows
 *                                low / normal / high / urgent
 *
 * Checked before writing: no case_mi or case_mi_responses row uses any of the
 * four channel values; one case holds priority "Medium" and keeps it (priority is
 * not checked against the picklist when a case is saved).
 *
 * Not duplicates, left on: "Interactions" vs "Drug-Drug Interaction" (the second
 * is narrower); "Safety Intake" vs "Safety Escalations" (different queues).
 *
 * Idempotent: only rows still Active are touched.
 */

const DUPLICATES = [
  ['response_channel', 'Phone', 'Phone Call'],
  ['response_channel', 'Letter', 'Written Letter'],
  ['priority', 'Medium', 'Normal'],
];

async function up(conn) {
  for (const [field, value, keep] of DUPLICATES) {
    await conn.execute(
      `UPDATE picklists p
         JOIN picklist_fields pf ON pf.id = p.field_id
          SET p.status = 'Inactive',
              p.governance_note = LEFT(CONCAT_WS(' ', p.governance_note, ?), 255)
        WHERE pf.name = ? AND p.name = ? AND p.status = 'Active'`,
      [`Switched off 2026-09-29 (T12): duplicate of "${keep}".`, field, value]
    );
  }
}

module.exports = { up };
