'use strict';
// Migration 109 — link the AE and PC panels' own fields to their field_setup rows.
//
// WHY
// Same defect as migration 108 fixed for MI (360 walk, M-36/M-26, 2026-09-28):
// the AE General / Patient Information and PC General / Patient / Product /
// Return & Retrieval / Replacement panels draw their fields themselves, but the
// field_setup rows carried no core_key — the panels could not honour the admin's
// required / hidden settings, and DynamicFieldsSection drew the same fields again
// as "additional fields", stored separately. The field list lives in
// catalogs/panelCoreFields.js, shared with the save routes' required check.
//
// SAFETY
// Idempotent and additive: sets core_key only where it is empty, for every org and
// the org_id IS NULL platform defaults. Nothing inserted, deleted or otherwise
// changed. Keys are prefixed "ae_" / "pc_" plus the tab, so they never collide.

const { PANEL_CORE_FIELDS } = require('../../catalogs/panelCoreFields');

async function up(conn) {
  for (const f of PANEL_CORE_FIELDS) {
    await conn.execute(
      `UPDATE field_setup
          SET core_key = ?
        WHERE section_name = ?
          AND LOWER(TRIM(field_name)) = LOWER(?)
          AND (core_key IS NULL OR core_key = '')`,
      [f.coreKey, f.section, f.field]
    );
  }
}

module.exports = { up };
