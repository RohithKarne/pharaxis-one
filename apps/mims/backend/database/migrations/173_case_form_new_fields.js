'use strict';

/**
 * Migration 173 — the fields the case form clean-up adds or moves
 * (case form clean-up PR 3, Rohith 2026-10-13).
 *
 * WHY
 * Saad's cut list removes facts stored once per case when a case can have
 * several events and products, and adds the one regulatory date MIMS lacked.
 *   - cases.latest_information_date: the date of the most recent information
 *     (ICH E2B(R3) C.1.5). Date Received stays Day 0.
 *   - case_ae_events: verbatim reaction and hospitalisation start / end, per
 *     event; the once-per-case copies are hidden by migration 174.
 *   - case_ae_product_info.product_role: suspect, concomitant or interacting,
 *     in place of the two ticks.
 *   - case_ae_patient_info.pregnancy_trimester, shown only when Pregnant is Yes.
 *
 * WHAT
 * 1. The five columns, where missing.
 * 2. A field_setup row for Latest Information Date and for Role, for the
 *    platform defaults and every organisation, where missing.
 * 3. core_key on the moved rows from catalogs/panelCoreFields.js, where empty.
 * 4. The MI rule: Follow-up Due Date shows only when Follow-up Required is ticked.
 * Nothing is deleted.
 */

const { PANEL_CORE_FIELDS } = require('../../catalogs/panelCoreFields');
const { NEW_FIELDS, FOLLOW_UP_RULE } = require('../../catalogs/caseFormCutList');

const COLUMNS = [
  ['cases', 'latest_information_date', 'DATE NULL AFTER awareness_date'],
  ['case_ae_events', 'verbatim_reaction', 'TEXT NULL AFTER event_description'],
  ['case_ae_events', 'hospitalization_start_date', 'DATE NULL'],
  ['case_ae_events', 'hospitalization_end_date', 'DATE NULL'],
  ['case_ae_product_info', 'product_role', 'VARCHAR(20) NULL AFTER is_concomitant'],
  ['case_ae_patient_info', 'pregnancy_trimester', 'VARCHAR(40) NULL AFTER pregnant'],
];

async function up(conn) {
  for (const [table, column, definition] of COLUMNS) {
    const [[exists]] = await conn.execute(
      'SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, column]
    );
    if (!exists.n) await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  const [orgs] = await conn.execute('SELECT id FROM organisations');
  const owners = [null, ...orgs.map(o => o.id)];
  for (const f of NEW_FIELDS) {
    for (const orgId of owners) {
      const [[have]] = await conn.execute(
        'SELECT id FROM field_setup WHERE section_name = ? AND field_name = ? AND org_id <=> ? LIMIT 1',
        [f.section, f.field, orgId]
      );
      if (have) continue;
      await conn.execute(
        `INSERT INTO field_setup (section_name, field_name, field_type, is_required, is_hidden, is_disabled,
                                  sort_order, org_id, case_type_scope, core_key)
         VALUES (?, ?, ?, 0, 0, 0, ?, ?, ?, ?)`,
        [f.section, f.field, f.type, f.sortOrder, orgId, f.scope, f.coreKey]
      );
    }
  }

  for (const f of PANEL_CORE_FIELDS) {
    await conn.execute(
      `UPDATE field_setup SET core_key = ?
        WHERE section_name = ? AND LOWER(TRIM(field_name)) = LOWER(?)
          AND (core_key IS NULL OR core_key = '')`,
      [f.coreKey, f.section, f.field]
    );
  }

  const r = FOLLOW_UP_RULE;
  for (const org of orgs) {
    const [[have]] = await conn.execute(
      'SELECT id FROM case_form_rules WHERE org_id = ? AND field_name = ? AND rule_type = ? LIMIT 1',
      [org.id, r.field_name, r.rule_type]
    );
    if (have) continue;
    await conn.execute(
      `INSERT INTO case_form_rules (org_id, case_type, section_name, field_name, rule_type, condition_json, action_json, is_active, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [org.id, r.case_type, r.section_name, r.field_name, r.rule_type, JSON.stringify(r.condition_json), JSON.stringify(r.action_json)]
    );
  }
}

module.exports = { up };
