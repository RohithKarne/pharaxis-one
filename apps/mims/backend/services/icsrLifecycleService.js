'use strict';

const pool = require('../database/db');

async function createDerived(prevReportId, userId, type, reason = null) {
  const [[prev]] = await pool.execute('SELECT * FROM icsr_reports WHERE id=? LIMIT 1', [prevReportId]);
  if (!prev) return null;
  if (type === 'nullification') {
    await pool.execute('UPDATE icsr_reports SET status="superseded", nullification_reason=? WHERE id=?', [reason || null, prevReportId]);
  }
  const nextFollowUp = type === 'followup' ? Number(prev.follow_up_number || 0) + 1 : Number(prev.follow_up_number || 0);
  const [result] = await pool.execute(
    `INSERT INTO icsr_reports (org_id, case_id, receiver_id, receive_date, primary_source_country, report_type, seriousness_classification, causality_per_drug, narrative, status, parent_report_id, parent_submission_id, submission_type, follow_up_number, nullification_reason, created_by, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`,
    [prev.org_id, prev.case_id, prev.receiver_id, prev.receive_date, prev.primary_source_country, prev.report_type, prev.seriousness_classification, prev.causality_per_drug, prev.narrative, prev.parent_report_id || prev.id, prev.id, type, nextFollowUp, reason || null, userId || null, userId || null]
  );
  const suffix = type === 'followup' ? `FU${nextFollowUp}` : type === 'amendment' ? `AMD${result.insertId}` : `NULL${result.insertId}`;
  await pool.execute('UPDATE icsr_reports SET sender_safety_report_id=? WHERE id=?', [`${prev.sender_safety_report_id || 'ICSR'}-${suffix}`, result.insertId]);
  return { id: result.insertId, parent_submission_id: prev.id, submission_type: type, follow_up_number: nextFollowUp };
}

const createFollowup = (prevReportId, userId) => createDerived(prevReportId, userId, 'followup');
const createAmendment = (prevReportId, userId) => createDerived(prevReportId, userId, 'amendment');
const createNullification = (prevReportId, reason, userId) => createDerived(prevReportId, userId, 'nullification', reason);

module.exports = { createFollowup, createAmendment, createNullification };
