'use strict';

/**
 * capaService.js — Sprint 2 #20: CAPA lifecycle.
 *
 * Surfaces:
 *   list({orgId, status, sourceCaseId, assignedTo, limit})
 *   get({orgId, id})       — record + ordered actions + event log
 *   create({orgId, userId, payload})
 *   update({orgId, id, patch, userId})
 *   transition({orgId, id, toStatus, note, userId})
 *   addAction({capaId, payload, userId})
 *   completeAction({actionId, verificationNotes, userId})
 *   logEffectiveness({orgId, id, outcome, notes, userId})
 */

const pool = require('../database/db');

const STATUS_FLOW = [
  'open', 'root_cause_identified', 'action_proposed', 'action_approved',
  'action_implemented', 'effectiveness_check', 'closed', 'terminated',
];

async function list({ orgId, status = null, sourceCaseId = null, assignedTo = null, limit = 200 }) {
  const params = [orgId];
  let where = ' WHERE org_id = ? ';
  if (status)       { where += ' AND status = ?';          params.push(status); }
  if (sourceCaseId) { where += ' AND source_case_id = ?';  params.push(Number(sourceCaseId)); }
  if (assignedTo)   { where += ' AND assigned_to = ?';     params.push(Number(assignedTo)); }
  const [rows] = await pool.execute(
    `SELECT * FROM capa_records ${where}
     ORDER BY opened_at DESC LIMIT ?`,
    [...params, Number(limit) || 200]
  );
  return rows;
}

async function get({ orgId, id }) {
  const [[record]] = await pool.execute(
    `SELECT * FROM capa_records WHERE id = ? AND org_id = ?`, [id, orgId]
  );
  if (!record) return null;
  const [actions] = await pool.execute(
    `SELECT a.*, u.name AS assigned_to_name
       FROM capa_actions a
       LEFT JOIN users u ON u.id = a.assigned_to
      WHERE a.capa_id = ? ORDER BY a.sort_order, a.id`,
    [id]
  );
  const [events] = await pool.execute(
    `SELECT e.*, u.name AS created_by_name
       FROM capa_events e
       LEFT JOIN users u ON u.id = e.created_by
      WHERE e.capa_id = ? ORDER BY e.created_at DESC`,
    [id]
  );
  return { ...record, actions, events };
}

async function _nextCapaNumber(orgId) {
  const year = new Date().getFullYear();
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS n FROM capa_records WHERE org_id = ? AND YEAR(opened_at) = ?`,
    [orgId, year]
  );
  return `CAPA-${year}-${String((row?.n || 0) + 1).padStart(3, '0')}`;
}

async function create({ orgId, userId, payload }) {
  if (!payload?.title) throw new Error('title required');
  if (!payload?.source_type) throw new Error('source_type required');
  const capa_number = payload.capa_number || (await _nextCapaNumber(orgId));
  const [r] = await pool.execute(
    `INSERT INTO capa_records
       (org_id, capa_number, title, source_type, source_case_id, source_field_action_id,
        severity, status, problem_statement, root_cause, root_cause_method,
        corrective_action, preventive_action,
        target_completion_date, effectiveness_check_due,
        assigned_to, opened_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orgId, capa_number, payload.title, payload.source_type,
      payload.source_case_id || null, payload.source_field_action_id || null,
      payload.severity || 'medium',
      payload.problem_statement || null, payload.root_cause || null,
      payload.root_cause_method || null,
      payload.corrective_action || null, payload.preventive_action || null,
      payload.target_completion_date || null, payload.effectiveness_check_due || null,
      payload.assigned_to || null, userId,
    ]
  );
  await _logEvent({ capa_id: r.insertId, event_type: 'status_change',
    to_status: 'open', note: 'CAPA opened.', created_by: userId });
  return { id: r.insertId, capa_number };
}

