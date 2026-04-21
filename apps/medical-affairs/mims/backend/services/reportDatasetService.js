'use strict';

const pool = require('../database/db');

function normalizeDateOnly(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const dt = new Date(text);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDateRange(filters = {}) {
  const dateFrom = normalizeDateOnly(filters.date_from || filters.date);
  const dateTo = normalizeDateOnly(filters.date_to || filters.date);
  return {
    dateFrom: dateFrom || dateTo || todayDateOnly(),
    dateTo: dateTo || dateFrom || todayDateOnly(),
  };
}

function buildRangeClause(columnName, filters = {}) {
  const { dateFrom, dateTo } = normalizeDateRange(filters);
  const sql = `DATE(${columnName}) >= ? AND DATE(${columnName}) <= ?`;
  return {
    sql,
    params: [dateFrom, dateTo],
    dateFrom,
    dateTo,
  };
}

async function getDailyCaseOpenings(orgId, filters = {}) {
  const range = buildRangeClause('c.created_at', filters);
  const [rows] = await pool.execute(
    `
      SELECT
        DATE(c.created_at) AS report_date,
        c.case_number,
        c.case_type,
        c.priority,
        c.intake_channel,
        ws.name AS status_name,
        u.name AS case_owner
      FROM cases c
      LEFT JOIN workflow_states ws ON ws.id = c.status_id
      LEFT JOIN users u ON u.id = c.case_owner_id
      WHERE c.org_id = ?
        AND c.is_deleted = 0
        AND ${range.sql}
      ORDER BY c.created_at DESC, c.id DESC
    `,
    [orgId, ...range.params]
  );
  return rows;
}

async function getDailyCaseClosures(orgId, filters = {}) {
  const range = buildRangeClause('cat.timestamp', filters);
  const [rows] = await pool.execute(
    `
      SELECT
        DATE(cat.timestamp) AS report_date,
        c.case_number,
        c.case_type,
        ws.name AS closed_status,
        u.name AS closed_by
      FROM case_audit_trail cat
      JOIN cases c ON c.id = cat.case_id
      LEFT JOIN workflow_states ws ON ws.id = CAST(cat.new_value AS UNSIGNED)
      LEFT JOIN users u ON u.id = cat.user_id
      WHERE c.org_id = ?
        AND cat.action_type = 'STATUS_CHANGED'
        AND cat.field_name = 'status_id'
        AND LOWER(COALESCE(ws.name, '')) LIKE 'closed%'
        AND ${range.sql}
      ORDER BY cat.timestamp DESC, cat.id DESC
    `,
    [orgId, ...range.params]
  );
  return rows;
}

async function getDailyCaseSummary(orgId, filters = {}) {
  const range = normalizeDateRange(filters);
  const [createdRows] = await pool.execute(
    `
      SELECT
        COUNT(*) AS openings,
        SUM(CASE WHEN case_type = 'MI' THEN 1 ELSE 0 END) AS mi_openings,
        SUM(CASE WHEN case_type = 'AE' THEN 1 ELSE 0 END) AS ae_openings,
        SUM(CASE WHEN case_type = 'PC' THEN 1 ELSE 0 END) AS pc_openings
      FROM cases
      WHERE org_id = ?
        AND is_deleted = 0
        AND DATE(created_at) >= ?
        AND DATE(created_at) <= ?
    `,
    [orgId, range.dateFrom, range.dateTo]
  );

  const [closedRows] = await pool.execute(
    `
      SELECT COUNT(*) AS closures
      FROM case_audit_trail cat
      JOIN cases c ON c.id = cat.case_id
      LEFT JOIN workflow_states ws ON ws.id = CAST(cat.new_value AS UNSIGNED)
      WHERE c.org_id = ?
        AND cat.action_type = 'STATUS_CHANGED'
        AND cat.field_name = 'status_id'
        AND LOWER(COALESCE(ws.name, '')) LIKE 'closed%'
        AND DATE(cat.timestamp) >= ?
        AND DATE(cat.timestamp) <= ?
    `,
    [orgId, range.dateFrom, range.dateTo]
  );

  const [backlogRows] = await pool.execute(
    `
      SELECT
        COUNT(*) AS open_backlog,
        SUM(CASE WHEN case_type = 'MI' THEN 1 ELSE 0 END) AS open_mi_cases,
        SUM(CASE WHEN case_type = 'AE' THEN 1 ELSE 0 END) AS open_ae_cases,
        SUM(CASE WHEN case_type = 'PC' THEN 1 ELSE 0 END) AS open_pc_cases
      FROM cases c
      LEFT JOIN workflow_states ws ON ws.id = c.status_id
      WHERE c.org_id = ?
        AND c.is_deleted = 0
        AND LOWER(COALESCE(ws.name, '')) NOT LIKE 'closed%'
    `,
    [orgId]
  );

  return [{
    date_from: range.dateFrom,
    date_to: range.dateTo,
    openings: Number(createdRows[0]?.openings || 0),
    closures: Number(closedRows[0]?.closures || 0),
    open_backlog: Number(backlogRows[0]?.open_backlog || 0),
    mi_openings: Number(createdRows[0]?.mi_openings || 0),
    ae_openings: Number(createdRows[0]?.ae_openings || 0),
    pc_openings: Number(createdRows[0]?.pc_openings || 0),
    open_mi_cases: Number(backlogRows[0]?.open_mi_cases || 0),
    open_ae_cases: Number(backlogRows[0]?.open_ae_cases || 0),
    open_pc_cases: Number(backlogRows[0]?.open_pc_cases || 0),
  }];
}

async function getTransmissionSlaReport(orgId, filters = {}) {
  const { dateFrom, dateTo } = normalizeDateRange(filters);
  const useDateFilter = !!(filters.date || filters.date_from || filters.date_to);
  const params = [orgId, orgId];
  if (useDateFilter) params.push(dateFrom, dateTo);

  const [rows] = await pool.execute(
    `
      SELECT
        transmission_type,
        case_number,
        assigned_name,
        priority,
        due_date,
        status,
        sla_status,
        escalation_level
      FROM (
        SELECT
          'AE' AS transmission_type,
          c.case_number,
          COALESCE(t.assigned_name, u.name) AS assigned_name,
          t.priority,
          t.due_date,
          t.status,
          COALESCE(t.sla_status, 'untracked') AS sla_status,
          COALESCE(t.escalation_level, 0) AS escalation_level,
          t.updated_at
        FROM case_ae_transmissions t
        JOIN cases c ON c.id = t.case_id
        LEFT JOIN users u ON u.id = t.assigned_to
        WHERE c.org_id = ? AND c.is_deleted = 0
        UNION ALL
        SELECT
          'PC' AS transmission_type,
          c.case_number,
          COALESCE(t.assigned_name, u.name) AS assigned_name,
          t.priority,
          t.due_date,
          t.status,
          COALESCE(t.sla_status, 'untracked') AS sla_status,
          COALESCE(t.escalation_level, 0) AS escalation_level,
          t.updated_at
        FROM case_pc_transmissions t
        JOIN cases c ON c.id = t.case_id
        LEFT JOIN users u ON u.id = t.assigned_to
        WHERE c.org_id = ? AND c.is_deleted = 0
      ) tx
      ${useDateFilter ? 'WHERE DATE(COALESCE(due_date, updated_at)) >= ? AND DATE(COALESCE(due_date, updated_at)) <= ?' : ''}
      ORDER BY
        FIELD(sla_status, 'breached', 'at_risk', 'on_track', 'closed', 'untracked'),
        due_date ASC,
        updated_at DESC
    `,
    params
  );
  return rows.map((row) => ({ ...row, date_from: dateFrom, date_to: dateTo }));
}

async function getLegacyCaseSummary(orgId, filters = {}) {
  const params = [orgId];
  let where = 'c.org_id = ? AND c.is_deleted = 0';

  if (filters.case_type) {
    where += ' AND c.case_type = ?';
    params.push(filters.case_type);
  }

  if (filters.status_id) {
    where += ' AND c.status_id = ?';
    params.push(Number(filters.status_id));
  }

  if (filters.date_range_days) {
    const days = Number(filters.date_range_days);
    if (!Number.isNaN(days) && days > 0) {
      where += ' AND c.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)';
      params.push(days);
    }
  }

  const [rows] = await pool.execute(
    `
      SELECT
        c.case_number,
        c.case_type,
        c.priority,
        c.intake_channel,
        c.date_received,
        c.created_at,
        c.status_id,
        u.name AS case_owner
      FROM cases c
      LEFT JOIN users u ON c.case_owner_id = u.id
      WHERE ${where}
      ORDER BY c.created_at DESC
    `,
    params
  );
  return rows;
}

async function getDatasetByReportKey(reportKey, orgId, filters = {}) {
  switch (reportKey) {
    case 'daily-case-openings':
      return getDailyCaseOpenings(orgId, filters);
    case 'daily-case-closures':
      return getDailyCaseClosures(orgId, filters);
    case 'daily-case-summary':
      return getDailyCaseSummary(orgId, filters);
    case 'transmission-sla':
      return getTransmissionSlaReport(orgId, filters);
    case 'case-summary':
    default:
      return getLegacyCaseSummary(orgId, filters);
  }
}

module.exports = {
  getDailyCaseOpenings,
  getDailyCaseClosures,
  getDailyCaseSummary,
  getTransmissionSlaReport,
  getLegacyCaseSummary,
  getDatasetByReportKey,
};
