'use strict';

/**
 * Migration 124 — every organisation's fields carry the platform field marks (MIPM-66).
 *
 * WHY
 * Migrations 102, 108, 118 and 121 set field_setup.core_key — the mark that tells
 * the case form a field is one it already draws itself — and hid the retired
 * ones. Each was an UPDATE, so it reached only the organisations that existed
 * when it ran. seedService inserts a new organisation's fields without core_key,
 * so every organisation created since shows Priority, Description and the other
 * platform fields twice, and shows the two retired fields again.
 *
 * WHAT
 * The platform defaults (org_id IS NULL) already carry the right marks. For every
 * organisation row with no core_key, take it from the platform row with the same
 * section and field name. Where the platform row is hidden, hide the organisation
 * row too — but only on a row that gets its mark here, so a field an admin has
 * since chosen to show on an already-marked organisation is left alone.
 * seedService applies the same rule to new organisations.
 *
 * Idempotent: only rows with no core_key are touched.
 */

async function up(conn) {
  await conn.execute(
    `UPDATE field_setup f
       JOIN field_setup d
         ON d.org_id IS NULL
        AND d.section_name = f.section_name
        AND LOWER(TRIM(d.field_name)) = LOWER(TRIM(f.field_name))
        SET f.core_key  = d.core_key,
            f.is_hidden = GREATEST(COALESCE(f.is_hidden, 0), COALESCE(d.is_hidden, 0))
      WHERE f.org_id IS NOT NULL
        AND (f.core_key IS NULL OR f.core_key = '')
        AND d.core_key IS NOT NULL AND d.core_key <> ''`
  );
}

module.exports = { up };
