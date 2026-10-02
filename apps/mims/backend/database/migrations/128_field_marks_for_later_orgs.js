'use strict';
// Migration 128 — organisations created after migration 121 get its field marks (MIPM-106).
//
// WHY
// 108, 109, 118 and 121 were UPDATEs, so they reached only the organisations that
// existed when they ran. An organisation created later took its marks from the
// platform rows (MIPM-66 / 124), which carry no row for 22 of these fields: its case
// forms drew 19 fields twice and showed the five retired MedDRA / causality fields.
// seedService now applies the catalogue marks to a new organisation; this catches
// the ones created in between.
//
// WHICH ORGANISATIONS
// Only an organisation whose "MedDRA Term" event row still has no core_key — 121
// set that mark on every organisation it reached. So an organisation 121 processed,
// including any field an admin has since chosen to show again, is left alone.
//
// SAFETY
// Sets core_key only where empty and hides only the five retired fields. Nothing
// inserted or deleted; stored case values are untouched. Idempotent: a processed
// organisation no longer matches.

const { applyCatalogueFieldMarks, RETIRED_SECTION } = require('../../services/fieldMarks');

async function up(conn) {
  const [orgs] = await conn.execute(
    `SELECT DISTINCT f.org_id
       FROM field_setup f
       JOIN organisations o ON o.id = f.org_id
      WHERE f.section_name = ?
        AND LOWER(TRIM(f.field_name)) = 'meddra term'
        AND (f.core_key IS NULL OR f.core_key = '')`,
    [RETIRED_SECTION]
  );
  for (const { org_id: orgId } of orgs) {
    await applyCatalogueFieldMarks(conn, orgId);
  }
  console.log(`[DB] 128: field marks applied to ${orgs.length} organisation(s) created after migration 121`);
}

module.exports = { up };
