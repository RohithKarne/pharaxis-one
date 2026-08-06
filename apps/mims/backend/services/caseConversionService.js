'use strict';

const pool = require('../database/db');

async function convertMi(miTabId, userId, target) {
  const [[mi]] = await pool.execute(
    `SELECT m.*, c.org_id, c.site_id, c.case_number,
            c.date_received  AS source_date_received,
            c.awareness_date AS source_awareness_date
       FROM case_mi m JOIN cases c ON c.id = m.case_id
      WHERE m.id=? LIMIT 1`,
    [miTabId]
  );
  if (!mi) return null;
  if (mi.converted_to_case_id) return { alreadyConverted: true, case_id: mi.converted_to_case_id };
  const type = target === 'pc' ? 'PC' : 'AE';
  // Day 0 is the day the enquiry reached us, not the day somebody noticed it
  // was reportable. This used to insert CURRENT_DATE() and leave awareness_date
  // null, so haClockService started the clock on the conversion date and every
  // day between the call and the conversion was lost (PAUD-2 item 4).
  // The fallback to now only applies to legacy rows carrying neither date.
  const awarenessDate = mi.source_awareness_date || mi.source_date_received || new Date();
  const dateReceived  = mi.source_date_received  || awarenessDate;
  const [result] = await pool.execute(
    `INSERT INTO cases (org_id, site_id, case_type, intake_channel, date_received, awareness_date, description, created_by)
     VALUES (?, ?, ?, 'mi_conversion', ?, ?, ?, ?)`,
    [mi.org_id, mi.site_id, type, dateReceived, awarenessDate, mi.detailed_question || mi.question_summary || `Converted from MI case ${mi.case_number || mi.case_id}`, userId || null]
  );
  const newCaseId = result.insertId;
  await pool.execute(`INSERT INTO case_comments (case_id, user_id, comment) VALUES (?, ?, ?)`, [newCaseId, userId || null, `Originated from MI Case #${mi.case_id}, MI tab #${mi.id}.`]).catch(() => {});
  await pool.execute(`INSERT INTO case_comments (case_id, user_id, comment) VALUES (?, ?, ?)`, [mi.case_id, userId || null, `Converted to ${type} Case #${newCaseId}.`]).catch(() => {});
  if (type === 'AE') {
    const [v] = await pool.execute('INSERT INTO case_ae_versions (case_id, version_number, created_by) VALUES (?, 1, ?)', [newCaseId, userId || null]);
    if (mi.detailed_question || mi.question_summary) {
      await pool.execute('INSERT INTO case_ae_events (version_id, event_description, outcome) VALUES (?, ?, ?)', [v.insertId, mi.detailed_question || mi.question_summary, 'unknown']).catch(() => {});
    }
  }
  await pool.execute('UPDATE case_mi SET converted_to_case_id=?, converted_to_type=?, converted_at=CURRENT_TIMESTAMP, converted_by=? WHERE id=?', [newCaseId, target, userId || null, miTabId]);
  await pool.execute('INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)', [userId || null, String(userId || 'system'), target === 'ae' ? 'MI_CONVERTED_TO_AE' : 'MI_CONVERTED_TO_PC', 'case_mi', miTabId, JSON.stringify({ source_case_id: mi.case_id, target_case_id: newCaseId })]).catch(() => {});
  return { case_id: newCaseId, target: type };
}

module.exports = { convertMiToAe: (miTabId, userId) => convertMi(miTabId, userId, 'ae'), convertMiToPc: (miTabId, userId) => convertMi(miTabId, userId, 'pc') };
