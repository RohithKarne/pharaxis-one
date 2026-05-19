'use strict';

/**
 * fieldActionsService.js — Sprint 2 #28: field action / recall lifecycle.
 *
 * Handles the regulator-facing market-action workflow:
 *   draft → submit → acknowledge → in_progress → effectiveness_check → close
 * Plus side-effects: when classification changes to recall, marks linked lots
 * as recalled (joins to lot_master from #19).
 */

const pool = require('../database/db');
const { logger } = require('./logger');

const STATUS_FLOW = [
  'drafted', 'submitted', 'acknowledged', 'in_progress',
  'effectiveness_check', 'closed', 'terminated',
];

async function list({ orgId, status = null, productId = null, limit = 200 }) {
  const params = [orgId];
  let where = ' WHERE org_id = ? ';
  if (status)     { where += ' AND status = ?';     params.push(status); }
  if (productId)  { where += ' AND product_id = ?'; params.push(Number(productId)); }
  const [rows] = await pool.execute(
    `SELECT * FROM field_action_records ${where}
     ORDER BY initiated_at DESC LIMIT ?`,
    [...params, Number(limit) || 200]
  );
  return rows.map(r => ({
    ...r,
    affected_lots_json: parseJson(r.affected_lots_json),
    regulator_codes_json: parseJson(r.regulator_codes_json),
  }));
}

async function get({ orgId, id }) {
  const [[record]] = await pool.execute(
    `SELECT * FROM field_action_records WHERE id = ? AND org_id = ?`, [id, orgId]
  );
  if (!record) return null;
  const [cases] = await pool.execute(
    `SELECT fac.case_id, fac.relation, c.case_number
       FROM field_action_cases fac
       LEFT JOIN cases c ON c.id = fac.case_id
      WHERE fac.field_action_id = ?
      ORDER BY fac.added_at`,
    [id]
  );
  const [events] = await pool.execute(
    `SELECT e.id, e.event_type, e.from_status, e.to_status, e.note, e.created_at,
            u.name AS created_by_name
       FROM field_action_events e
       LEFT JOIN users u ON u.id = e.created_by
      WHERE e.field_action_id = ?
      ORDER BY e.created_at DESC`,
    [id]
  );
  return {
    ...record,
    affected_lots_json:   parseJson(record.affected_lots_json),
    regulator_codes_json: parseJson(record.regulator_codes_json),
    cases, events,
  };
}

async function create({ orgId, userId, payload }) {
  const required = ['action_type', 'reason_summary'];
  for (const k of required) if (!payload[k]) throw new Error(`${k} required`);
  const actionNumber = payload.action_number || (await _nextActionNumber(orgId));
  const [r] = await pool.execute(
    `INSERT INTO field_action_records
       (org_id, action_number, action_type, classification, product_id,
        affected_lots_json, reason_summary, narrative, hazard_description,
        depth, regulator_codes_json, initiated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orgId, actionNumber, payload.action_type, payload.classification || 'not_classified',
      payload.product_id || null,
      payload.affected_lots_json ? JSON.stringify(payload.affected_lots_json) : null,
      payload.reason_summary, payload.narrative || null, payload.hazard_description || null,
      payload.depth || 'consumer',
      payload.regulator_codes_json ? JSON.stringify(payload.regulator_codes_json) : null,
      userId,
    ]
  );
  await _logEvent({ field_action_id: r.insertId, event_type: 'status_change',
    to_status: 'drafted', note: 'Field action drafted.', created_by: userId });
  return { id: r.insertId, action_number: actionNumber };
}

async function _nextActionNumber(orgId) {
  const year = new Date().getFullYear();
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS n FROM field_action_records WHERE org_id = ? AND YEAR(initiated_at) = ?`,
    [orgId, year]
  );
  const seq = String((row?.n || 0) + 1).padStart(3, '0');
  return `FA-${year}-${seq}`;
}

