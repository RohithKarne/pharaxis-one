'use strict';

const pool = require('../database/db');
const { createNotifications } = require('./notificationCenterService');

const OPEN_AE_STATUSES = new Set(['Pending', 'In Review', 'Accepted']);
const OPEN_PC_STATUSES = new Set(['Pending', 'Under Investigation']);

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function toDateOnly(date = new Date()) {
  return new Date(date.getTime() - (date.getTimezoneOffset() * 60 * 1000)).toISOString().slice(0, 10);
}

function shiftDateOnly(days, baseDate = new Date()) {
  const copy = new Date(baseDate);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy.toISOString().slice(0, 10);
}

function calculateAeDueDate(priority, requestedDate) {
  if (requestedDate) return requestedDate;
  const days = priority === '7-day-expedited' ? 7 : priority === '15-day-expedited' ? 15 : 30;
  return shiftDateOnly(days);
}

// T14 / 360 walk M-45 — the minimum clock for handing an AE case to PV, from the
// case itself (decision Rohith, 2026-09-29, on Vasu's review): fatal or
// life-threatening AND from a clinical trial → 7 days; any seriousness → 15
// days; otherwise 30 days — counted from the awareness date. A handoff used to
// default to "Routine (30 days)" from today even for a serious, reportable case.
// Seriousness is read from the latest AE version's events and from the intake.
const AE_CLOCK_DAYS = { '7-day-expedited': 7, '15-day-expedited': 15, standard: 30 };

async function computeAeHandoffClock(caseId) {
  const [[version]] = await pool.execute(
    'SELECT id FROM case_ae_versions WHERE case_id = ? ORDER BY version_number DESC, id DESC LIMIT 1',
    [caseId]
  );
  const [[general]] = version
    ? await pool.execute('SELECT report_type, date_of_awareness FROM case_ae_general WHERE version_id = ? LIMIT 1', [version.id])
    : [[null]];
  const [[events]] = version
    ? await pool.execute(
      `SELECT MAX(is_serious OR is_death OR is_life_threatening OR is_hospitalization OR is_disability
                  OR is_congenital_anomaly OR is_other_medically_important) AS serious,
              MAX(is_death OR is_life_threatening) AS fatal_or_lt
         FROM case_ae_events WHERE version_id = ?`,
      [version.id])
    : [[null]];
  const [[intake]] = await pool.execute(
    `SELECT MAX(is_serious OR is_death OR is_life_threatening OR is_hospitalization OR is_prolonged_hospitalization
                OR is_disability OR is_congenital_anomaly OR is_other_medically_important) AS serious,
            MAX(is_death OR is_life_threatening) AS fatal_or_lt
       FROM case_ae_intake WHERE case_id = ?`,
    [caseId]
  );
  const serious = Boolean(Number(events?.serious) || Number(intake?.serious));
  const fatalOrLifeThreatening = Boolean(Number(events?.fatal_or_lt) || Number(intake?.fatal_or_lt));
  const clinicalTrial = /clinical trial|study/i.test(String(general?.report_type || ''));
  const priority = fatalOrLifeThreatening && clinicalTrial ? '7-day-expedited' : serious ? '15-day-expedited' : 'standard';
  const reason = priority === '7-day-expedited'
    ? 'fatal or life-threatening, from a clinical trial'
    : priority === '15-day-expedited' ? 'serious' : 'not serious';
  const awareness = general?.date_of_awareness ? new Date(general.date_of_awareness) : null;
  const start = awareness && !Number.isNaN(awareness.getTime()) ? awareness : new Date();
  return {
    priority,
    reason,
    from: awareness && !Number.isNaN(awareness.getTime()) ? 'awareness date' : 'today (no awareness date)',
    dueDate: shiftDateOnly(AE_CLOCK_DAYS[priority], start),
  };
}

// The stricter of two AE handoff priorities (fewer days wins).
function stricterAePriority(a, b) {
  return (AE_CLOCK_DAYS[a] ?? 30) <= (AE_CLOCK_DAYS[b] ?? 30) ? a : b;
}

function calculatePcDueDate(priority, requestedDate) {
  if (requestedDate) return requestedDate;
  const days = priority === 'urgent' ? 5 : priority === 'high' ? 10 : 30;
  return shiftDateOnly(days);
}

