#!/usr/bin/env node
/**
 * field-usage-count.js — Day 0 of the case form clean-up (Rohith, 2026-10-13).
 *
 * Read-only. For every field in the case form configuration, prints how many
 * cases hold a value, so each "hide" in the clean-up is decided with the count
 * in front of us. Nothing is changed.
 *
 *   cd apps/mims/backend
 *   node scripts/field-usage-count.js            # every organisation
 *   node scripts/field-usage-count.js --org 1    # one organisation
 *   node scripts/field-usage-count.js --csv > counts.csv
 *
 * Where a value lives:
 *   - a configured field (no core key): case_dynamic_field_values
 *   - a platform field: the real column behind it, by its core key
 *   - a contact field: the matching column on case_contacts
 *   - an AE or PC panel field with its own column: that column, any version
 *   - anything else: "not stored" — the screen never had a place to keep it
 */

'use strict';

const path = require('path');
try { process.loadEnvFile(); } catch (_) { try { process.loadEnvFile(path.join(__dirname, '..', '..', '.env')); } catch (_) {} }
const pool = require('../database/db');

const args = process.argv.slice(2);
const orgArg = args.includes('--org') ? Number(args[args.indexOf('--org') + 1]) : null;
const CSV = args.includes('--csv');

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
// Panel fields without a core key that still have a real column.
const SECTION_TABLES = {
  'AE — General': ['case_ae_general', 'ae'], 'AE — Events & Seriousness': ['case_ae_events', 'ae'], 'AE — Patient Information': ['case_ae_patient_info', 'ae'],
  'AE — Product Information': ['case_ae_product_info', 'ae'], 'PC — General': ['case_pc_general', 'pc'], 'PC — Product Information': ['case_pc_product_info', 'pc'], 'MI — Response': ['case_mi', null],
};
const EXTRA_COLUMNS = {
  'AE — General': { 'Date of Report': 'date_of_report', 'Reporter Awareness Date': 'reporter_awareness_date' },
  'AE — Events & Seriousness': { 'MedDRA Term': 'meddra_term', 'Reported Causality': 'reported_causality', 'Frequency': 'frequency', 'Causality Assessment': 'causality_assessment', 'Seriousness': 'seriousness', 'End Date': 'end_date' },
  'AE — Patient Information': { 'Race / Ethnicity': 'ethnicity', 'Last Menstrual Period': 'last_menstrual_date' },
  'AE — Product Information': { 'Product Type': 'product_type', 'Product Category': 'product_category', 'Administration Route': 'route_of_admin', 'Is Suspect': 'is_suspect', 'Is Concomitant': 'is_concomitant', 'Dechallenge': 'dechallenge', 'Rechallenge': 'rechallenge' },
  'PC — General': { 'PC Classification': 'pc_classification', 'Severity': 'severity', 'Root Cause': 'root_cause', 'Date Received': 'date_received' },
  'PC — Product Information': { 'Product Type': 'product_type', 'Product Category': 'product_category', 'Storage Conditions': 'storage_conditions', 'Quantity Available for Investigation': 'quantity_available' },
  'MI — Response': { 'MI Status': 'status', 'Literature Reference': 'literature_reference' },
};
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

