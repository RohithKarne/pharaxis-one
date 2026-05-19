'use strict';

const pool = require('../database/db');

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + Number(days || 15));
  return d;
}

function clockStatus(dueAt, now = new Date()) {
  if (!dueAt) return { days_remaining: null, status: 'unknown' };
  const ms = toDate(dueAt).getTime() - now.getTime();
  const days = Math.ceil(ms / 86400000);
  const status = days > 7 ? 'green' : days >= 2 ? 'amber' : 'red';
  return { days_remaining: days, status };
}

async function isCaseExpedited(caseId) {
  const [rows] = await pool.execute(
    `SELECT MAX(
       COALESCE(e.is_serious,0) OR COALESCE(e.is_death,0) OR COALESCE(e.is_life_threatening,0) OR
       COALESCE(e.is_hospitalization,0) OR COALESCE(e.is_disability,0) OR COALESCE(e.is_congenital_anomaly,0) OR
       COALESCE(e.is_other_medically_important,0) OR COALESCE(e.is_required_intervention,0) OR COALESCE(e.is_lab_abnormality,0)
     ) AS expedited
       FROM case_ae_versions v
       LEFT JOIN case_ae_events e ON e.version_id = v.id
      WHERE v.case_id = ?`,
    [caseId]
  );
  return !!Number(rows?.[0]?.expedited || 0);
}

function selectClockStart(caseRow, authority) {
  const basis = String(authority?.reporting_basis || 'awareness').toLowerCase();
  if (basis === 'validity') return toDate(caseRow.learn_of_validity_date) || toDate(caseRow.awareness_date) || toDate(caseRow.date_received);
  if (basis === 'receipt') return toDate(caseRow.date_received) || toDate(caseRow.awareness_date);
  return toDate(caseRow.awareness_date) || toDate(caseRow.date_received);
}

async function calculateClock({ orgId, caseId, ha_code }) {
  const [[caseRow]] = await pool.execute('SELECT * FROM cases WHERE id = ? AND org_id = ? LIMIT 1', [caseId, orgId]);
  if (!caseRow) return null;
  const [[authority]] = await pool.execute('SELECT * FROM health_authorities WHERE code = ? AND is_active = 1 LIMIT 1', [ha_code]);
  if (!authority) return null;
  const clockStart = selectClockStart(caseRow, authority);
  const dueAt = clockStart ? addDays(clockStart, authority.submission_window_days || 15) : null;
  const expedited = await isCaseExpedited(caseId);
  await pool.execute(
    `INSERT INTO case_ha_clocks (org_id, case_id, ha_code, clock_start_at, due_at, is_expedited)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE clock_start_at=VALUES(clock_start_at), due_at=VALUES(due_at), is_expedited=VALUES(is_expedited), updated_at=CURRENT_TIMESTAMP`,
    [orgId, caseId, ha_code, clockStart, dueAt, expedited ? 1 : 0]
  );
  const [[row]] = await pool.execute('SELECT * FROM case_ha_clocks WHERE case_id = ? AND ha_code = ? LIMIT 1', [caseId, ha_code]);
  return row;
}

async function recalculateAll({ orgId, caseId }) {
  const [authorities] = await pool.execute('SELECT * FROM health_authorities WHERE is_active = 1 ORDER BY id ASC');
  const rows = [];
  for (const ha of authorities) rows.push(await calculateClock({ orgId, caseId, ha_code: ha.code }));
  return rows.filter(Boolean);
}

async function listClocks({ orgId, caseId }) {
  await recalculateAll({ orgId, caseId });
  const [rows] = await pool.execute(
    `SELECT c.*, h.name, h.submission_window_days
       FROM case_ha_clocks c
       JOIN health_authorities h ON h.code = c.ha_code
      WHERE c.org_id = ? AND c.case_id = ? AND h.is_active = 1
      ORDER BY h.id ASC`,
    [orgId, caseId]
  );
  return rows.map(row => ({ ...row, ...clockStatus(row.due_at) }));
}

module.exports = { calculateClock, listClocks, recalculateAll, isCaseExpedited, clockStatus };