function computeTransmissionSlaStatus(dueDate, status) {
  if (!dueDate) return 'untracked';
  if (['Closed'].includes(status)) return 'closed';

  const today = toDateOnly();
  if (dueDate < today) return 'breached';

  const tomorrow = shiftDateOnly(1);
  if (dueDate <= tomorrow) return 'at_risk';

  return 'on_track';
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

async function findDuplicateCandidates({
  orgId,
  caseType,
  reporter = {},
  patient = {},
  ae_intake = {},
  pc_intake = {},
  excludeCaseId = null,
  limit = 8,
}) {
  if (!orgId || !caseType) return [];

  const reporterEmail = normalizeEmail(reporter.email);
  const reporterPhone = normalizeString(reporter.phone);
  const patientInitials = normalizeString(patient.initials);
  const suspectDrug = normalizeString(ae_intake.suspect_drug_name);
  const complaintProduct = normalizeString(pc_intake.product_name);
  const complaintLot = normalizeString(pc_intake.batch_lot_number || ae_intake.batch_lot_number);

  const scoreParts = [];
  const reasonParts = [];
  const params = [orgId, caseType];

  if (reporterEmail) {
    scoreParts.push(`CASE WHEN LOWER(COALESCE(cr.email, '')) = LOWER(?) THEN 35 ELSE 0 END`);
    reasonParts.push(`CASE WHEN LOWER(COALESCE(cr.email, '')) = LOWER(?) THEN 'same reporter email' ELSE NULL END`);
    params.push(reporterEmail, reporterEmail);
  }

  if (reporterPhone) {
    const likePhone = `%${escapeLike(reporterPhone)}%`;
    scoreParts.push(`CASE WHEN COALESCE(cr.phone, '') LIKE ? ESCAPE '\\\\' THEN 20 ELSE 0 END`);
    reasonParts.push(`CASE WHEN COALESCE(cr.phone, '') LIKE ? ESCAPE '\\\\' THEN 'similar reporter phone' ELSE NULL END`);
    params.push(likePhone, likePhone);
  }

  if (patientInitials && (caseType === 'AE' || caseType === 'PC')) {
    scoreParts.push(`CASE WHEN UPPER(COALESCE(cp.initials, '')) = UPPER(?) THEN 20 ELSE 0 END`);
    reasonParts.push(`CASE WHEN UPPER(COALESCE(cp.initials, '')) = UPPER(?) THEN 'same patient initials' ELSE NULL END`);
    params.push(patientInitials, patientInitials);
  }

  if (suspectDrug && caseType === 'AE') {
    scoreParts.push(`CASE WHEN LOWER(COALESCE(ae.suspect_drug_name, '')) = LOWER(?) THEN 25 ELSE 0 END`);
    reasonParts.push(`CASE WHEN LOWER(COALESCE(ae.suspect_drug_name, '')) = LOWER(?) THEN 'same suspect product' ELSE NULL END`);
    params.push(suspectDrug, suspectDrug);
  }

  if (complaintProduct && caseType === 'PC') {
    scoreParts.push(`CASE WHEN LOWER(COALESCE(pc.product_name, '')) = LOWER(?) THEN 25 ELSE 0 END`);
    reasonParts.push(`CASE WHEN LOWER(COALESCE(pc.product_name, '')) = LOWER(?) THEN 'same complaint product' ELSE NULL END`);
    params.push(complaintProduct, complaintProduct);
  }

  if (complaintLot && (caseType === 'AE' || caseType === 'PC')) {
    scoreParts.push(
      `CASE
         WHEN LOWER(COALESCE(pc.batch_lot_number, '')) = LOWER(?)
           OR LOWER(COALESCE(ae.batch_lot_number, '')) = LOWER(?)
         THEN 15 ELSE 0 END`
    );
    reasonParts.push(
      `CASE
         WHEN LOWER(COALESCE(pc.batch_lot_number, '')) = LOWER(?)
           OR LOWER(COALESCE(ae.batch_lot_number, '')) = LOWER(?)
         THEN 'same lot or batch number' ELSE NULL END`
    );
    params.push(complaintLot, complaintLot, complaintLot, complaintLot);
  }

  if (!scoreParts.length) return [];

  let sql = `
    SELECT
      c.id,
      c.case_number,
      c.case_type,
      c.created_at,
      c.updated_at,
      ws.name AS status_name,
      u.name AS owner_name,
      (${scoreParts.join(' + ')}) AS match_score,
      CONCAT_WS(', ', ${reasonParts.join(', ')}) AS match_reasons
    FROM cases c
    LEFT JOIN workflow_states ws ON ws.id = c.status_id
    LEFT JOIN users u ON u.id = c.case_owner_id
    LEFT JOIN case_reporter cr ON cr.case_id = c.id
    LEFT JOIN case_patient cp ON cp.case_id = c.id
    LEFT JOIN case_ae_intake ae ON ae.case_id = c.id
    LEFT JOIN case_pc_intake pc ON pc.case_id = c.id
    WHERE c.org_id = ?
      AND c.case_type = ?
      AND c.is_deleted = 0
      AND c.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 180 DAY)
  `;

  if (excludeCaseId) {
    sql += ' AND c.id <> ?';
    params.push(Number(excludeCaseId));
  }

  sql += `
    HAVING match_score > 0
    ORDER BY match_score DESC, c.updated_at DESC, c.id DESC
    LIMIT ${Math.max(1, Math.min(Number(limit) || 8, 20))}
  `;

  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function getCaseDuplicateCandidates(caseId) {
  const [[caseRow]] = await pool.execute(
    'SELECT id, org_id, case_type FROM cases WHERE id = ? LIMIT 1',
    [caseId]
  );
  if (!caseRow) return [];

  const [[reporter]] = await pool.execute('SELECT * FROM case_reporter WHERE case_id = ? LIMIT 1', [caseId]);
  const [[patient]] = await pool.execute('SELECT * FROM case_patient WHERE case_id = ? LIMIT 1', [caseId]);
  const [[aeIntake]] = await pool.execute('SELECT * FROM case_ae_intake WHERE case_id = ? LIMIT 1', [caseId]);
  const [[pcIntake]] = await pool.execute('SELECT * FROM case_pc_intake WHERE case_id = ? LIMIT 1', [caseId]);

  return findDuplicateCandidates({
    orgId: caseRow.org_id,
    caseType: caseRow.case_type,
    reporter: reporter || {},
    patient: patient || {},
    ae_intake: aeIntake || {},
    pc_intake: pcIntake || {},
    excludeCaseId: caseId,
  });
}

async function refreshTransmissionSlaAlerts() {
  const [rows] = await pool.execute(
    `
      SELECT
        'AE' AS transmission_type,
        t.id,
        t.case_id,
        t.assigned_to,
        t.due_date,
        t.status,
        t.sla_status,
        t.escalated_at,
        t.reminder_sent_at,
        c.case_number,
        c.case_owner_id
      FROM case_ae_transmissions t
      JOIN cases c ON c.id = t.case_id
      WHERE c.is_deleted = 0
        AND t.status IN ('Pending', 'In Review', 'Accepted')
        AND t.due_date IS NOT NULL
      UNION ALL
      SELECT
        'PC' AS transmission_type,
        t.id,
        t.case_id,
        t.assigned_to,
        t.due_date,
        t.status,
        t.sla_status,
        t.escalated_at,
        t.reminder_sent_at,
        c.case_number,
        c.case_owner_id
      FROM case_pc_transmissions t
      JOIN cases c ON c.id = t.case_id
      WHERE c.is_deleted = 0
        AND t.status IN ('Pending', 'Under Investigation')
        AND t.due_date IS NOT NULL
    `
  );

  const today = toDateOnly();
  const tomorrow = shiftDateOnly(1);

  for (const row of rows) {
    const nextSlaStatus = computeTransmissionSlaStatus(row.due_date, row.status);
    const tableName = row.transmission_type === 'AE' ? 'case_ae_transmissions' : 'case_pc_transmissions';
    const isBreach = row.due_date < today;
    const isAtRisk = row.due_date >= today && row.due_date <= tomorrow;

    await pool.execute(
      `UPDATE ${tableName}
       SET sla_status = ?
       WHERE id = ? AND COALESCE(sla_status, '') <> ?`,
      [nextSlaStatus, row.id, nextSlaStatus]
    );

    if (isAtRisk && !row.reminder_sent_at) {
      const targetUsers = [row.assigned_to, row.case_owner_id].filter(Boolean);
      await createNotifications(targetUsers, {
        category: 'transmission_sla',
        severity: 'warning',
        title: `${row.transmission_type} transmission due soon`,
        message: `${row.case_number || `Case ${row.case_id}`} is due on ${row.due_date}.`,
        linkUrl: `/cases/${row.case_id}?section=${row.transmission_type === 'AE' ? 'ae' : 'pc'}`,
        metadata: { case_id: row.case_id, transmission_id: row.id, due_date: row.due_date },
        eventKey: `${row.transmission_type.toLowerCase()}-transmission-at-risk`,
      });
      await pool.execute(
        `UPDATE ${tableName} SET reminder_sent_at = NOW(), sla_status = 'at_risk' WHERE id = ?`,
        [row.id]
      );
      continue;
    }

    if (isBreach && !row.escalated_at) {
      const targetUsers = [row.assigned_to, row.case_owner_id].filter(Boolean);
      await createNotifications(targetUsers, {
        category: 'transmission_sla',
        severity: 'critical',
        title: `${row.transmission_type} transmission overdue`,
        message: `${row.case_number || `Case ${row.case_id}`} missed its due date (${row.due_date}).`,
        linkUrl: `/cases/${row.case_id}?section=${row.transmission_type === 'AE' ? 'ae' : 'pc'}`,
        metadata: { case_id: row.case_id, transmission_id: row.id, due_date: row.due_date },
        requiresAcknowledgement: true,
        eventKey: `${row.transmission_type.toLowerCase()}-transmission-overdue`,
      });
      await pool.execute(
        `UPDATE ${tableName}
         SET sla_status = 'breached', escalated_at = NOW(), escalation_level = COALESCE(escalation_level, 0) + 1
         WHERE id = ?`,
        [row.id]
      );
    }
  }
}

module.exports = {
  calculateAeDueDate,
  computeAeHandoffClock,
  stricterAePriority,
  AE_CLOCK_DAYS,
  calculatePcDueDate,
  computeTransmissionSlaStatus,
  findDuplicateCandidates,
  getCaseDuplicateCandidates,
  refreshTransmissionSlaAlerts,
  OPEN_AE_STATUSES,
  OPEN_PC_STATUSES,
};
