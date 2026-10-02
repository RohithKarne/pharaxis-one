'use strict';
// MIPM-106: the field marks (core_key) and retired-field hiding that migrations 108, 109,
// 118 and 121 applied, for one organisation. Those migrations reached only the
// organisations that existed when they ran, and the platform rows that MIPM-66 copies
// from carry no row for 22 of these fields — so a new organisation drew 19 fields twice
// and showed the retired coding fields again. Takes a connection only (no pool), so
// both seedService and a migration can use it.

const { PANEL_CORE_FIELDS } = require('../catalogs/panelCoreFields');
const { MI_CORE_FIELDS } = require('../database/migrations/108_link_mi_core_fields');
const { SECTION: RETIRED_SECTION, HIDE: RETIRED_FIELDS } = require('../database/migrations/121_ae_events_link_and_hide_coding');
const { routeForSection } = require('../database/migrations/048_field_scope');

const CATALOGUE_MARKS = [
  ...MI_CORE_FIELDS.map(([section, field, coreKey]) => ({ section, field, coreKey })),
  ...PANEL_CORE_FIELDS,
];

async function applyCatalogueFieldMarks(conn, orgId) {
  for (const f of CATALOGUE_MARKS) {
    await conn.execute(
      `UPDATE field_setup
          SET core_key = ?
        WHERE org_id = ?
          AND section_name = ?
          AND LOWER(TRIM(field_name)) = LOWER(?)
          AND (core_key IS NULL OR core_key = '')`,
      [f.coreKey, orgId, f.section, f.field]
    );
  }
  for (const field of RETIRED_FIELDS) {
    await conn.execute(
      `UPDATE field_setup
          SET is_hidden = 1
        WHERE org_id = ?
          AND section_name = ?
          AND LOWER(TRIM(field_name)) = LOWER(?)
          AND COALESCE(is_hidden, 0) = 0`,
      [orgId, RETIRED_SECTION, field]
    );
  }
}

// Which case type and tab each field belongs to, by section name, as migration 048 set for
// the rows that existed then (it reproduces orgs 1 and 26 exactly). Only rows with no tab
// yet, so a routing an admin chose is kept. Without it every field of a new organisation
// was "shared, any tab": AE-only fields were drawn on MI and PC cases too.
async function applySectionRouting(conn, orgId) {
  const [sections] = await conn.execute(
    'SELECT DISTINCT section_name FROM field_setup WHERE org_id = ? AND display_tab IS NULL',
    [orgId]
  );
  for (const { section_name: sectionName } of sections) {
    const { scope, tab } = routeForSection(sectionName);
    await conn.execute(
      `UPDATE field_setup SET case_type_scope = ?, display_tab = ?
        WHERE org_id = ? AND section_name = ? AND display_tab IS NULL`,
      [scope, tab, orgId, sectionName]
    );
  }
}

module.exports = { applyCatalogueFieldMarks, applySectionRouting, RETIRED_SECTION };
