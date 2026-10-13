'use strict';

/**
 * fieldUsageService.js — how many cases hold a value for each case-form field.
 *
 * Day 0 of the case form clean-up (Rohith, 2026-10-13). Read-only. Every
 * "hide" in the clean-up is decided with this count in front of us, so the
 * count lives in the app (Case Form Fields screen) and is not a script
 * someone has to run. The script `scripts/field-usage-count.js` calls this
 * same function for the console view.
 *
 * Where a value lives:
 *   - a configured field (no core key): case_dynamic_field_values
 *   - a platform field: the real column behind it, by its core key
 *   - a contact field: the matching column on case_contacts
 *   - anything else: "not stored" — the screen never had a place to keep it
 *
 * A configured field (no core key) is counted in its own store only. A flat
 * copy such as AE "Is Suspect" writes there, not to the product row's column,
 * so the column's count says nothing about whether hiding the copy loses data.
 */

const pool = require('../database/db');
const { PANEL_CORE_FIELDS } = require('../catalogs/panelCoreFields');

// The column behind a panel field, from the catalog the panels and save routes
// use. Namespaced notes keys ("lab-notes__notes", "notes_refund") live in "notes".
const CATALOG_COLUMN = Object.fromEntries(PANEL_CORE_FIELDS.map(f => [
  f.coreKey, /__notes$|^notes_/.test(f.key) ? 'notes' : f.key,
]));

const snake = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

// core_key prefix → [table, version type]. Version tables are joined to their case through the version row.
const CORE_TABLES = [
  ['ae_general_', 'case_ae_general', 'ae'], ['ae_events_', 'case_ae_events', 'ae'], ['ae_patient_info_', 'case_ae_patient_info', 'ae'],
  ['ae_product_info_', 'case_ae_product_info', 'ae'], ['ae_lab_results_', 'case_ae_lab_results', 'ae'], ['ae_lab_notes_', 'case_ae_lab_notes', 'ae'],
  ['ae_medical_history_', 'case_ae_medical_history', 'ae'], ['ae_medical_notes_', 'case_ae_medical_notes', 'ae'],
  ['pc_general_', 'case_pc_general', 'pc'], ['pc_patient_info_', 'case_pc_patient_info', 'pc'], ['pc_product_info_', 'case_pc_product_info', 'pc'],
  ['pc_return_retrieval_', 'case_pc_return_retrieval', 'pc'], ['pc_replacement_', 'case_pc_replacement', 'pc'], ['pc_refund_credit_', 'case_pc_refund_credit', 'pc'],
  ['mi_', 'case_mi', null],
];
// Core keys whose column has a different name.
const CORE_OVERRIDES = {
  ae_events_onset_date: 'start_date', ae_events_serious_death: 'is_death', ae_events_serious_life_threatening: 'is_life_threatening',
  ae_events_serious_hospitalisation: 'is_hospitalization', ae_events_serious_disability: 'is_disability',
  ae_events_serious_congenital_anomaly: 'is_congenital_anomaly', ae_events_serious_other_medically_important: 'is_other_medically_important',
  ae_product_info_stop_date: 'end_date', ae_patient_info_gender: 'sex', pc_patient_info_gender: 'sex', pc_product_info_batch_lot_number: 'lot_number',
  mi_category: 'mi_category', mi_subcategory: 'subcategory', mi_product: 'product_id', mi_question_summary: 'question_summary', mi_detailed_question: 'detailed_question',
  ae_lab_notes_lab_notes: 'notes', ae_medical_notes_medical_notes: 'notes', ae_medical_history_medical_history: 'condition_name', ae_medical_history_relevant_history: 'notes', ae_lab_results_result_value: 'result',
};
const CASE_COLUMNS = { case_number: 'case_number', date_received: 'date_received', date_of_intake: 'date_of_intake', case_type: 'case_type', status_id: 'status_id', case_owner_id: 'case_owner_id', org_id: 'org_id', intake_channel: 'intake_channel', priority: 'priority', description: 'description', internal_notes: 'internal_notes' };

