'use strict';
// Migration 049 — B1 bug fix: dedup field_setup.
// The seed inserted duplicates because old seed used field_name like 'first_name'
// while caseFormExtensions used 'contact_first_name' / 'firstName' — the
// existing unique key (section_name, field_name, org_id) didn't catch the dup
// when the field_name differed slightly.
//
// Strategy:
//   1. Compute a normalized key = LOWER(REPLACE(REPLACE(field_name, '_',''), '-',''))
//   2. Keep the most-recent row per (section_name, normalized_key, org_id_or_zero)
//   3. Delete the rest
//   4. Add a generated normalized-name column + unique index so this can't happen again

async function up(conn) {
  // ── Find duplicates by (section, normalized_field_name, org) ────────────
  const [dups] = await conn.execute(`
    SELECT section_name,
           LOWER(REPLACE(REPLACE(REPLACE(field_name, '_',''), '-',''), ' ','')) AS norm_name,
           COALESCE(org_id, 0) AS org_key,
           GROUP_CONCAT(id ORDER BY updated_at DESC, id DESC) AS ids
      FROM field_setup
     GROUP BY section_name, norm_name, org_key
    HAVING COUNT(*) > 1
  `);

  let deleted = 0;
  for (const row of dups) {
    const ids = String(row.ids || '').split(',').map(s => parseInt(s, 10)).filter(Boolean);
    // Keep ids[0] (most recent), delete the rest
    const toDelete = ids.slice(1);
    if (!toDelete.length) continue;
    const placeholders = toDelete.map(() => '?').join(',');
    try {
      const [res] = await conn.execute(
        `DELETE FROM field_setup WHERE id IN (${placeholders})`,
        toDelete
      );
      deleted += res.affectedRows;
    } catch (_) { /* tolerate FK or constraint issue */ }
  }
  // eslint-disable-next-line no-console
  console.log(`[migration 049] Removed ${deleted} duplicate field_setup row(s).`);

  // ── Add a STORED generated column + tighter unique index ────────────────
  try {
    await conn.execute(`
      ALTER TABLE field_setup
        ADD COLUMN field_name_normalized VARCHAR(120)
          GENERATED ALWAYS AS
            (LOWER(REPLACE(REPLACE(REPLACE(field_name,'_',''),'-',''),' ',''))) STORED
    `);
  } catch (_) { /* already exists */ }

  try {
    await conn.execute(`
      ALTER TABLE field_setup
        ADD UNIQUE KEY uq_field_section_norm_org (section_name, field_name_normalized, org_id)
    `);
  } catch (_) { /* already exists */ }
}

async function down(conn) {
  try { await conn.execute(`ALTER TABLE field_setup DROP INDEX uq_field_section_norm_org`); } catch (_) {}
  try { await conn.execute(`ALTER TABLE field_setup DROP COLUMN field_name_normalized`);     } catch (_) {}
}

module.exports = { up, down };
