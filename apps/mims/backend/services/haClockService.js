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

  // CF-01: Calculate discrete seriousness: 7-day fatal/life-threatening vs 15-day expedited
  const [sevRows] = await pool.execute(
    `SELECT 
       MAX(COALESCE(e.is_death, 0) OR COALESCE(e.is_life_threatening, 0)) AS is_fatal_lt,
       MAX(COALESCE(e.is_serious, 0) OR COALESCE(e.is_hospitalization, 0) OR COALESCE(e.is_disability, 0) OR
           COALESCE(e.is_congenital_anomaly, 0) OR COALESCE(e.is_other_medically_important, 0) OR
           COALESCE(e.is_required_intervention, 0) OR COALESCE(e.is_lab_abnormality, 0)) AS is_other_serious
     FROM case_ae_versions v
     LEFT JOIN case_ae_events e ON e.version_id = v.id
     WHERE v.case_id = ?`,
    [caseId]
  );
  const isFatalLt = !!Number(sevRows?.[0]?.is_fatal_lt || 0);
  const isOtherSerious = !!Number(sevRows?.[0]?.is_other_serious || 0);
  const isExpedited = isFatalLt || isOtherSerious;

  const windowDays = isFatalLt ? 7 : (isExpedited ? (authority.submission_window_days || 15) : 90);
  const dueAt = clockStart ? addDays(clockStart, windowDays) : null;

  await pool.execute(
    `INSERT INTO case_ha_clocks (org_id, case_id, ha_code, clock_start_at, due_at, is_expedited)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE clock_start_at=VALUES(clock_start_at), due_at=VALUES(due_at), is_expedited=VALUES(is_expedited), updated_at=CURRENT_TIMESTAMP`,
    [orgId, caseId, ha_code, clockStart, dueAt, isExpedited ? 1 : 0]
  );

  const clockType = isFatalLt ? '7_day_fatal' : (isExpedited ? '15_day_expedited' : 'standard');
  try {
    await pool.execute(
      `UPDATE case_ae_versions
       SET is_expedited = ?, regulatory_clock_type = ?, regulatory_due_date = ?
       WHERE case_id = ? ORDER BY version_number DESC LIMIT 1`,
      [isExpedited ? 1 : 0, clockType, dueAt, caseId]
    );
  } catch (_) {}

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

function add3WorkingDays(startDate) {
  const cur = new Date(startDate.getTime());
  let daysAdded = 0;
  while (daysAdded < 3) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const dayOfWeek = cur.getUTCDay(); // 0 = Sun, 6 = Sat
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysAdded++;
    }
  }
  return cur;
}

async function calculateFarClock({ orgId, caseId, versionId }) {
  const [[pcGen]] = await pool.execute(
    `SELECT g.*, c.date_received, c.awareness_date
       FROM case_pc_general g
       JOIN case_pc_versions v ON v.id = g.version_id
       JOIN cases c ON c.id = v.case_id
      WHERE ${versionId ? 'g.version_id = ?' : 'v.case_id = ?'}
      ORDER BY v.version_number DESC LIMIT 1`,
    [versionId || caseId]
  );
  if (!pcGen) return null;

  const isPatientHarm = !!Number(pcGen.is_patient_harm || 0);
  const isFarReportable = isPatientHarm || !!Number(pcGen.is_far_reportable || 0);

  if (!isFarReportable) {
    return { is_far_reportable: false, is_patient_harm: isPatientHarm, far_due_date: null, far_status: 'not_required' };
  }

  const receiptDate = toDate(pcGen.date_received) || toDate(pcGen.awareness_date) || new Date();
  const farDueDate = pcGen.far_due_date ? toDate(pcGen.far_due_date) : add3WorkingDays(receiptDate);
  const currentStatus = pcGen.far_status && pcGen.far_status !== 'not_required' ? pcGen.far_status : 'pending';

  await pool.execute(
    `UPDATE case_pc_general
        SET is_far_reportable = 1,
            far_due_date = ?,
            far_status = ?
      WHERE version_id = ?`,
    [farDueDate, currentStatus, pcGen.version_id]
  );

  return {
    version_id: pcGen.version_id,
    is_patient_harm: isPatientHarm,
    is_far_reportable: true,
    far_due_date: farDueDate,
    far_status: currentStatus,
    ...clockStatus(farDueDate)
  };
}

module.exports = { calculateClock, listClocks, recalculateAll, isCaseExpedited, clockStatus, calculateFarClock, add3WorkingDays };
