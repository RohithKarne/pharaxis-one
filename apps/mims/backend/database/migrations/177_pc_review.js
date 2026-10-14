'use strict';

/**
 * Migration 177 — the PC field review (Rohith, 2026-10-13, "go with all 6").
 *
 * WHY
 * - A complaint record holds, where known, the product's name and strength,
 *   the lot, the complainant, the nature of the complaint and the reply to the
 *   complainant (21 CFR 211.198(b)(1)). MIMS had no strength and no reply.
 * - An illegitimate product is notified to FDA within 24 hours (DSCSA); a
 *   device part's malfunction has its own reporting (21 CFR Part 4 Subpart B).
 *   MIMS asked neither.
 * - The patient on a complaint is held as initials and age, as the safety
 *   report holds it, not full name and date of birth.
 * - Investigation & CAPA kept fifteen fields no case used; the investigation
 *   runs in the client's quality system. The complaint record keeps whether one
 *   was needed or why not and who decided, the findings, the CAPA reference
 *   and reportability (211.198(b)(2)-(3); Field Alert Report within 3 working
 *   days, 21 CFR 314.81(b)(1)).
 *
 * WHAT
 * 1. Columns: case_pc_general reply_date, reply_summary, suspected_counterfeit,
 *    device_involved, device_malfunction; case_pc_product_info.strength;
 *    case_pc_patient_info.patient_initials. Where missing.
 * 2. field_setup rows for the new PC fields (catalogs/caseFormCutList.js
 *    NEW_FIELDS), for the platform defaults and every organisation, where missing.
 * 3. PC rows marked `decided` in the cut list: hidden and not required,
 *    for the platform defaults and every organisation. Values kept.
 * 4. The three PC show-only-when rules, per organisation, where missing.
 * 5. Reportability Determination offers "Field Alert Report (3 working days)",
 *    per organisation that has the list, where missing.
 * Nothing is deleted. Each organisation's outcome is in the audit log.
 */

const { CUT_FIELDS, NEW_FIELDS, FORM_RULES } = require('../../catalogs/caseFormCutList');

const COLUMNS = [
  ['case_pc_general', 'reply_date', 'DATE NULL'],
  ['case_pc_general', 'reply_summary', 'TEXT NULL'],
  ['case_pc_general', 'suspected_counterfeit', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['case_pc_general', 'device_involved', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['case_pc_general', 'device_malfunction', 'VARCHAR(10) NULL'],
  ['case_pc_product_info', 'strength', 'VARCHAR(100) NULL AFTER product_name'],
  ['case_pc_patient_info', 'patient_initials', 'VARCHAR(20) NULL AFTER version_id'],
];
const PC_NEW = NEW_FIELDS.filter(f => f.section.startsWith('PC —'));
const PC_DECIDED = CUT_FIELDS.filter(f => f.decided && f.section.startsWith('PC —'));
const PC_RULES = FORM_RULES.filter(r => r.case_type === 'PC');
const FAR = 'Field Alert Report (3 working days)';

async function up(conn) {
  for (const [table, column, definition] of COLUMNS) {
    const [[exists]] = await conn.execute(
      'SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, column]
    );
    if (!exists.n) await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  const [orgs] = await conn.execute('SELECT id FROM organisations');
  for (const f of PC_NEW) {
    for (const orgId of [null, ...orgs.map(o => o.id)]) {
      const [[have]] = await conn.execute(
        'SELECT id FROM field_setup WHERE section_name = ? AND field_name = ? AND org_id <=> ? LIMIT 1',
        [f.section, f.field, orgId]
      );
      if (have) continue;
      await conn.execute(
        `INSERT INTO field_setup (section_name, field_name, field_type, is_required, is_hidden, is_disabled,
                                  picklist_type, sort_order, org_id, case_type_scope, core_key)
         VALUES (?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?)`,
        [f.section, f.field, f.type, f.picklist || null, f.sortOrder, orgId, f.scope, f.coreKey]
      );
    }
  }

  for (const f of PC_DECIDED) {
    await conn.execute(
      `UPDATE field_setup SET is_hidden = 1, is_required = 0
        WHERE section_name = ? AND LOWER(TRIM(field_name)) = LOWER(?)`,
      [f.section, f.field]
    );
  }

  for (const org of orgs) {
    for (const r of PC_RULES) {
      const [[have]] = await conn.execute(
        'SELECT id FROM case_form_rules WHERE org_id = ? AND section_name = ? AND field_name = ? AND rule_type = ? LIMIT 1',
        [org.id, r.section_name, r.field_name, r.rule_type]
      );
      if (have) continue;
      await conn.execute(
        `INSERT INTO case_form_rules (org_id, case_type, section_name, field_name, rule_type, condition_json, action_json, is_active, priority)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
        [org.id, r.case_type, r.section_name, r.field_name, r.rule_type, JSON.stringify(r.condition_json), JSON.stringify(r.action_json)]
      );
    }

    const [[list]] = await conn.execute(
      `SELECT field_id, category FROM picklists WHERE org_id = ? AND field_type = 'reportability_determination' LIMIT 1`, [org.id]);
    if (list) {
      const [[have]] = await conn.execute(
        `SELECT id FROM picklists WHERE org_id = ? AND field_type = 'reportability_determination' AND value = ? LIMIT 1`, [org.id, FAR]);
      if (!have) {
        await conn.execute(
          `INSERT INTO picklists (name, category, field_type, field_id, value, status, org_id, sort_order)
           VALUES (?, ?, 'reportability_determination', ?, ?, 'Active', ?, -1)`,
          [FAR, list.category, list.field_id, FAR, org.id]
        );
      }
    }

    await conn.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
       VALUES (NULL, 'Migration 177', 'CASE_FORM_CUT', 'case_form_cleanup', ?, ?)`,
      [org.id, JSON.stringify({ hidden: PC_DECIDED.map(f => `${f.section} / ${f.field}`), added: PC_NEW.map(f => `${f.section} / ${f.field}`) })]
    ).catch(() => {});
  }
}

module.exports = { up };
