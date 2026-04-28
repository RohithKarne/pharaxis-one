'use strict';

const pool = require('../database/db');
const { hydrateInquiryRows } = require('./inboxGovernanceService');

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
        c.id AS case_id,
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
  return rows.map((row) => ({
    ...row,
    __drill_route: row.case_id ? `/cases/${row.case_id}` : null,
  }));
}

async function getDailyCaseClosures(orgId, filters = {}) {
  const range = buildRangeClause('cat.timestamp', filters);
  const [rows] = await pool.execute(
    `
      SELECT
        c.id AS case_id,
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
  return rows.map((row) => ({
    ...row,
    __drill_route: row.case_id ? `/cases/${row.case_id}` : null,
  }));
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
        case_id,
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
          c.id AS case_id,
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
          c.id AS case_id,
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
  return rows.map((row) => ({
    ...row,
    date_from: dateFrom,
    date_to: dateTo,
    __drill_route: row.case_id ? `/cases/${row.case_id}` : null,
  }));
}

function buildInquiryRangeClause(filters = {}) {
  const { dateFrom, dateTo } = normalizeDateRange(filters);
  return {
    sql: `DATE(COALESCE(STR_TO_DATE(i.received_at, '%Y-%m-%d %H:%i:%s'), i.created_at)) >= ? AND DATE(COALESCE(STR_TO_DATE(i.received_at, '%Y-%m-%d %H:%i:%s'), i.created_at)) <= ?`,
    params: [dateFrom, dateTo],
    dateFrom,
    dateTo,
  };
}

async function loadInboxRows(orgId, filters = {}) {
  const range = buildInquiryRangeClause(filters);
  const [rows] = await pool.execute(
    `SELECT
       i.*,
       COALESCE(i.mailbox_name, ea.account_name) AS mailbox_name
     FROM inquiries i
     LEFT JOIN email_accounts ea ON ea.id = i.email_account_id
     WHERE i.org_id = ?
       AND ${range.sql}
     ORDER BY COALESCE(STR_TO_DATE(i.received_at, '%Y-%m-%d %H:%i:%s'), i.created_at) DESC, i.id DESC`,
    [orgId, ...range.params]
  );
  return hydrateInquiryRows(rows);
}

async function getDailyOperationsPack(orgId, filters = {}) {
  const summaryRows = await getDailyCaseSummary(orgId, filters);
  const summary = summaryRows[0] || {};
  const inboxRows = await loadInboxRows(orgId, filters);
  const actionable = inboxRows.filter((row) => row.status !== 'outbox');
  const openInbox = actionable.filter((row) => !['linked', 'converted', 'no_action', 'closed'].includes(String(row.triage_state || '').toLowerCase()));

  return [
    {
      section: 'Cases',
      metric: 'Daily openings',
      value: Number(summary.openings || 0),
      detail: `MI ${Number(summary.mi_openings || 0)} | AE ${Number(summary.ae_openings || 0)} | PC ${Number(summary.pc_openings || 0)}`,
      __drill_route: '/reports',
      __drill_state: { activeGroup: 'detail', activeReport: 'daily-case-openings', appliedFilters: filters },
    },
    {
      section: 'Cases',
      metric: 'Daily closures',
      value: Number(summary.closures || 0),
      detail: `Open backlog ${Number(summary.open_backlog || 0)}`,
      __drill_route: '/reports',
      __drill_state: { activeGroup: 'detail', activeReport: 'daily-case-closures', appliedFilters: filters },
    },
    {
      section: 'Cases',
      metric: 'Open backlog',
      value: Number(summary.open_backlog || 0),
      detail: `MI ${Number(summary.open_mi_cases || 0)} | AE ${Number(summary.open_ae_cases || 0)} | PC ${Number(summary.open_pc_cases || 0)}`,
      __drill_route: '/reports',
      __drill_state: { activeGroup: 'operational', activeReport: 'daily-case-summary', appliedFilters: filters },
    },
    {
      section: 'Inbox',
      metric: 'Inbox intake',
      value: actionable.length,
      detail: `${openInbox.length} active work items`,
      __drill_route: '/inbox',
      __drill_state: { reportFilters: {} },
    },
    {
      section: 'Inbox',
      metric: 'First-touch breaches',
      value: actionable.filter((row) => row.first_touch_sla_status === 'breached' && !row.first_touched_at).length,
      detail: 'Items not touched within SLA',
      __drill_route: '/inbox',
      __drill_state: { reportFilters: { firstTouchSla: 'breached' } },
    },
    {
      section: 'Inbox',
      metric: 'Response breaches',
      value: actionable.filter((row) => row.response_sla_status === 'breached' && row.first_touched_at && !row.first_response_at).length,
      detail: 'Touched items with overdue response',
      __drill_route: '/inbox',
      __drill_state: { reportFilters: { responseSla: 'breached' } },
    },
    {
      section: 'Inbox',
      metric: 'Unassigned items',
      value: actionable.filter((row) => !row.assigned_to).length,
      detail: 'Operational inbox items without owner',
      __drill_route: '/inbox',
      __drill_state: { reportFilters: { assignee: '__UNASSIGNED__' } },
    },
  ];
}

async function getInboxPerformanceReport(orgId, filters = {}) {
  const rows = await loadInboxRows(orgId, filters);
  const groups = new Map();

  rows
    .filter((row) => row.status !== 'outbox')
    .forEach((row) => {
      const assignee = row.assigned_to || 'Unassigned';
      const queueName = row.queue_name || 'Unrouted';
      const key = `${queueName}::${assignee}`;
      if (!groups.has(key)) {
        groups.set(key, {
          queue_name: queueName,
          assignee,
          total_items: 0,
          unread_items: 0,
          active_items: 0,
          converted_or_linked: 0,
          closed_or_no_action: 0,
          first_touch_breached: 0,
          response_breached: 0,
          __drill_route: '/inbox',
          __drill_state: {
            reportFilters: {
              queueName,
              assignee: assignee === 'Unassigned' ? '__UNASSIGNED__' : assignee,
            },
          },
        });
      }
      const group = groups.get(key);
      group.total_items += 1;
      group.unread_items += row.is_read ? 0 : 1;
      group.active_items += ['new', 'in_review'].includes(String(row.triage_state || '').toLowerCase()) ? 1 : 0;
      group.converted_or_linked += ['converted', 'linked'].includes(String(row.triage_state || '').toLowerCase()) ? 1 : 0;
      group.closed_or_no_action += ['closed', 'no_action'].includes(String(row.triage_state || '').toLowerCase()) ? 1 : 0;
      group.first_touch_breached += row.first_touch_sla_status === 'breached' && !row.first_touched_at ? 1 : 0;
      group.response_breached += row.response_sla_status === 'breached' && row.first_touched_at && !row.first_response_at ? 1 : 0;
    });

  return [...groups.values()].sort((a, b) => b.total_items - a.total_items || a.queue_name.localeCompare(b.queue_name));
}

async function getInboxSlaReport(orgId, filters = {}) {
  const rows = await loadInboxRows(orgId, filters);
  return rows
    .filter((row) => row.status !== 'outbox')
    .map((row) => ({
      inquiry_id: row.id,
      queue_name: row.queue_name,
      triage_state: row.triage_state,
      sender: row.sender,
      subject: row.subject,
      assigned_to: row.assigned_to || 'Unassigned',
      first_touch_sla_status: row.first_touch_sla_status,
      response_sla_status: row.response_sla_status,
      received_at: row.received_at,
      first_touch_due_at: row.first_touch_due_at,
      response_due_at: row.response_due_at,
      age_hours: row.age_hours,
      __drill_route: '/inbox',
      __drill_state: {
        selectInquiryId: row.id,
        reportFilters: {
          queueName: row.queue_name,
          triageState: row.triage_state,
        },
      },
    }))
    .sort((a, b) => {
      const statusRank = { breached: 0, at_risk: 1, on_track: 2, met: 3, untracked: 4 };
      const aRank = Math.min(statusRank[a.first_touch_sla_status] ?? 4, statusRank[a.response_sla_status] ?? 4);
      const bRank = Math.min(statusRank[b.first_touch_sla_status] ?? 4, statusRank[b.response_sla_status] ?? 4);
      return aRank - bRank || b.age_hours - a.age_hours;
    });
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
    case 'daily-operations-pack':
      return getDailyOperationsPack(orgId, filters);
    case 'inbox-performance':
      return getInboxPerformanceReport(orgId, filters);
    case 'inbox-sla':
      return getInboxSlaReport(orgId, filters);
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
  getDailyOperationsPack,
  getInboxPerformanceReport,
  getInboxSlaReport,
  getTransmissionSlaReport,
  getLegacyCaseSummary,
  getDatasetByReportKey,
};