async function columnExists(table, column) {
  const [[r]] = await pool.execute('SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, column]);
  return r.n > 0;
}

// Cases of this organisation with a non-empty value in table.column. null when the column does not exist.
async function countColumn(table, column, orgId, versionType) {
  if (!(await columnExists(table, column))) return null;
  const notEmpty = `t.\`${column}\` IS NOT NULL AND t.\`${column}\` <> '' AND t.\`${column}\` <> '0'`;
  let sql;
  if (table === 'cases') sql = `SELECT COUNT(*) AS n FROM cases t WHERE t.is_deleted = 0 AND t.org_id = ? AND ${notEmpty}`;
  else if (versionType) sql = `SELECT COUNT(DISTINCT v.case_id) AS n FROM ${table} t JOIN ${versionType === 'ae' ? 'case_ae_versions' : 'case_pc_versions'} v ON v.id = t.version_id JOIN cases c ON c.id = v.case_id WHERE c.is_deleted = 0 AND c.org_id = ? AND ${notEmpty}`;
  else sql = `SELECT COUNT(DISTINCT t.case_id) AS n FROM ${table} t JOIN cases c ON c.id = t.case_id WHERE c.is_deleted = 0 AND c.org_id = ? AND ${notEmpty}`;
  const [[r]] = await pool.execute(sql, [orgId]);
  return r.n;
}

async function main() {
  const [orgs] = await pool.execute(orgArg ? 'SELECT id, name FROM organisations WHERE id = ?' : 'SELECT id, name FROM organisations WHERE is_active = 1 ORDER BY id', orgArg ? [orgArg] : []);
  const rows = [];
  for (const org of orgs) {
    const [fields] = await pool.execute(
      `SELECT id, section_name, field_name, core_key, is_hidden FROM field_setup WHERE org_id = ? AND section_name <> '__customize_placeholder__' ORDER BY section_name, sort_order, id`, [org.id]);
    for (const f of fields) {
      let source = 'not stored', n = null;
      const [[dyn]] = await pool.execute(
        `SELECT COUNT(DISTINCT v.case_id) AS n FROM case_dynamic_field_values v JOIN cases c ON c.id = v.case_id WHERE v.field_id = ? AND c.is_deleted = 0 AND c.org_id = ? AND v.field_value IS NOT NULL AND v.field_value <> ''`, [f.id, org.id]);
      if (!f.core_key) { source = 'configured values'; n = dyn.n; }
      if (f.core_key && CASE_COLUMNS[f.core_key]) { source = `cases.${CASE_COLUMNS[f.core_key]}`; n = await countColumn('cases', CASE_COLUMNS[f.core_key], org.id, null); }
      else if (f.core_key) {
        for (const [prefix, table, vt] of CORE_TABLES) {
          if (!f.core_key.startsWith(prefix)) continue;
          const col = CORE_OVERRIDES[f.core_key] || f.core_key.slice(prefix.length); const c = await countColumn(table, col, org.id, vt);
          if (c !== null) { source = `${table}.${col}`; n = c; }
          break;
        }
      } else if (f.section_name === 'Contact / Requestor') {
        const col = snake(f.field_name); const c = await countColumn('case_contacts', col, org.id, null);
        if (c !== null) { source = `case_contacts.${col}`; n = c; }
      } else if (EXTRA_COLUMNS[f.section_name]?.[f.field_name]) {
        const [table, vt] = SECTION_TABLES[f.section_name]; const col = EXTRA_COLUMNS[f.section_name][f.field_name];
        const c = await countColumn(table, col, org.id, vt);
        if (c !== null) { source = `${table}.${col}`; n = c; }
      }
      rows.push({ org: org.name, section: f.section_name, field: f.field_name, hidden: f.is_hidden ? 'hidden' : '', source, cases: n === null ? '' : n });
    }
  }
  if (CSV) {
    console.log('organisation,section,field,hidden,where the value lives,cases with a value');
    for (const r of rows) console.log([r.org, r.section, r.field, r.hidden, r.source, r.cases].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    return;
  }
  let lastOrg = '', lastSection = '';
  for (const r of rows) {
    if (r.org !== lastOrg) { console.log(`\n=== ${r.org}`); lastOrg = r.org; lastSection = ''; }
    if (r.section !== lastSection) { console.log(`  ${r.section}`); lastSection = r.section; }
    console.log(`    ${String(r.cases).padStart(6)}  ${r.field}${r.hidden ? ' (hidden)' : ''}  [${r.source}]`);
  }
  console.log(`\n${rows.length} fields. "configured values" is the extension store; "not stored" means the screen never had a place to keep it.`);
}

main().catch(err => { console.error('field-usage-count failed:', err.message); process.exitCode = 1; }).finally(() => pool.end && pool.end());
