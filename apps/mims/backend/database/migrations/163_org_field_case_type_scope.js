'use strict';

/**
 * Migration 163 — give organisation case-form fields their case type (MIPM-222).
 *
 * Organisations created after migration 048 had their fields seeded without a
 * case type, so every field read as shared and Case Form Fields listed every AE
 * and PC section under MI. Fields in an "AE — …", "MI — …" or "PC — …" section
 * that are still marked shared take that section's type, as the platform rows
 * do. Fields outside those sections, and fields already typed, are left alone.
 */

async function up(conn) {
  for (const type of ['AE', 'MI', 'PC']) {
    await conn.execute(
      `UPDATE field_setup
          SET case_type_scope = ?
        WHERE org_id IS NOT NULL
          AND case_type_scope = 'shared'
          AND section_name LIKE ?`,
      [type.toLowerCase(), `${type} —%`]
    );
  }
}

async function down(_conn) {}

module.exports = { up, down };
