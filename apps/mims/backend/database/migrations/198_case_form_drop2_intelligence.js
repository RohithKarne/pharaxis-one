'use strict';

/**
 * Migration 198 — Case Form Upgrade Drop 2: Clinical Intake Intelligence (Rohith, 2026-11-16)
 * - CF-05: AI / Clinical Safety Term Interception on Medical Information Form
 *   - screening_override_rationale: Required explanation when potential AE/PC trigger terms are detected but screening is marked 'no'
 *   - safety_triggers_detected: Captured clinical keywords (e.g. 'rash, dyspnea')
 */

async function addColumn(conn, table, column, definition) {
  try {
    const [cols] = await conn.execute(`SHOW COLUMNS FROM ${table} LIKE '${column}'`);
    if (!cols.length) {
      await conn.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  } catch (err) {
    if (!err.message.includes('Duplicate column name')) throw err;
  }
}

async function up(conn) {
  await addColumn(conn, 'case_mi', 'screening_override_rationale', 'TEXT NULL DEFAULT NULL');
  await addColumn(conn, 'case_mi', 'safety_triggers_detected', 'VARCHAR(255) NULL DEFAULT NULL');
}

async function down(_conn) {}

module.exports = { up, down };