async function columnExists(table, column, cache) {
  const key = `${table}.${column}`;
  if (cache.has(key)) return cache.get(key);
  const [[r]] = await pool.execute('SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, column]);
  cache.set(key, r.n > 0);
  return r.n > 0;
}

// Cases of this organisation with a non-empty value in table.column. null when the column does not exist.
async function countColumn(table, column, orgId, versionType, cache) {
  if (!(await columnExists(table, column, cache))) return null;
  const notEmpty = `t.\`${column}\` IS NOT NULL AND t.\`${column}\` <> '' AND t.\`${column}\` <> '0'`;
  let sql;
  if (table === 'cases') sql = `SELECT COUNT(*) AS n FROM cases t WHERE t.is_deleted = 0 AND t.org_id = ? AND ${notEmpty}`;
  else if (versionType) sql = `SELECT COUNT(DISTINCT v.case_id) AS n FROM ${table} t JOIN ${versionType === 'ae' ? 'case_ae_versions' : 'case_pc_versions'} v ON v.id = t.version_id JOIN cases c ON c.id = v.case_id WHERE c.is_deleted = 0 AND c.org_id = ? AND ${notEmpty}`;
  else sql = `SELECT COUNT(DISTINCT t.case_id) AS n FROM ${table} t JOIN cases c ON c.id = t.case_id WHERE c.is_deleted = 0 AND c.org_id = ? AND ${notEmpty}`;
  const [[r]] = await pool.execute(sql, [orgId]);
  return r.n;
}

/**
 * The organisation's resolved field list: its own row wins over the platform
 * default, the same way the case form and the Case Form Fields screen resolve it.
 */
async function resolvedFields(orgId) {
  const [rows] = await pool.execute(
    `SELECT id, org_id, section_name, field_name, core_key, is_hidden, sort_order
       FROM field_setup
      WHERE (org_id = ? OR org_id IS NULL) AND section_name <> '__customize_placeholder__'
      ORDER BY section_name, sort_order, id`, [orgId]);
  const byKey = new Map();
  for (const row of rows) {
    const key = `${row.section_name}::${String(row.field_name).trim().toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing || (existing.org_id === null && row.org_id !== null)) byKey.set(key, row);
  }
  return [...byKey.values()];
}

/**
 * For each field ({ id, section_name, field_name, core_key }) of one organisation:
 * { source, cases } — where the value lives and how many of the organisation's
 * cases hold one. cases is null when the screen never had a place to keep it.
 */
async function usageForFields(orgId, fields) {
  const cache = new Map();
  const out = {};
  for (const f of fields) {
    let source = 'not stored', n = null;
    if (!f.core_key) {
      const [[dyn]] = await pool.execute(
        `SELECT COUNT(DISTINCT v.case_id) AS n FROM case_dynamic_field_values v JOIN cases c ON c.id = v.case_id WHERE v.field_id = ? AND c.is_deleted = 0 AND c.org_id = ? AND v.field_value IS NOT NULL AND v.field_value <> ''`, [f.id, orgId]);
      source = 'configured values'; n = dyn.n;
    }
    if (f.core_key && CASE_COLUMNS[f.core_key]) { source = `cases.${CASE_COLUMNS[f.core_key]}`; n = await countColumn('cases', CASE_COLUMNS[f.core_key], orgId, null, cache); }
    else if (f.core_key) {
      for (const [prefix, table, vt] of CORE_TABLES) {
        if (!f.core_key.startsWith(prefix)) continue;
        const col = CORE_OVERRIDES[f.core_key] || CATALOG_COLUMN[f.core_key] || f.core_key.slice(prefix.length); const c = await countColumn(table, col, orgId, vt, cache);
        if (c !== null) { source = `${table}.${col}`; n = c; }
        break;
      }
    } else if (f.section_name === 'Contact / Requestor') {
      const col = snake(f.field_name); const c = await countColumn('case_contacts', col, orgId, null, cache);
      if (c !== null) { source = `case_contacts.${col}`; n = c; }
    }
    out[f.id] = { source, cases: n };
  }
  return out;
}

module.exports = { resolvedFields, usageForFields };
