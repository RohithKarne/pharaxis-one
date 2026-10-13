'use strict';

/**
 * Migration 171 — re-link the AE and PC panels' fields to their settings
 * (case form clean-up PR 2, Rohith 2026-10-13).
 *
 * WHY
 * Migrations 109, 118 and 121 gave the panel fields their core_key, but a
 * database initialised from the schema file records those migrations as
 * applied without running them, and seedService copied keys only from the
 * platform rows — seventeen panel fields (Date of Report, Reporter Awareness
 * Date, Race / Ethnicity, Last Menstrual Period, MedDRA Term, Reported
 * Causality, Frequency, Causality Assessment, End Date, Seriousness, PC
 * Classification, Date Received, Severity, Root Cause, Product Type, Product
 * Category, Storage Conditions) have no platform row. In every organisation
 * on such a database they stayed unkeyed: the panel could not read the
 * admin's label / required / hidden for them, and the configured-fields block
 * drew them a second time.
 *
 * WHAT
 * Same statement as 109: core_key from catalogs/panelCoreFields.js, only where
 * empty, for every organisation and the platform defaults. Nothing inserted,
 * deleted or otherwise changed. seedService now does the same for a new org.
 */

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