async function update({ orgId, id, patch, userId }) {
  const allowed = [
    'action_type', 'classification', 'product_id', 'affected_lots_json',
    'reason_summary', 'narrative', 'hazard_description', 'depth',
    'regulator_codes_json', 'effectiveness_check_due', 'effectiveness_outcome',
  ];
  const sets = []; const params = [];
  for (const k of allowed) {
    if (patch[k] === undefined) continue;
    if (k.endsWith('_json')) { sets.push(`${k} = ?`); params.push(patch[k] ? JSON.stringify(patch[k]) : null); }
    else                     { sets.push(`${k} = ?`); params.push(patch[k]); }
  }
  if (!sets.length) return { ok: true };
  params.push(id, orgId);
  await pool.execute(
    `UPDATE field_action_records SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = ? AND org_id = ?`,
    params
  );
  await _logEvent({ field_action_id: id, event_type: 'note',
    note: `Updated: ${Object.keys(patch).join(', ')}`, created_by: userId });
  return { ok: true };
}

async function transition({ orgId, id, toStatus, note, userId }) {
  if (!STATUS_FLOW.includes(toStatus)) throw new Error(`Invalid status: ${toStatus}`);
  const [[row]] = await pool.execute(
    `SELECT status, classification FROM field_action_records WHERE id = ? AND org_id = ?`,
    [id, orgId]
  );
  if (!row) throw new Error('Not found');
  const from = row.status;
  const sets = ['status = ?'];
  const params = [toStatus];
  if (toStatus === 'submitted')  { sets.push('submitted_at = NOW()'); }
  if (toStatus === 'closed')     { sets.push('closed_at = NOW()'); }
  params.push(id, orgId);
  await pool.execute(
    `UPDATE field_action_records SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = ? AND org_id = ?`,
    params
  );
  await _logEvent({
    field_action_id: id, event_type: 'status_change',
    from_status: from, to_status: toStatus,
    note: note || null, created_by: userId,
  });
  // Side-effect: when transitioning into in_progress on a recall, mark lots recalled
  if (toStatus === 'in_progress' && row.classification?.startsWith('class_')) {
    await _markAffectedLotsRecalled({ orgId, id });
  }
  return { ok: true, from, to: toStatus };
}

async function _markAffectedLotsRecalled({ orgId, id }) {
  try {
    const [[rec]] = await pool.execute(
      `SELECT affected_lots_json FROM field_action_records WHERE id = ?`, [id]
    );
    const lots = parseJson(rec?.affected_lots_json);
    if (!Array.isArray(lots) || !lots.length) return;
    const placeholders = lots.map(() => '?').join(',');
    await pool.execute(
      `UPDATE lot_master SET status = 'recalled', recalled_at = NOW(), recall_id = ?
        WHERE org_id = ? AND id IN (${placeholders})`,
      [id, orgId, ...lots]
    );
  } catch (err) {
    logger.warn({ err: err.message, field_action_id: id }, 'failed to cascade lot recall');
  }
}

async function linkCase({ id, caseId, relation = 'affected', userId }) {
  await pool.execute(
    `INSERT IGNORE INTO field_action_cases (field_action_id, case_id, relation)
     VALUES (?, ?, ?)`,
    [id, caseId, relation]
  );
  await _logEvent({
    field_action_id: id, event_type: 'note',
    note: `Linked case #${caseId} (${relation})`, created_by: userId,
  });
  return { ok: true };
}

async function unlinkCase({ id, caseId, userId }) {
  await pool.execute(
    `DELETE FROM field_action_cases WHERE field_action_id = ? AND case_id = ?`,
    [id, caseId]
  );
  await _logEvent({
    field_action_id: id, event_type: 'note',
    note: `Unlinked case #${caseId}`, created_by: userId,
  });
  return { ok: true };
}

async function _logEvent({ field_action_id, event_type, from_status = null, to_status = null, note = null, created_by = null }) {
  await pool.execute(
    `INSERT INTO field_action_events
       (field_action_id, event_type, from_status, to_status, note, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [field_action_id, event_type, from_status, to_status, note, created_by]
  );
}

function parseJson(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

module.exports = { list, get, create, update, transition, linkCase, unlinkCase, STATUS_FLOW };
