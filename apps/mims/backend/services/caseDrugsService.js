'use strict';

const pool = require('../database/db');
const ROLES = new Set(['suspect','co_suspect','concomitant','interacting']);

async function verifyCase(orgId, caseId) {
  const [[row]] = await pool.execute('SELECT id, org_id FROM cases WHERE id=? AND org_id=? LIMIT 1', [caseId, orgId]);
  return row;
}

async function list({ orgId, caseId }) {
  return (await pool.execute('SELECT * FROM case_drugs WHERE org_id=? AND case_id=? ORDER BY FIELD(role, "suspect", "co_suspect", "interacting", "concomitant"), id ASC', [orgId, caseId]))[0];
}

async function create({ orgId, caseId, body, userId }) {
  if (!ROLES.has(body.role)) throw new Error('Invalid drug role.');
  const [result] = await pool.execute(
    `INSERT INTO case_drugs (org_id, case_id, ae_version_id, product_id, drug_name_verbatim, whodrug_code, role, dose_amount, dose_unit, route_of_administration, indication, start_date, end_date, action_taken, drug_reaction_recurrence, lot_number, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [orgId, caseId, body.ae_version_id || null, body.product_id || null, body.drug_name_verbatim || null, body.whodrug_code || null, body.role, body.dose_amount || null, body.dose_unit || null, body.route_of_administration || null, body.indication || null, body.start_date || null, body.end_date || null, body.action_taken || null, body.drug_reaction_recurrence || null, body.lot_number || null, userId || null]
  );
  return result.insertId;
}

async function update({ orgId, caseId, drugId, body }) {
  if (body.role && !ROLES.has(body.role)) throw new Error('Invalid drug role.');
  const [[existing]] = await pool.execute('SELECT id FROM case_drugs WHERE id=? AND org_id=? AND case_id=? LIMIT 1', [drugId, orgId, caseId]);
  if (!existing) return false;
  await pool.execute(
    `UPDATE case_drugs SET product_id=?, drug_name_verbatim=?, whodrug_code=?, role=?, dose_amount=?, dose_unit=?, route_of_administration=?, indication=?, start_date=?, end_date=?, action_taken=?, drug_reaction_recurrence=?, lot_number=? WHERE id=?`,
    [body.product_id || null, body.drug_name_verbatim || null, body.whodrug_code || null, body.role || 'suspect', body.dose_amount || null, body.dose_unit || null, body.route_of_administration || null, body.indication || null, body.start_date || null, body.end_date || null, body.action_taken || null, body.drug_reaction_recurrence || null, body.lot_number || null, drugId]
  );
  return true;
}

async function remove({ orgId, caseId, drugId }) {
  const [result] = await pool.execute('DELETE FROM case_drugs WHERE id=? AND org_id=? AND case_id=?', [drugId, orgId, caseId]);
  return result.affectedRows > 0;
}

module.exports = { verifyCase, list, create, update, remove };
