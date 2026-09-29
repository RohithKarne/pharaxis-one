'use strict';
// Migration 118 — link the AE list tabs' and notes tabs' fields to their field_setup rows.
//
// WHY
// Same defect as 108/109 (360 walk M-36/M-26), for the tabs 109 left out: AE Events &
// Seriousness, Product Information, Lab Results, Medical History, Lab Notes and
// Medical Notes. Their field_setup rows carried no core_key, so the row forms ignored
// the admin's label / required / hidden, and DynamicFieldsSection drew the same
// fields again as "additional fields" (e.g. a second "Event Description" box on the
// AE step, stored separately from the event rows). The field list is in
// catalogs/panelCoreFields.js.
//
// SAFETY
// Idempotent and additive, like 109: sets core_key only where it is empty, for every
// org and the org_id IS NULL platform defaults. Nothing inserted, deleted or
// otherwise changed. Rows already linked by 109 are untouched.

const { PANEL_CORE_FIELDS } = require('../../catalogs/panelCoreFields');

const TABS = ['events', 'product-info', 'lab-results', 'medical-history', 'lab-notes', 'medical-notes'];

async function up(conn) {
  for (const f of PANEL_CORE_FIELDS.filter(x => x.scope === 'ae' && TABS.includes(x.tab))) {
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
