'use strict';

/**
 * Migration 122 — switch off duplicate complaint categories and routes (29 Sep
 * walk, M-106 and polish).
 *
 * Decision (Rohith, 2026-09-29, "go with your suggestions"; Saad's pick): the
 * values seeded on 31 March stay; the near-duplicates added on 14 April are
 * switched off, not deleted — as migration 112. An inactive value stays on any
 * record that already holds it and in the admin picklist screen, where it can
 * be switched back on; it is no longer offered.
 *
 *   pc_category     "Quality Defect"      — same as "Quality"
 *   pc_category     "Packaging Damage"    — same as "Packaging"
 *   pc_category     "Efficacy Complaint"  — same as "Efficacy"
 *   pc_category     "Labeling Error"      — same as "Labelling"
 *   route_of_admin  "Intravenous (IV)"    — same as "Intravenous"
 *   route_of_admin  "Intramuscular (IM)"  — same as "Intramuscular"
 *   route_of_admin  "Subcutaneous (SC)"   — same as "Subcutaneous"
 *
 * Checked before writing (org 1): the April categories are held only by walk
 * test cases; no record holds the bracketed routes; "Subcutaneous" is held by
 * about 48,000.
 *
 * Not here: the event Frequency list shows "Continuous" twice because two
 * picklists share the name "frequency" (events and dosing) — raised as M-111.
 *
 * Idempotent: only rows still Active are touched.
 */

const DUPLICATES = [
  ['pc_category', 'Quality Defect', 'Quality'],
  ['pc_category', 'Packaging Damage', 'Packaging'],
  ['pc_category', 'Efficacy Complaint', 'Efficacy'],
  ['pc_category', 'Labeling Error', 'Labelling'],
  ['route_of_admin', 'Intravenous (IV)', 'Intravenous'],
  ['route_of_admin', 'Intramuscular (IM)', 'Intramuscular'],
  ['route_of_admin', 'Subcutaneous (SC)', 'Subcutaneous'],
];

async function up(conn) {
  for (const [field, value, keep] of DUPLICATES) {
    await conn.execute(
      `UPDATE picklists p
         JOIN picklist_fields pf ON pf.id = p.field_id
          SET p.status = 'Inactive',
              p.governance_note = LEFT(CONCAT_WS(' ', p.governance_note, ?), 255)
        WHERE pf.name = ? AND p.name = ? AND p.status = 'Active'`,
      [`Switched off 2026-09-29 (walk): duplicate of "${keep}".`, field, value]
    );
  }
}

module.exports = { up };