async function update({ orgId, id, patch, userId }) {
  const allowed = [
    'title','severity','source_case_id','source_field_action_id',
    'problem_statement','root_cause','root_cause_method',
    'corrective_action','preventive_action',
    'target_completion_date','actual_completion_date','effectiveness_check_due',
    'effectiveness_outcome','effectiveness_notes','assigned_to',
  ];
  const sets = []; const params = [];
  for (const k of allowed) {
    if (patch[k] === undefined) continue;
    sets.push(`${k} = ?`); params.push(patch[k]);
  }
  if (!sets.length) return { ok: true };
  params.push(id, orgId);
  await pool.execute(
    `UPDATE capa_records SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = ? AND org_id = ?`, params
  );
  await _logEvent({ capa_id: id, event_type: 'note',
    note: `Updated: ${Object.keys(patch).join(', ')}`, created_by: userId });
  return { ok: true };
}

async function transition({ orgId, id, toStatus, note, userId }) {
  if (!STATUS_FLOW.includes(toStatus)) throw new Error(`Invalid status: ${toStatus}`);
  const [[row]] = await pool.execute(
    `SELECT status FROM capa_records WHERE id = ? AND org_id = ?`, [id, orgId]
  );
  if (!row) throw new Error('Not found');
  const from = row.status;
  const sets = ['status = ?']; const params = [toStatus];
  if (toStatus === 'closed') { sets.push('closed_at = NOW()', 'closed_by = ?'); params.push(userId); }
  params.push(id, orgId);
  await pool.execute(
    `UPDATE capa_records SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = ? AND org_id = ?`, params
  );
  await _logEvent({
    capa_id: id, event_type: 'status_change',
    from_status: from, to_status: toStatus, note: note || null, created_by: userId,
  });
  return { ok: true, from, to: toStatus };
}

async function addAction({ capaId, payload, userId }) {
  if (!payload?.description || !payload?.action_type) throw new Error('description + action_type required');
  const [r] = await pool.execute(
    `INSERT INTO capa_actions
       (capa_id, action_type, description, assigned_to, target_date, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      capaId, payload.action_type, payload.description,
      payload.assigned_to || null, payload.target_date || null, payload.sort_order || 0,
    ]
  );
  await _logEvent({
    capa_id: capaId, event_type: 'action_added',
    note: `${payload.action_type}: ${payload.description.slice(0, 80)}`, created_by: userId,
  });
  return { id: r.insertId };
}

async function completeAction({ actionId, verificationNotes, userId }) {
  const [[a]] = await pool.execute(`SELECT capa_id FROM capa_actions WHERE id = ?`, [actionId]);
  if (!a) throw new Error('Action not found');
  await pool.execute(
    `UPDATE capa_actions SET completed_at = NOW(), completed_by = ?, verification_notes = ?
      WHERE id = ?`,
    [userId, verificationNotes || null, actionId]
  );
  await _logEvent({
    capa_id: a.capa_id, event_type: 'action_completed',
    note: `Action #${actionId} marked complete.`, created_by: userId,
  });
  return { ok: true };
}

async function logEffectiveness({ orgId, id, outcome, notes, userId }) {
  if (!['effective','partially_effective','not_effective','pending'].includes(outcome)) {
    throw new Error('Invalid outcome');
  }
  await pool.execute(
    `UPDATE capa_records SET effectiveness_outcome = ?, effectiveness_notes = ?, updated_at = NOW()
      WHERE id = ? AND org_id = ?`,
    [outcome, notes || null, id, orgId]
  );
  await _logEvent({
    capa_id: id, event_type: 'effectiveness_logged',
    note: `Outcome: ${outcome}${notes ? ` — ${notes.slice(0, 200)}` : ''}`, created_by: userId,
  });
  return { ok: true };
}

async function _logEvent({ capa_id, event_type, from_status = null, to_status = null, note = null, created_by = null }) {
  await pool.execute(
    `INSERT INTO capa_events (capa_id, event_type, from_status, to_status, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [capa_id, event_type, from_status, to_status, note, created_by]
  );
}

module.exports = {
  STATUS_FLOW,
  list, get, create, update, transition,
  addAction, completeAction, logEffectiveness,
};
