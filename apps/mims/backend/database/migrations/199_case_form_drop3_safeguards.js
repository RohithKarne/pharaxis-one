'use strict';

/**
 * Migration 199 — Case Form Upgrade Drop 3: Regulatory Safeguards & Quality-Safety Fusion (Rohith, 2026-11-16)
 * - CF-06: Off-Label Solicited Gating (21 CFR 312.7 / FDA Draft Guidance)
 *   - commercial_clearance_status: 'not_required' | 'pending' | 'cleared' | 'rejected'
 *   - commercial_clearance_by: User ID of Medical Affairs Director who granted clearance
 *   - commercial_clearance_at: Timestamp of clearance
 *   - commercial_clearance_notes: Clinical rationale / review notes
 * - CF-07: Patient-Harm Quality Complaints & 3-Day FAR Linkage (21 CFR 211.198 / 21 CFR 314.81)
 *   - is_patient_harm: Flag indicating potential or actual patient injury/harm from defect
 *   - is_far_reportable: Flag indicating 3-day FDA Field Alert Report requirement
 *   - far_due_date: Calculated 3-working-day FDA notification deadline
 *   - far_status: 'not_required' | 'pending' | 'submitted' | 'exempt'
 *   - far_submission_date: Timestamp of FAR filing
 *   - far_notes: QA / Regulatory notes on FAR evaluation
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
  // CF-06: Commercial Solicited Off-Label Clearance on case_mi
  await addColumn(conn, 'case_mi', 'commercial_clearance_status', "ENUM('not_required', 'pending', 'cleared', 'rejected') NOT NULL DEFAULT 'not_required'");
  await addColumn(conn, 'case_mi', 'commercial_clearance_by', 'INT NULL DEFAULT NULL');
  await addColumn(conn, 'case_mi', 'commercial_clearance_at', 'DATETIME NULL DEFAULT NULL');
  await addColumn(conn, 'case_mi', 'commercial_clearance_notes', 'TEXT NULL DEFAULT NULL');

  // CF-07: Patient Harm & 3-Day FAR Tracking on case_pc_general
  await addColumn(conn, 'case_pc_general', 'is_patient_harm', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn(conn, 'case_pc_general', 'is_far_reportable', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn(conn, 'case_pc_general', 'far_due_date', 'DATETIME NULL DEFAULT NULL');
  await addColumn(conn, 'case_pc_general', 'far_status', "ENUM('not_required', 'pending', 'submitted', 'exempt') NOT NULL DEFAULT 'not_required'");
  await addColumn(conn, 'case_pc_general', 'far_submission_date', 'DATETIME NULL DEFAULT NULL');
  await addColumn(conn, 'case_pc_general', 'far_notes', 'TEXT NULL DEFAULT NULL');
}

async function down(_conn) {}

module.exports = { up, down };
