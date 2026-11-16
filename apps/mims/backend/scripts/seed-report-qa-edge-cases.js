'use strict';

/**
 * seed-report-qa-edge-cases.js
 *
 * Seeds realistic, clean test cases in Calder Therapeutics (org_id = 1)
 * specifically covering scenarios needed for comprehensive QA verification
 * of all 20 MIMS library reports (November 2026 date window).
 */

const pool = require('../database/db');

async function seedReportQaEdgeCases() {
  console.log('Seeding MIMS Report QA edge cases in org_id = 1...');

  // 1. Clean up previous QA-REP cases if any
  const [existingCases] = await pool.query(
    "SELECT id FROM cases WHERE org_id = 1 AND case_number LIKE 'QA-REP-%'"
  );
  const caseIds = existingCases.map((c) => c.id);
  if (caseIds.length > 0) {
    console.log(`Cleaning up ${caseIds.length} existing QA-REP cases...`);
    await pool.query('DELETE FROM case_audit_trail WHERE case_id IN (?)', [caseIds]);
    await pool.query('DELETE FROM cm_content_usage WHERE case_id IN (?)', [caseIds]);
    await pool.query('DELETE FROM transmission_audit_trail WHERE case_id IN (?)', [caseIds]);
    await pool.query('DELETE FROM case_ae_transmissions WHERE case_id IN (?)', [caseIds]);
    await pool.query('DELETE FROM case_pc_transmissions WHERE case_id IN (?)', [caseIds]);
    await pool.query('DELETE FROM icsr_reports WHERE case_id IN (?)', [caseIds]);
    await pool.query('DELETE FROM case_mi_responses WHERE case_id IN (?)', [caseIds]);
    await pool.query('DELETE FROM case_mi WHERE case_id IN (?)', [caseIds]);
    await pool.query('DELETE FROM cases WHERE id IN (?)', [caseIds]);
  }

  // 2. Insert cases
  // Helper to insert a case
  async function insertCase({ caseNumber, caseType, dateReceived, priority = 'normal', statusId = 59, ownerId = 339, intakeChannel = 'portal', duplicateOf = null }) {
    const [res] = await pool.execute(
      `INSERT INTO cases (
        case_number, case_type, org_id, site_id, status_id, case_owner_id, intake_channel,
        priority, date_received, awareness_date, created_at, updated_at, description,
        possible_duplicate_of, is_deleted
      ) VALUES (?, ?, 1, 1, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?, ?, 0)`,
      [
        caseNumber, caseType, statusId, ownerId, intakeChannel,
        priority, dateReceived, dateReceived, `QA Report Verification Case ${caseNumber}`,
        duplicateOf,
      ]
    );
    return res.insertId;
  }

  // QA-REP-012: PC Case Closed
  const id012 = await insertCase({
    caseNumber: 'QA-REP-012',
    caseType: 'PC',
    dateReceived: '2026-11-13',
    priority: 'normal',
    statusId: 63, // Closed
    ownerId: 342,
  });
  // Add closure audit trail
  await pool.execute(
    `INSERT INTO case_audit_trail (case_id, user_id, user_name, action_type, field_name, old_value, new_value, timestamp)
     VALUES (?, 342, 'Rohan Kulkarni', 'STATUS_CHANGED', 'status_id', '59', '63', '2026-11-15 14:00:00')`,
    [id012]
  );

  // QA-REP-013: PC Case Duplicate of QA-REP-012
  await insertCase({
    caseNumber: 'QA-REP-013',
    caseType: 'PC',
    dateReceived: '2026-11-14',
    priority: 'normal',
    statusId: 59,
    ownerId: 342,
    duplicateOf: id012,
  });

  // QA-REP-001: MI On Time with Content Usage
  const id001 = await insertCase({
    caseNumber: 'QA-REP-001',
    caseType: 'MI',
    dateReceived: '2026-11-10',
    priority: 'normal',
    statusId: 61,
    ownerId: 339,
  });
  const [miRes001] = await pool.execute(
    `INSERT INTO case_mi (
      case_id, tab_index, mi_category, product_id, question_summary, detailed_question,
      response_required_by, status, is_off_label, is_solicited, ae_pc_screening
    ) VALUES (?, 1, 'Dosage and Administration', 92, 'Recommended titration dosage for Entresto', 'Detailed enquiry', '2026-11-17', 'Answered', 0, 0, 'no')`,
    [id001]
  );
  const miTabId001 = miRes001.insertId;
  const [respRes001] = await pool.execute(
    `INSERT INTO case_mi_responses (
      case_id, mi_tab_id, response_status, response_subject, sent_at, created_at, author_id, author_name
    ) VALUES (?, ?, 'SENT', 'Response to Entresto Titration', '2026-11-12 10:00:00', '2026-11-11 09:00:00', 339, 'Kunal Mehta')`,
    [id001, miTabId001]
  );
  // Log content usage for document 72 (DOC-00072 'Protocole')
  await pool.execute(
    `INSERT INTO cm_content_usage (content_type, content_id, case_id, response_id, used_by, used_at)
     VALUES ('document', 72, ?, ?, 339, '2026-11-12 10:00:00')`,
    [id001, respRes001.insertId]
  );

  // QA-REP-002: MI Answered Late
  const id002 = await insertCase({
    caseNumber: 'QA-REP-002',
    caseType: 'MI',
    dateReceived: '2026-11-05',
    priority: 'normal',
    statusId: 61,
    ownerId: 340,
  });
  const [miRes002] = await pool.execute(
    `INSERT INTO case_mi (
      case_id, tab_index, mi_category, product_id, question_summary, detailed_question,
      response_required_by, status, is_off_label, is_solicited, ae_pc_screening
    ) VALUES (?, 1, 'Drug Interactions', 94, 'Kisqali co-administration with CYP3A inhibitors', 'Detailed enquiry', '2026-11-12', 'Answered', 0, 0, 'no')`,
    [id002]
  );
  await pool.execute(
    `INSERT INTO case_mi_responses (
      case_id, mi_tab_id, response_status, response_subject, sent_at, created_at, author_id, author_name
    ) VALUES (?, ?, 'SENT', 'Response to Kisqali Drug Interactions', '2026-11-15 14:00:00', '2026-11-14 11:00:00', 340, 'Neha Rao')`,
    [id002, miRes002.insertId]
  );

  // QA-REP-003: MI Overdue (no letter sent)
  const id003 = await insertCase({
    caseNumber: 'QA-REP-003',
    caseType: 'MI',
    dateReceived: '2026-11-03',
    priority: 'normal',
    statusId: 59,
    ownerId: 339,
  });
  await pool.execute(
    `INSERT INTO case_mi (
      case_id, tab_index, mi_category, product_id, question_summary, detailed_question,
      response_required_by, status, is_off_label, is_solicited, ae_pc_screening
    ) VALUES (?, 1, 'Adverse Reactions', 95, 'Cosentyx injection site reactions incidence', 'Detailed enquiry', '2026-11-10', 'Open', 0, 0, 'no')`,
    [id003]
  );

  // QA-REP-004: MI Open, Not Yet Due
  const id004 = await insertCase({
    caseNumber: 'QA-REP-004',
    caseType: 'MI',
    dateReceived: '2026-11-15',
    priority: 'urgent',
    statusId: 59,
    ownerId: 340,
  });
  await pool.execute(
    `INSERT INTO case_mi (
      case_id, tab_index, mi_category, product_id, question_summary, detailed_question,
      response_required_by, status, is_off_label, is_solicited, ae_pc_screening
    ) VALUES (?, 1, 'Other', 93, 'Entresto 49/51 mg storage conditions', 'Detailed enquiry', '2026-11-18', 'Open', 0, 0, 'no')`,
    [id004]
  );

  // QA-REP-005: MI Off-label enquiry
  const id005 = await insertCase({
    caseNumber: 'QA-REP-005',
    caseType: 'MI',
    dateReceived: '2026-11-12',
    priority: 'normal',
    statusId: 61,
    ownerId: 339,
  });
  await pool.execute(
    `INSERT INTO case_mi (
      case_id, tab_index, mi_category, product_id, question_summary, detailed_question,
      response_required_by, status, is_off_label, is_solicited, off_label_indication, promo_review_status, ae_pc_screening
    ) VALUES (?, 1, 'Dosage and Administration', 92, 'Pediatric off-label dosing', 'Detailed enquiry', '2026-11-19', 'In Review', 1, 0, 'Pediatric heart failure under age 12', 'pending', 'no')`,
    [id005]
  );

  // QA-REP-006: MI Safety Check 1 (Mentions AE, no linked AE case)
  const id006 = await insertCase({
    caseNumber: 'QA-REP-006',
    caseType: 'MI',
    dateReceived: '2026-11-14',
    priority: 'normal',
    statusId: 59,
    ownerId: 340,
  });
  await pool.execute(
    `INSERT INTO case_mi (
      case_id, tab_index, mi_category, product_id, question_summary, detailed_question,
      response_required_by, status, is_off_label, is_solicited, ae_pc_screening
    ) VALUES (?, 1, 'Adverse Reactions', 94, 'Patient experienced dizziness and rash', 'Detailed enquiry', '2026-11-21', 'Open', 0, 0, 'yes')`,
    [id006]
  );

  // QA-REP-007: MI Safety Check 2 (Letter sent with screening unanswered)
  const id007 = await insertCase({
    caseNumber: 'QA-REP-007',
    caseType: 'MI',
    dateReceived: '2026-11-08',
    priority: 'normal',
    statusId: 61,
    ownerId: 339,
  });
  const [miRes007] = await pool.execute(
    `INSERT INTO case_mi (
      case_id, tab_index, mi_category, product_id, question_summary, detailed_question,
      response_required_by, status, is_off_label, is_solicited, ae_pc_screening
    ) VALUES (?, 1, 'Dosage and Administration', 95, 'General posology query', 'Detailed enquiry', '2026-11-15', 'Answered', 0, 0, NULL)`,
    [id007]
  );
  await pool.execute(
    `INSERT INTO case_mi_responses (
      case_id, mi_tab_id, response_status, response_subject, sent_at, created_at, author_id, author_name
    ) VALUES (?, ?, 'SENT', 'Response to Cosentyx Enquiry', '2026-11-11 11:00:00', '2026-11-10 10:00:00', 339, 'Kunal Mehta')`,
    [id007, miRes007.insertId]
  );

  // QA-REP-008: AE Handoff On Time
  const id008 = await insertCase({
    caseNumber: 'QA-REP-008',
    caseType: 'AE',
    dateReceived: '2026-11-11',
    priority: 'urgent',
    statusId: 61,
    ownerId: 341,
  });
  await pool.execute(
    `INSERT INTO case_ae_transmissions (case_id, assigned_to, assigned_name, priority, due_date, status, sla_status, created_at, updated_at)
     VALUES (?, 341, 'Priya Iyer', '7-day', '2026-11-12', 'Accepted', 'met', NOW(), NOW())`,
    [id008]
  );
  await pool.execute(
    `INSERT INTO transmission_audit_trail (case_id, user_id, user_name, target_system, status, timestamp)
     VALUES (?, 341, 'Priya Iyer', 'Safety Argus', 'SENT', '2026-11-12 09:00:00')`,
    [id008]
  );

  // QA-REP-009: AE Handoff Late
  const id009 = await insertCase({
    caseNumber: 'QA-REP-009',
    caseType: 'AE',
    dateReceived: '2026-11-06',
    priority: 'normal',
    statusId: 61,
    ownerId: 341,
  });
  await pool.execute(
    `INSERT INTO case_ae_transmissions (case_id, assigned_to, assigned_name, priority, due_date, status, sla_status, created_at, updated_at)
     VALUES (?, 341, 'Priya Iyer', '15-day', '2026-11-09', 'Accepted', 'breached', NOW(), NOW())`,
    [id009]
  );
  await pool.execute(
    `INSERT INTO transmission_audit_trail (case_id, user_id, user_name, target_system, status, timestamp)
     VALUES (?, 341, 'Priya Iyer', 'Safety Argus', 'SENT', '2026-11-13 10:00:00')`,
    [id009]
  );

  // QA-REP-010: AE Handoff Overdue (not sent)
  const id010 = await insertCase({
    caseNumber: 'QA-REP-010',
    caseType: 'AE',
    dateReceived: '2026-11-04',
    priority: 'normal',
    statusId: 61,
    ownerId: 341,
  });
  await pool.execute(
    `INSERT INTO case_ae_transmissions (case_id, assigned_to, assigned_name, priority, due_date, status, sla_status, escalation_level, created_at, updated_at)
     VALUES (?, 341, 'Priya Iyer', '15-day', '2026-11-06', 'In Review', 'breached', 1, NOW(), NOW())`,
    [id010]
  );

  // QA-REP-011: ICSR Submissions (Recent in Nov 2026 with acknowledgement error)
  const id011 = await insertCase({
    caseNumber: 'QA-REP-011',
    caseType: 'AE',
    dateReceived: '2026-11-12',
    priority: 'normal',
    statusId: 61,
    ownerId: 342,
  });
  await pool.execute(
    `INSERT INTO icsr_reports (
      org_id, case_id, receive_date, report_type, seriousness_classification, status,
      submission_count, last_submitted_at, ack_error_summary, created_at, updated_at
    ) VALUES (1, ?, '2026-11-12', 'Spontaneous', '{\"hospitalization\": true}', 'submitted', 1, '2026-11-13 15:30:00', 'Invalid MedDRA version 26.0 (expected 27.0)', NOW(), NOW())`,
    [id011]
  );

  console.log('✅ Successfully seeded 13 QA-REP edge cases in org 1.');
}

if (require.main === module) {
  seedReportQaEdgeCases()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}

module.exports = { seedReportQaEdgeCases };
