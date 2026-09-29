'use strict';
// Migration 121 — AE event fields: link the rest of the event row, switch off
// the coding and company-causality fields (M-101, M-103).
//
// WHY
// M-101: the event row form draws MedDRA Term, Reported Causality, Frequency,
// Causality Assessment, End Date and the seriousness tick-boxes, but only
// Event Description, Onset Date and Outcome were linked (118). The unlinked
// field_setup rows were drawn again in "Additional fields · AE — Events &
// Seriousness", at case level, so the same facts had two places to go.
// M-103: product boundary (Rohith, 2026-07-28) — MIMS captures and hands off;
// MedDRA coding and company causality belong to the receiving safety system,
// and the handoff payload sends neither. The form still asked agents for them.
// Decision (Rohith, 2026-09-29): hide MedDRA Term and Causality Assessment and
// drop the duplicate block.
//
// WHAT
// 1. core_key on the rows in catalogs/panelCoreFields.js, where empty (as 118).
// 2. is_hidden = 1 on MedDRA Term, Causality Assessment, MedDRA SOC, MedDRA HLT
//    and MedDRA Version in that section, for the platform defaults and every
//    organisation, where not already hidden. An admin can switch any of them
//    back on in Customize Forms. Nothing is deleted; stored values stay.

const { PANEL_CORE_FIELDS } = require('../../catalogs/panelCoreFields');

const SECTION = 'AE — Events & Seriousness';
const HIDE = ['MedDRA Term', 'Causality Assessment', 'MedDRA SOC', 'MedDRA HLT', 'MedDRA Version'];

async function up(conn) {
  for (const f of PANEL_CORE_FIELDS.filter(x => x.scope === 'ae' && x.tab === 'events')) {
    await conn.execute(
      `UPDATE field_setup
          SET core_key = ?
        WHERE section_name = ?
          AND LOWER(TRIM(field_name)) = LOWER(?)
          AND (core_key IS NULL OR core_key = '')`,
      [f.coreKey, f.section, f.field]
    );
  }
  for (const field of HIDE) {
    await conn.execute(
      `UPDATE field_setup
          SET is_hidden = 1
        WHERE section_name = ?
          AND LOWER(TRIM(field_name)) = LOWER(?)
          AND COALESCE(is_hidden, 0) = 0`,
      [SECTION, field]
    );
  }
}

module.exports = { up };
