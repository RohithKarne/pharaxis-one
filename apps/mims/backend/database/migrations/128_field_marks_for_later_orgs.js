'use strict';
// Migration 128 — organisations created after the field migrations get their marks and routing (MIPM-106).
//
// WHY
// 108, 109, 118 and 121 were UPDATEs, so they reached only the organisations that
// existed when they ran. An organisation created later took its marks from the
// platform rows (MIPM-66 / 124), which carry no row for 22 of these fields: its case
// forms drew 19 fields twice and showed the five retired MedDRA / causality fields.
// Migration 048 likewise routed each field to its case type and tab only for the rows
// that existed then; a later organisation's fields were all "shared, any tab".
// seedService now applies both to a new organisation; this catches the ones created
// in between.
//
// WHICH ORGANISATIONS
// Only an organisation whose "MedDRA Term" event row still has no core_key — 121
// set that mark on every organisation it reached. So an organisation 121 processed,
// including any field an admin has since chosen to show again, is left alone.
//
// Routing: every organisation's rows that still have no tab get 048's rule. That rule
// reproduces orgs 1 and 26 exactly (checked on the dev copy, 2026-10-02).
//
// SAFETY
// Sets core_key and routing only where empty and hides only the five retired fields. Nothing
// inserted or deleted; stored case values are untouched. Idempotent: a processed
// organisation no longer matches.

const { applyCatalogueFieldMarks, applySectionRouting, RETIRED_SECTION } = require('../../services/fieldMarks');

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

  const [unrouted] = await conn.execute(
    `SELECT DISTINCT f.org_id
       FROM field_setup f
       JOIN organisations o ON o.id = f.org_id
      WHERE f.display_tab IS NULL`
  );
  for (const { org_id: orgId } of unrouted) {
    await applySectionRouting(conn, orgId);
  }
  console.log(`[DB] 128: field routing applied to ${unrouted.length} organisation(s)`);
}

module.exports = { up };
