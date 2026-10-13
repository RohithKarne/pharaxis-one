'use strict';

/**
 * Migration 174 — the case form cut list (case form clean-up PR 3, Saad's cut
 * table as Rohith ordered it built, 2026-10-13).
 *
 * WHY
 * The form carried about twice what a reviewer needs: event and product facts
 * once per case beside the event and product rows, seriousness three ways, dates
 * five ways, and flat sections copying the Communications, QA and Transmissions
 * modules. The list lives in catalogs/caseFormCutList.js.
 *
 * WHAT — a hide, never a delete
 * - Each listed field: is_hidden = 1 and is_required = 0, for the platform
 *   defaults and for each organisation where the field's own input holds no
 *   value (services/fieldUsageService.js, the count on Case Form Fields).
 *   Where it holds a value the field stays shown: it waits for Rohith's word.
 *   Rows marked `decided` (MedDRA coding, company causality, the old
 *   Concomitant flag replaced by Role) are hidden whatever they hold.
 * - Each listed section: case_form_definition.is_visible = 0, unless a field in
 *   it holds a value in that organisation.
 * Stored values and their history are untouched; an admin can show any of them
 * again on Case Form Fields. Each organisation's outcome is written to the
 * audit log (entity case_form_cleanup) so it can be read back.
 */

const { CUT_FIELDS, CUT_SECTIONS, cutKey } = require('../../catalogs/caseFormCutList');
const { usageForFields } = require('../../services/fieldUsageService');

async function up(conn) {
  const wanted = new Map(CUT_FIELDS.map(f => [cutKey(f.section, f.field), f]));

  // Platform defaults hold no case data: hide every listed row.
  const [platformRows] = await conn.execute('SELECT id, section_name, field_name FROM field_setup WHERE org_id IS NULL');
  for (const row of platformRows) {
    if (wanted.has(cutKey(row.section_name, row.field_name))) {
      await conn.execute('UPDATE field_setup SET is_hidden = 1, is_required = 0 WHERE id = ?', [row.id]);
    }
  }

  const [orgs] = await conn.execute('SELECT id FROM organisations');
  for (const org of orgs) {
    const [rows] = await conn.execute(
      `SELECT id, section_name, field_name, core_key, is_hidden FROM field_setup
        WHERE org_id = ? AND section_name <> '__customize_placeholder__'`, [org.id]);
    const listed = rows.filter(r => wanted.has(cutKey(r.section_name, r.field_name)));
    const sectionRows = rows.filter(r => CUT_SECTIONS.some(s => s.section === r.section_name));
    const usage = await usageForFields(org.id, [...listed, ...sectionRows], conn);
    const held = (r) => Number(usage[r.id]?.cases || 0) > 0;

    const hidden = [], kept = [];
    for (const row of listed) {
      const entry = wanted.get(cutKey(row.section_name, row.field_name));
      if (held(row) && !entry.decided) { kept.push(`${row.section_name} / ${row.field_name} (${usage[row.id].cases})`); continue; }
      await conn.execute('UPDATE field_setup SET is_hidden = 1, is_required = 0 WHERE id = ?', [row.id]);
      hidden.push(`${row.section_name} / ${row.field_name}`);
    }

    const sectionsOff = [], sectionsKept = [];
    for (const s of CUT_SECTIONS) {
      const inSection = sectionRows.filter(r => r.section_name === s.section);
      if (inSection.some(held)) { sectionsKept.push(`${s.caseType} ${s.section}`); continue; }
      const [res] = await conn.execute(
        'UPDATE case_form_definition SET is_visible = 0 WHERE org_id = ? AND case_type = ? AND section_name = ?',
        [org.id, s.caseType, s.section]
      );
      if (res.affectedRows) sectionsOff.push(`${s.caseType} ${s.section}`);
    }

    await conn.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
       VALUES (NULL, 'Migration 174', 'CASE_FORM_CUT', 'case_form_cleanup', ?, ?)`,
      [org.id, JSON.stringify({ hidden, kept_because_values: kept, sections_off: sectionsOff, sections_kept_because_values: sectionsKept })]
    ).catch(() => {});
  }
}

module.exports = { up };
