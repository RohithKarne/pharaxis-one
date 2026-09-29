'use strict';
// Migration 119 — link MI subcategories to their category (T19, 360 walk M-19).
//
// WHY
// Every MI subcategory could be picked under every category ("Dosage" ›
// "Pregnancy - First Trimester"). picklists.parent_value_id supports the link
// but none was set. Map agreed with Rohith 2026-09-29 (Saad's draft):
//   Dosage → Dosing · Drug Interactions → Interactions, Drug-Drug Interaction ·
//   Efficacy → Efficacy · Pregnancy/Lactation → the three trimesters ·
//   Safety → Safety · Formulation → Storage.
// "General Query" and "Other" stay unlinked: an unlinked value is offered under
// every category.
//
// SAFETY
// Sets parent_value_id only where it is empty, inside each organisation's own
// lists (category and subcategory must belong to the same org). Nothing inserted,
// deleted or renamed. A value or category an org does not have is skipped.

const MAP = [
  ['Dosing', 'Dosage'],
  ['Interactions', 'Drug Interactions'],
  ['Drug-Drug Interaction', 'Drug Interactions'],
  ['Efficacy', 'Efficacy'],
  ['Pregnancy - First Trimester', 'Pregnancy/Lactation'],
  ['Pregnancy - Second Trimester', 'Pregnancy/Lactation'],
  ['Pregnancy - Third Trimester', 'Pregnancy/Lactation'],
  ['Safety', 'Safety'],
  ['Storage', 'Formulation'],
];

async function up(conn) {
  for (const [sub, category] of MAP) {
    await conn.execute(
      `UPDATE picklists s
         JOIN picklist_fields sf ON sf.id = s.field_id AND sf.name = 'mi_subcategory'
         JOIN picklists c ON c.org_id <=> s.org_id AND c.name = ?
         JOIN picklist_fields cf ON cf.id = c.field_id AND cf.name = 'mi_category'
          SET s.parent_value_id = c.id
        WHERE s.name = ? AND s.parent_value_id IS NULL`,
      [category, sub]
    );
  }
}

module.exports = { up };
