'use strict';

/**
 * reportDatasetService.js — the data behind every report in the library
 * (reports review, Saad 2026-10-14).
 *
 * Rules every dataset follows, so the same question gets the same answer as the
 * screen it comes from:
 *   - a case's day 0 is its Date Received, not the day the row was created;
 *   - closed means a workflow state marked closed, not a name starting "Closed";
 *   - an MI is answered when its first letter is sent (the MI status was left
 *     Open on most answered enquiries);
 *   - an MI is due on its answer-by date, or Date Received plus the routine or
 *     urgent working days in MI Response Settings when none was stored;
 *   - an AE/PC hand-off is due on day 0 plus the working days on Transmission
 *     Setup, and is sent on its first send to the safety or quality system
 *     (caseHandoffService);
 *   - a case's product is the one its letters name (caseProductName).
 *
 * A period comes as date_from/date_to, or as a named period (last_30_days ...);
 * each report has its own default. Lists stop at ROW_CAP rows.
 */

const pool = require('../database/db');
const { hydrateInquiryRows } = require('./inboxGovernanceService');
const { CASE_PRODUCT_SQL } = require('./caseProductName');
const { addWorkingDays, workingDaysBetween } = require('../utils/workingDays');
const { getSettings: getMiSettings } = require('./miResponseSettings');
const { handoffDays } = require('./transmissionTargets');
const { folderFilterSql } = require('./cmFolderAccess');
const { resolveActivityScope } = require('./accessConfigurationService');
const { getUserModules } = require('../utils/userModules');
const { hasGlobalAdminScope } = require('../utils/adminScope');

const ROW_CAP = 10000;

// ── Periods ─────────────────────────────────────────────────────────────────

const PERIODS = Object.freeze({
  today: 'Today',
  yesterday: 'Yesterday',
  last_7_days: 'Last 7 days',
  last_30_days: 'Last 30 days',
  last_90_days: 'Last 90 days',
  this_month: 'This month',
  last_month: 'Last month',
  this_year: 'This year',
});

function normalizeDateOnly(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const dt = new Date(text);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

const ymd = (d) => d.toISOString().slice(0, 10);

function periodRange(period, now = new Date()) {
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (n) => { const d = new Date(t); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
  switch (period) {
    case 'today': return [ymd(t), ymd(t)];
    case 'yesterday': return [day(-1), day(-1)];
    case 'last_7_days': return [day(-6), ymd(t)];
    case 'last_30_days': return [day(-29), ymd(t)];
    case 'last_90_days': return [day(-89), ymd(t)];
    case 'this_month': return [ymd(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))), ymd(t)];
    case 'last_month': return [
      ymd(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1))),
      ymd(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0))),
    ];
    case 'this_year': return [`${t.getUTCFullYear()}-01-01`, ymd(t)];
    default: return null;
  }
}

// Dates typed win over a named period; the report's own default fills the rest.
function resolvePeriod(filters = {}, fallback = 'last_30_days') {
  let from = normalizeDateOnly(filters.date_from || filters.date);
  let to = normalizeDateOnly(filters.date_to || filters.date);
  if (from || to) {
    from = from || to; to = to || from;
    return from <= to ? { dateFrom: from, dateTo: to } : { dateFrom: to, dateTo: from };
  }
  const [dateFrom, dateTo] = periodRange(filters.period) || periodRange(fallback);
  return { dateFrom, dateTo };
}

// A column inside [from, to] whole days, whether it holds a date or a time.
function inRange(column) {
  return `${column} >= ? AND ${column} < DATE_ADD(?, INTERVAL 1 DAY)`;
}

const today = () => ymd(new Date());
const dateText = (v) => (v ? String(v instanceof Date ? v.toISOString() : v).slice(0, 10) : null);
const caseRoute = (id) => (id ? `/cases/${id}` : null);

// ── Case filters ────────────────────────────────────────────────────────────

// The cases the viewer may see, by the case list's rule (access review P4,
// Saad 2026-10-14): everything, only those they own or created, or none when
// they have no Cases access. Set by getDatasetByReportKey, never by the caller.
function caseScopeSql(filters = {}) {
  const scope = filters.__case_scope;
  if (scope === undefined) return { sql: '', params: [] };
  if (!scope) return { sql: ' AND 1 = 0', params: [] };
  return { sql: ' AND (c.case_owner_id = ? OR c.created_by = ?)', params: [scope, scope] };
}

const scopeOnly = (filters = {}) => ({ __case_scope: filters.__case_scope });

// Type, owner, channel and product, as chosen on the filter bar, within the
// viewer's case scope.
function caseFilterSql(filters = {}, { productSql = `(${CASE_PRODUCT_SQL})` } = {}) {
  const scope = caseScopeSql(filters);
  const parts = [];
  const params = [];
  const type = String(filters.case_type || '').toUpperCase();
  if (['MI', 'AE', 'PC'].includes(type)) { parts.push('c.case_type = ?'); params.push(type); }
  if (filters.owner_id === 'unassigned') parts.push('c.case_owner_id IS NULL');
  else if (Number(filters.owner_id)) { parts.push('c.case_owner_id = ?'); params.push(Number(filters.owner_id)); }
  if (filters.intake_channel) { parts.push('LOWER(c.intake_channel) = LOWER(?)'); params.push(String(filters.intake_channel)); }
  if (filters.product) { parts.push(`${productSql} = ?`); params.push(String(filters.product)); }
  return { sql: scope.sql + parts.map((p) => ` AND ${p}`).join(''), params: [...scope.params, ...params] };
}

const OPEN_CASE_SQL = 'COALESCE(ws.is_closed, 0) = 0 AND c.merged_into_case_id IS NULL';

// ── Cases ───────────────────────────────────────────────────────────────────

async function getCasesReceived(orgId, filters = {}) {
  const range = resolvePeriod(filters, 'last_7_days');
  const f = caseFilterSql(filters);
  const [rows] = await pool.execute(
    `SELECT c.id AS case_id, DATE_FORMAT(c.date_received, '%Y-%m-%d') AS date_received, c.case_number, c.case_type,
            ${CASE_PRODUCT_SQL} AS product, c.priority, c.intake_channel, ws.name AS status_name, u.name AS case_owner
       FROM cases c
       LEFT JOIN workflow_states ws ON ws.id = c.status_id
       LEFT JOIN users u ON u.id = c.case_owner_id
      WHERE c.org_id = ? AND c.is_deleted = 0 AND ${inRange('c.date_received')}${f.sql}
      ORDER BY c.date_received DESC, c.id DESC
      LIMIT ${ROW_CAP}`,
    [orgId, range.dateFrom, range.dateTo, ...f.params]
  );
  return rows.map(({ case_id: caseId, ...row }) => ({ ...row, __drill_route: caseRoute(caseId) }));
}

// Each case's last move into a closed state within the period.
async function loadClosures(orgId, range, filters = {}) {
  const f = caseFilterSql(filters);
  const [rows] = await pool.execute(
    `SELECT c.id AS case_id, cat.timestamp AS closed_at, c.case_number, c.case_type, ${CASE_PRODUCT_SQL} AS product,
            ws.name AS closed_status, COALESCE(u.name, cat.user_name) AS closed_by, c.date_received
       FROM case_audit_trail cat
       JOIN cases c ON c.id = cat.case_id
       JOIN workflow_states ws ON ws.id = CAST(cat.new_value AS UNSIGNED) AND ws.is_closed = 1
       LEFT JOIN users u ON u.id = cat.user_id
      WHERE c.org_id = ? AND c.is_deleted = 0
        AND cat.action_type = 'STATUS_CHANGED' AND cat.field_name = 'status_id'
        AND ${inRange('cat.timestamp')}${f.sql}
      ORDER BY cat.timestamp DESC, cat.id DESC`,
    [orgId, range.dateFrom, range.dateTo, ...f.params]
  );
  const seen = new Set();
  return rows.filter((row) => (seen.has(row.case_id) ? false : seen.add(row.case_id)));
}

async function getCasesClosed(orgId, filters = {}) {
  const range = resolvePeriod(filters, 'last_7_days');
  const rows = await loadClosures(orgId, range, filters);
  return rows.slice(0, ROW_CAP).map((row) => ({
    closed_on: dateText(row.closed_at),
    case_number: row.case_number,
    case_type: row.case_type,
    product: row.product,
    closed_status: row.closed_status,
    closed_by: row.closed_by,
    days_open: row.date_received ? Math.max(0, Math.round((new Date(dateText(row.closed_at)) - new Date(dateText(row.date_received))) / 86400000)) : null,
    __drill_route: caseRoute(row.case_id),
  }));
}

function bucketOf(date, groupBy) {
  const d = new Date(`${date}T00:00:00Z`);
  if (groupBy === 'month') return date.slice(0, 7);
  if (groupBy === 'week') { d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return ymd(d); }
  return date;
}

function bucketsBetween(from, to, groupBy) {
  const out = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length < 1000) {
    const key = bucketOf(ymd(d), groupBy);
    if (out[out.length - 1] !== key) out.push(key);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// Received and closed per day, week or month — case volume and trend.
async function getCaseVolume(orgId, filters = {}) {
  const range = resolvePeriod(filters, 'last_30_days');
  const groupBy = ['week', 'month'].includes(filters.group_by) ? filters.group_by : 'day';
  const f = caseFilterSql(filters);
  const [received] = await pool.execute(
    `SELECT DATE_FORMAT(c.date_received, '%Y-%m-%d') AS d, c.case_type, COUNT(*) AS n
       FROM cases c
      WHERE c.org_id = ? AND c.is_deleted = 0 AND ${inRange('c.date_received')}${f.sql}
      GROUP BY d, c.case_type`,
    [orgId, range.dateFrom, range.dateTo, ...f.params]
  );
  const closures = await loadClosures(orgId, range, filters);
  const rows = new Map(bucketsBetween(range.dateFrom, range.dateTo, groupBy).map((key) => [key, {
    period: key, received: 0, mi_received: 0, ae_received: 0, pc_received: 0, closed: 0,
  }]));
  received.forEach((r) => {
    const row = rows.get(bucketOf(r.d, groupBy));
    if (!row) return;
    row.received += Number(r.n);
    const key = `${String(r.case_type).toLowerCase()}_received`;
    if (key in row) row[key] += Number(r.n);
  });
  closures.forEach((r) => {
    const row = rows.get(bucketOf(dateText(r.closed_at), groupBy));
    if (row) row.closed += 1;
  });
  return [...rows.values()];
}

function ageBand(days) {
  if (days <= 2) return '0-2 days';
  if (days <= 5) return '3-5 days';
  if (days <= 10) return '6-10 days';
  if (days <= 30) return '11-30 days';
  return 'Over 30 days';
}

// Every open case today, oldest first. Not a period report.
async function getOpenBacklog(orgId, filters = {}) {
  const f = caseFilterSql(filters);
  const [rows] = await pool.execute(
    `SELECT c.id AS case_id, c.case_number, c.case_type, ${CASE_PRODUCT_SQL} AS product, c.priority,
            ws.name AS status_name, u.name AS case_owner, DATE_FORMAT(c.date_received, '%Y-%m-%d') AS date_received,
            DATEDIFF(CURDATE(), c.date_received) AS age_days
       FROM cases c
       LEFT JOIN workflow_states ws ON ws.id = c.status_id
       LEFT JOIN users u ON u.id = c.case_owner_id
      WHERE c.org_id = ? AND c.is_deleted = 0 AND ${OPEN_CASE_SQL}${f.sql}
      ORDER BY c.date_received ASC, c.id ASC
      LIMIT ${ROW_CAP}`,
    [orgId, ...f.params]
  );
  return rows.map(({ case_id: caseId, ...row }) => ({
    ...row,
    age_days: Number(row.age_days || 0),
    age_band: ageBand(Number(row.age_days || 0)),
    __drill_route: caseRoute(caseId),
  }));
}

async function getPossibleDuplicates(orgId, filters = {}) {
  const range = resolvePeriod(filters, 'last_30_days');
  const f = caseFilterSql(filters);
  const [rows] = await pool.execute(
    `SELECT c.id AS case_id, DATE_FORMAT(c.date_received, '%Y-%m-%d') AS date_received, c.case_number, c.case_type,
            ${CASE_PRODUCT_SQL} AS product, d.case_number AS possible_duplicate_of, ws.name AS status_name, u.name AS case_owner
       FROM cases c
       JOIN cases d ON d.id = c.possible_duplicate_of
       LEFT JOIN workflow_states ws ON ws.id = c.status_id
       LEFT JOIN users u ON u.id = c.case_owner_id
      WHERE c.org_id = ? AND c.is_deleted = 0 AND ${inRange('c.date_received')}${f.sql}
      ORDER BY c.date_received DESC, c.id DESC
      LIMIT ${ROW_CAP}`,
    [orgId, range.dateFrom, range.dateTo, ...f.params]
  );
  return rows.map(({ case_id: caseId, ...row }) => ({ ...row, __drill_route: caseRoute(caseId) }));
}

// ── Medical information ─────────────────────────────────────────────────────

// One row per MI question, with its due date, first letter and result.
async function loadMiRows(orgId, range, filters = {}) {
  const f = caseFilterSql({ ...filters, case_type: null }, { productSql: 'p.trade_name' });
  const settings = await getMiSettings(orgId);
  const [rows] = await pool.execute(
    `SELECT mi.id AS mi_id, c.id AS case_id, c.case_number, c.priority, c.intake_channel,
            DATE_FORMAT(c.date_received, '%Y-%m-%d') AS date_received, u.name AS case_owner, c.case_owner_id,
            COALESCE(ws.is_closed, 0) AS is_closed, p.trade_name AS product, mi.mi_category, mi.is_off_label, mi.is_solicited,
            mi.off_label_indication, mi.promo_review_status, mi.ae_pc_screening,
            DATE_FORMAT(mi.response_required_by, '%Y-%m-%d') AS answer_by, cc.case_number AS converted_case,
            (SELECT MIN(r.sent_at) FROM case_mi_responses r
              WHERE r.case_id = c.id AND r.response_status = 'SENT' AND r.voided_at IS NULL
                AND (r.mi_tab_id = mi.id OR r.mi_tab_id IS NULL)) AS first_sent_at,
            (SELECT lc.case_number FROM case_links l
               JOIN cases lc ON lc.id = IF(l.case_id = c.id, l.linked_case_id, l.case_id)
              WHERE (l.case_id = c.id OR l.linked_case_id = c.id) AND lc.case_type IN ('AE', 'PC') AND lc.is_deleted = 0
              LIMIT 1) AS linked_case
       FROM case_mi mi
       JOIN cases c ON c.id = mi.case_id
       LEFT JOIN products p ON p.id = mi.product_id
       LEFT JOIN cases cc ON cc.id = mi.converted_to_case_id
       LEFT JOIN workflow_states ws ON ws.id = c.status_id
       LEFT JOIN users u ON u.id = c.case_owner_id
      WHERE c.org_id = ? AND c.is_deleted = 0${range ? ` AND ${inRange('c.date_received')}` : ''}${f.sql}
      ORDER BY c.date_received DESC, c.id DESC, mi.tab_index`,
    [orgId, ...(range ? [range.dateFrom, range.dateTo] : []), ...f.params]
  );
  const now = today();
  return rows.map((row) => {
    const urgent = String(row.priority || '').toLowerCase() === 'urgent';
    const days = urgent ? settings.urgent_days : settings.routine_days;
    const due = row.answer_by || (row.date_received && days != null ? addWorkingDays(row.date_received, days) : null);
    const sent = dateText(row.first_sent_at);
    let result;
    if (sent) result = !due ? 'Answered' : sent <= due ? 'On time' : 'Late';
    else if (Number(row.is_closed)) result = 'Closed without a letter';
    else result = due && now > due ? 'Overdue' : 'Open';
    return {
      ...row,
      due,
      sent,
      result,
      working_days: sent && row.date_received ? workingDaysBetween(row.date_received, sent) : null,
    };
  });
}

async function getMiResponseTimes(orgId, filters = {}) {
  const range = resolvePeriod(filters, 'last_30_days');
  return (await loadMiRows(orgId, range, filters)).slice(0, ROW_CAP).map((row) => ({
    case_number: row.case_number,
    product: row.product,
    mi_category: row.mi_category,
    priority: row.priority,
    date_received: row.date_received,
    answer_by: row.due,
    letter_sent: row.sent,
    working_days: row.working_days,
    result: row.result,
    case_owner: row.case_owner,
    __drill_route: caseRoute(row.case_id),
  }));
}

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const GROUP_LABEL = {
  product: (r) => r.product || 'No product',
  category: (r) => r.mi_category || 'No category',
  channel: (r) => r.intake_channel || 'Unknown',
  month: (r) => String(r.date_received || '').slice(0, 7),
  owner: (r) => r.case_owner || 'Unassigned',
  none: () => 'All enquiries',
};

// On-time rate: answered on or before the due date, of those answered or due.
async function getMiResponsePerformance(orgId, filters = {}) {
  const range = resolvePeriod(filters, 'last_30_days');
  const groupBy = GROUP_LABEL[filters.group_by] ? filters.group_by : 'none';
  const groups = new Map();
  (await loadMiRows(orgId, range, filters)).forEach((row) => {
    const key = GROUP_LABEL[groupBy](row);
    if (!groups.has(key)) groups.set(key, { group: key, enquiries: 0, answered: 0, on_time: 0, late: 0, overdue: 0, open: 0, days: [] });
    const g = groups.get(key);
    g.enquiries += 1;
    if (row.sent) { g.answered += 1; g.days.push(row.working_days); }
    if (row.result === 'On time') g.on_time += 1;
    if (row.result === 'Late') g.late += 1;
    if (row.result === 'Overdue') g.overdue += 1;
    if (row.result === 'Open') g.open += 1;
  });
  return [...groups.values()]
    .sort((a, b) => b.enquiries - a.enquiries || String(a.group).localeCompare(String(b.group)))
    .map(({ days, ...g }) => {
      const measured = g.on_time + g.late + g.overdue;
      return {
        ...g,
        on_time_pct: measured ? Math.round((g.on_time / measured) * 1000) / 10 : null,
        median_working_days: median(days),
      };
    });
}

async function getMiEnquiryMix(orgId, filters = {}) {
  const range = resolvePeriod(filters, 'last_30_days');
  const groupBy = ['product', 'category', 'channel', 'month'].includes(filters.group_by) ? filters.group_by : 'product';
  const rows = await loadMiRows(orgId, range, filters);
  const groups = new Map();
  rows.forEach((row) => {
    const key = GROUP_LABEL[groupBy](row);
    if (!groups.has(key)) groups.set(key, { group: key, enquiries: 0, off_label: 0, answered: 0 });
    const g = groups.get(key);
    g.enquiries += 1;
    g.off_label += row.is_off_label ? 1 : 0;
    g.answered += row.sent ? 1 : 0;
  });
  return [...groups.values()]
    .sort((a, b) => b.enquiries - a.enquiries || String(a.group).localeCompare(String(b.group)))
    .map((g) => ({ ...g, share_pct: rows.length ? Math.round((g.enquiries / rows.length) * 1000) / 10 : 0 }));
}

async function getMiOffLabel(orgId, filters = {}) {
  const range = resolvePeriod(filters, 'last_90_days');
  return (await loadMiRows(orgId, range, filters)).filter((row) => Number(row.is_off_label) === 1).map((row) => ({
    case_number: row.case_number,
    date_received: row.date_received,
    product: row.product,
    off_label_indication: row.off_label_indication,
    solicited: row.is_solicited == null ? null : (Number(row.is_solicited) ? 'Yes' : 'No'),
    letter_sent: row.sent,
    promo_review: row.promo_review_status,
    case_owner: row.case_owner,
    __drill_route: caseRoute(row.case_id),
  }));
}

// MI questions where a possible adverse event or complaint was not carried
// into an AE or PC case, or a letter went out with the screening unanswered.
async function getMiSafetyCheck(orgId, filters = {}) {
  const range = resolvePeriod(filters, 'last_90_days');
  const out = [];
  (await loadMiRows(orgId, range, filters)).forEach((row) => {
    const screening = String(row.ae_pc_screening || '').toLowerCase();
    let issue = null;
    if (screening === 'yes' && !row.converted_case && !row.linked_case) issue = 'Mentions an AE or complaint; no AE/PC case';
    else if (!screening && row.sent) issue = 'Letter sent; screening not answered';
    if (!issue) return;
    out.push({
      case_number: row.case_number,
      date_received: row.date_received,
      product: row.product,
      screening: screening ? 'Yes' : 'Not answered',
      letter_sent: row.sent,
      issue,
      case_owner: row.case_owner,
      __drill_route: caseRoute(row.case_id),
    });
  });
  return out;
}

// ── Safety and quality ──────────────────────────────────────────────────────

const AWARENESS_SQL = `COALESCE(
  (SELECT g.date_of_awareness FROM case_ae_versions v JOIN case_ae_general g ON g.version_id = v.id
    WHERE v.case_id = c.id AND g.date_of_awareness IS NOT NULL ORDER BY v.version_number DESC LIMIT 1),
  c.awareness_date, c.date_received)`;

async function getHandoffTimeliness(orgId, filters = {}) {
  const range = resolvePeriod(filters, 'last_30_days');
  const type = String(filters.case_type || '').toUpperCase();
  const f = caseFilterSql({ ...filters, case_type: ['AE', 'PC'].includes(type) ? type : null });
  const [rows] = await pool.execute(
    `SELECT c.id AS case_id, c.case_number, c.case_type, ${CASE_PRODUCT_SQL} AS product,
            DATE_FORMAT(${AWARENESS_SQL}, '%Y-%m-%d') AS day_0, u.name AS case_owner,
            (SELECT MIN(t.timestamp) FROM transmission_audit_trail t
              WHERE t.case_id = c.id AND UPPER(t.status) = 'SENT' AND t.target_system <> 'MI Email') AS first_sent_at
       FROM cases c
       LEFT JOIN users u ON u.id = c.case_owner_id
      WHERE c.org_id = ? AND c.is_deleted = 0 AND c.case_type IN ('AE', 'PC') AND ${inRange('c.date_received')}${f.sql}
      ORDER BY c.date_received DESC, c.id DESC
      LIMIT ${ROW_CAP}`,
    [orgId, range.dateFrom, range.dateTo, ...f.params]
  );
  const days = { AE: await handoffDays(orgId, 'AE'), PC: await handoffDays(orgId, 'PC') };
  const now = today();
  return rows.map((row) => {
    const due = row.day_0 ? addWorkingDays(row.day_0, days[row.case_type]) : null;
    const sent = dateText(row.first_sent_at);
    let result;
    if (!due) result = 'No day 0';
    else if (sent) result = sent <= due ? 'On time' : 'Late';
    else result = now > due ? 'Overdue' : 'Not yet due';
    return {
      case_number: row.case_number,
      case_type: row.case_type,
      product: row.product,
      day_0: row.day_0,
      due,
      sent,
      working_days: sent && row.day_0 ? workingDaysBetween(row.day_0, sent) : null,
      result,
      case_owner: row.case_owner,
      __drill_route: row.case_id ? `/cases/${row.case_id}/transmission` : null,
    };
  });
}

async function getTransmissionSlaReport(orgId, filters = {}) {
  const type = String(filters.case_type || '').toUpperCase();
  const scope = caseScopeSql(filters);
  const [rows] = await pool.execute(
    `SELECT transmission_type, case_id, case_number, assigned_name, priority, due_date, status, sla_status, escalation_level
       FROM (
         SELECT 'AE' AS transmission_type, c.id AS case_id, c.case_number, COALESCE(t.assigned_name, u.name) AS assigned_name,
                t.priority, t.due_date, t.status, COALESCE(t.sla_status, 'untracked') AS sla_status,
                COALESCE(t.escalation_level, 0) AS escalation_level, t.updated_at
           FROM case_ae_transmissions t
           JOIN cases c ON c.id = t.case_id
           LEFT JOIN users u ON u.id = t.assigned_to
          WHERE c.org_id = ? AND c.is_deleted = 0${scope.sql}
            -- Open means what the SLA engine tracks (caseGovernanceService, MIPM-206).
            AND t.status IN ('Pending', 'In Review', 'Accepted')
         UNION ALL
         SELECT 'PC' AS transmission_type, c.id AS case_id, c.case_number, COALESCE(t.assigned_name, u.name) AS assigned_name,
                t.priority, t.due_date, t.status, COALESCE(t.sla_status, 'untracked') AS sla_status,
                COALESCE(t.escalation_level, 0) AS escalation_level, t.updated_at
           FROM case_pc_transmissions t
           JOIN cases c ON c.id = t.case_id
           LEFT JOIN users u ON u.id = t.assigned_to
          WHERE c.org_id = ? AND c.is_deleted = 0${scope.sql}
            AND t.status IN ('Pending', 'Under Investigation')
       ) tx
      ${['AE', 'PC'].includes(type) ? 'WHERE transmission_type = ?' : ''}
      ORDER BY FIELD(sla_status, 'breached', 'at_risk', 'on_track', 'closed', 'untracked'), due_date ASC, updated_at DESC`,
    [orgId, ...scope.params, orgId, ...scope.params, ...(['AE', 'PC'].includes(type) ? [type] : [])]
  );
  return rows.map(({ case_id: caseId, ...row }) => ({ ...row, __drill_route: caseRoute(caseId) }));
}

async function getIcsrSubmissions(orgId, filters = {}) {
  const range = resolvePeriod(filters, 'last_90_days');
  const scope = caseScopeSql(filters);
  const [rows] = await pool.execute(
    `SELECT c.id AS case_id, c.case_number, DATE_FORMAT(r.receive_date, '%Y-%m-%d') AS receive_date, r.report_type,
            r.seriousness_classification AS seriousness, r.follow_up_number, r.status AS icsr_status, r.submission_count,
            DATE_FORMAT(r.last_submitted_at, '%Y-%m-%d') AS last_submitted, DATE_FORMAT(r.last_ack_at, '%Y-%m-%d') AS last_acknowledged,
            r.ack_error_summary AS acknowledgement_errors
       FROM icsr_reports r
       JOIN cases c ON c.id = r.case_id
      WHERE r.org_id = ? AND c.is_deleted = 0 AND ${inRange('r.receive_date')}${scope.sql}
      ORDER BY r.receive_date DESC, r.id DESC
      LIMIT ${ROW_CAP}`,
    [orgId, range.dateFrom, range.dateTo, ...scope.params]
  );
  return rows.map(({ case_id: caseId, ...row }) => ({ ...row, __drill_route: caseRoute(caseId) }));
}

// ── Team ────────────────────────────────────────────────────────────────────

async function getTeamWorkload(orgId, filters = {}) {
  const range = resolvePeriod(filters, 'last_30_days');
  const scope = caseScopeSql(filters);
  const [open] = await pool.execute(
    `SELECT c.case_owner_id AS owner_id, u.name AS owner, c.case_type, COUNT(*) AS n
       FROM cases c
       LEFT JOIN workflow_states ws ON ws.id = c.status_id
       LEFT JOIN users u ON u.id = c.case_owner_id
      WHERE c.org_id = ? AND c.is_deleted = 0 AND ${OPEN_CASE_SQL}${scope.sql}
      GROUP BY c.case_owner_id, u.name, c.case_type`,
    [orgId, ...scope.params]
  );
  const [received] = await pool.execute(
    `SELECT c.case_owner_id AS owner_id, COUNT(*) AS n FROM cases c
      WHERE c.org_id = ? AND c.is_deleted = 0 AND ${inRange('c.date_received')}${scope.sql}
      GROUP BY c.case_owner_id`,
    [orgId, range.dateFrom, range.dateTo, ...scope.params]
  );
  const closures = await loadClosures(orgId, range, scopeOnly(filters));
  const [ownersOfClosed] = closures.length
    ? await pool.query('SELECT id, case_owner_id FROM cases WHERE id IN (?)', [closures.map((r) => r.case_id)])
    : [[]];
  const overdue = (await loadMiRows(orgId, null, scopeOnly(filters))).filter((row) => row.result === 'Overdue');

  const rows = new Map();
  const row = (ownerId, name) => {
    const key = ownerId || 0;
    if (!rows.has(key)) rows.set(key, { owner: name || 'Unassigned', open_cases: 0, open_mi: 0, open_ae: 0, open_pc: 0, mi_overdue: 0, received: 0, closed: 0 });
    return rows.get(key);
  };
  open.forEach((r) => {
    const x = row(r.owner_id, r.owner);
    x.open_cases += Number(r.n);
    const k = `open_${String(r.case_type).toLowerCase()}`;
    if (k in x) x[k] += Number(r.n);
  });
  overdue.forEach((r) => { row(r.case_owner_id, r.case_owner).mi_overdue += 1; });
  received.forEach((r) => { row(r.owner_id, null).received += Number(r.n); });
  ownersOfClosed.forEach((r) => { row(r.case_owner_id, null).closed += 1; });
  // Owners only seen through received or closed counts need their names.
  const unnamed = [...rows.entries()].filter(([k, v]) => k && v.owner === 'Unassigned').map(([k]) => k);
  if (unnamed.length) {
    const [names] = await pool.query('SELECT id, name FROM users WHERE id IN (?)', [unnamed]);
    names.forEach((n) => { rows.get(n.id).owner = n.name; });
  }
  return [...rows.values()].sort((a, b) => b.open_cases - a.open_cases || a.owner.localeCompare(b.owner));
}

// ── Inbox ───────────────────────────────────────────────────────────────────

async function loadInboxRows(orgId, filters = {}) {
  const range = resolvePeriod(filters, 'last_7_days');
  const [rows] = await pool.execute(
    `SELECT i.*, DATE_FORMAT(i.received_at, '%Y-%m-%d %H:%i:%s') AS received_at,
            COALESCE(i.mailbox_name, ea.account_name) AS mailbox_name
       FROM inquiries i
       LEFT JOIN email_accounts ea ON ea.id = i.email_account_id
      WHERE i.org_id = ? AND ${inRange('COALESCE(i.received_at, i.created_at)')}
      ORDER BY COALESCE(i.received_at, i.created_at) DESC, i.id DESC`,
    [orgId, range.dateFrom, range.dateTo]
  );
  return hydrateInquiryRows(rows);
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
          __drill_state: { reportFilters: { queueName, assignee: assignee === 'Unassigned' ? '__UNASSIGNED__' : assignee } },
        });
      }
      const group = groups.get(key);
      const state = String(row.triage_state || '').toLowerCase();
      group.total_items += 1;
      group.unread_items += row.is_read ? 0 : 1;
      group.active_items += ['new', 'in_review'].includes(state) ? 1 : 0;
      group.converted_or_linked += ['converted', 'linked'].includes(state) ? 1 : 0;
      group.closed_or_no_action += ['closed', 'no_action'].includes(state) ? 1 : 0;
      group.first_touch_breached += row.first_touch_sla_status === 'breached' && !row.first_touched_at ? 1 : 0;
      group.response_breached += row.response_sla_status === 'breached' && row.first_touched_at && !row.first_response_at ? 1 : 0;
    });
  return [...groups.values()].sort((a, b) => b.total_items - a.total_items || a.queue_name.localeCompare(b.queue_name));
}

async function getInboxSlaReport(orgId, filters = {}) {
  const rows = await loadInboxRows(orgId, filters);
  const rank = { breached: 0, at_risk: 1, on_track: 2, met: 3, untracked: 4 };
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
      __drill_state: { selectInquiryId: row.id, reportFilters: { queueName: row.queue_name, triageState: row.triage_state } },
    }))
    .sort((a, b) => {
      const ra = Math.min(rank[a.first_touch_sla_status] ?? 4, rank[a.response_sla_status] ?? 4);
      const rb = Math.min(rank[b.first_touch_sla_status] ?? 4, rank[b.response_sla_status] ?? 4);
      return ra - rb || b.age_hours - a.age_hours;
    });
}

// ── Operations summary ──────────────────────────────────────────────────────

async function getOperationsSummary(orgId, filters = {}) {
  const range = resolvePeriod(filters, 'today');
  const { __case_scope: _scope, ...chosen } = filters;
  const scoped = { ...chosen, date_from: range.dateFrom, date_to: range.dateTo };
  const scope = caseScopeSql(filters);
  const [received] = await pool.execute(
    `SELECT c.case_type, COUNT(*) AS n FROM cases c
      WHERE c.org_id = ? AND c.is_deleted = 0 AND ${inRange('c.date_received')}${scope.sql} GROUP BY c.case_type`,
    [orgId, range.dateFrom, range.dateTo, ...scope.params]
  );
  const byType = Object.fromEntries(received.map((r) => [r.case_type, Number(r.n)]));
  const receivedTotal = received.reduce((sum, r) => sum + Number(r.n), 0);
  const closures = await loadClosures(orgId, range, scopeOnly(filters));
  const [[backlog]] = await pool.execute(
    `SELECT COUNT(*) AS n, SUM(DATEDIFF(CURDATE(), c.date_received) > 30) AS old
       FROM cases c LEFT JOIN workflow_states ws ON ws.id = c.status_id
      WHERE c.org_id = ? AND c.is_deleted = 0 AND ${OPEN_CASE_SQL}${scope.sql}`,
    [orgId, ...scope.params]
  );
  const mi = await loadMiRows(orgId, null, scopeOnly(filters));
  const miOverdue = mi.filter((r) => r.result === 'Overdue').length;
  const miAnsweredInPeriod = mi.filter((r) => r.sent && r.sent >= range.dateFrom && r.sent <= range.dateTo);
  const miLate = miAnsweredInPeriod.filter((r) => r.result === 'Late').length;
  const handoffs = await getHandoffTimeliness(orgId, { ...scopeOnly(filters), date_from: '2000-01-01', date_to: range.dateTo });
  const handoffOverdue = handoffs.filter((r) => r.result === 'Overdue').length;
  const inbox = (await loadInboxRows(orgId, scoped)).filter((row) => row.status !== 'outbox');
  const report = (key) => ({ __drill_route: '/reports', __drill_state: { activeReport: key, appliedFilters: scoped } });

  return [
    { section: 'Cases', metric: 'Received', value: receivedTotal, detail: `MI ${byType.MI || 0} · AE ${byType.AE || 0} · PC ${byType.PC || 0}`, ...report('daily-case-openings') },
    { section: 'Cases', metric: 'Closed', value: closures.length, detail: `${range.dateFrom} to ${range.dateTo}`, ...report('daily-case-closures') },
    { section: 'Cases', metric: 'Open now', value: Number(backlog?.n || 0), detail: `${Number(backlog?.old || 0)} open over 30 days`, ...report('open-backlog') },
    { section: 'Medical information', metric: 'Answers overdue', value: miOverdue, detail: 'Past the answer-by date with no letter sent', ...report('mi-response-timeliness') },
    { section: 'Medical information', metric: 'Answered late', value: miLate, detail: `${miAnsweredInPeriod.length} answered in the period`, ...report('mi-response-timeliness') },
    { section: 'Safety and quality', metric: 'Hand-offs overdue', value: handoffOverdue, detail: 'AE/PC cases past the hand-off due date, not sent', ...report('handoff-timeliness') },
    { section: 'Inbox', metric: 'Received', value: inbox.length, detail: `${inbox.filter((r) => !['linked', 'converted', 'no_action', 'closed'].includes(String(r.triage_state || '').toLowerCase())).length} still to deal with`, __drill_route: '/inbox', __drill_state: { reportFilters: {} } },
    { section: 'Inbox', metric: 'First-touch breaches', value: inbox.filter((r) => r.first_touch_sla_status === 'breached' && !r.first_touched_at).length, detail: 'Not touched within the target', __drill_route: '/inbox', __drill_state: { reportFilters: { firstTouchSla: 'breached' } } },
  ];
}

// ── Content ─────────────────────────────────────────────────────────────────

async function getContentUsage(orgId, filters = {}, ctx = {}) {
  const range = resolvePeriod(filters, 'last_90_days');
  const hidden = ctx.user ? await folderFilterSql(ctx.user, 'COALESCE(d.folder_id, m.folder_id)') : '';
  const [rows] = await pool.execute(
    `SELECT u.content_type, COALESCE(d.name, m.name, CONCAT('Deleted ', u.content_type, ' #', u.content_id)) AS title, COALESCE(d.doc_id, m.module_id) AS reference,
            COALESCE(d.status, m.status) AS status, p.trade_name AS product,
            COUNT(*) AS times_used, COUNT(DISTINCT u.response_id) AS letters, COUNT(DISTINCT u.case_id) AS cases,
            DATE_FORMAT(MAX(u.used_at), '%Y-%m-%d') AS last_used
       FROM cm_content_usage u
       JOIN cases c ON c.id = u.case_id AND c.org_id = ?
       LEFT JOIN cm_documents d ON u.content_type = 'document' AND d.id = u.content_id
       LEFT JOIN cm_modules m ON u.content_type = 'module' AND m.id = u.content_id
       LEFT JOIN products p ON p.id = d.product_id
      WHERE ${inRange('u.used_at')}${hidden}
      GROUP BY u.content_type, u.content_id, title, reference, status, product
      ORDER BY times_used DESC, last_used DESC
      LIMIT ${ROW_CAP}`,
    [orgId, range.dateFrom, range.dateTo]
  );
  return rows.map((row) => ({
    ...row,
    content_type: row.content_type === 'module' ? 'Module' : 'Document',
    times_used: Number(row.times_used),
    letters: Number(row.letters),
    cases: Number(row.cases),
  }));
}

// Published documents whose periodic review or expiry falls within the window
// (or has passed) — the rule the content dashboard and weekly reminder use.
async function getContentReviewDue(orgId, filters = {}, ctx = {}) {
  const windowDays = [30, 60, 90].includes(Number(filters.window_days)) ? Number(filters.window_days) : 60;
  const hidden = ctx.user ? await folderFilterSql(ctx.user, 'd.folder_id') : '';
  const [rows] = await pool.execute(
    `SELECT * FROM (
       SELECT d.id AS document_id, d.doc_id AS reference, d.name AS title, f.name AS folder, o.name AS owner,
              DATE_FORMAT(CASE WHEN d.review_cycle_days > 0 THEN DATE_ADD(COALESCE(
                (SELECT MAX(r.updated_at) FROM cm_reviews r WHERE r.doc_type = 'document' AND r.doc_id = d.id AND r.status = 'Closed'),
                d.created_at), INTERVAL d.review_cycle_days DAY) END, '%Y-%m-%d') AS review_due,
              DATE_FORMAT(d.expiry_date, '%Y-%m-%d') AS expiry_date
         FROM cm_documents d
         JOIN cm_folders f ON f.id = d.folder_id AND f.org_id = ?
         LEFT JOIN users o ON o.id = d.owner_user_id
        WHERE d.status = 'Published'${hidden}) x
      WHERE (review_due IS NOT NULL AND review_due <= DATE_ADD(CURDATE(), INTERVAL ${windowDays} DAY))
         OR (expiry_date IS NOT NULL AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL ${windowDays} DAY))
      ORDER BY LEAST(COALESCE(review_due, '9999-12-31'), COALESCE(expiry_date, '9999-12-31'))
      LIMIT ${ROW_CAP}`,
    [orgId]
  );
  const now = today();
  return rows.map((row) => {
    const reasons = [];
    if (row.review_due) reasons.push(row.review_due < now ? 'Review overdue' : 'Review due');
    if (row.expiry_date) reasons.push(row.expiry_date < now ? 'Expired' : 'Expiring');
    return {
      reference: row.reference,
      title: row.title,
      folder: row.folder,
      owner: row.owner,
      review_due: row.review_due,
      expiry_date: row.expiry_date,
      status: reasons.join(', '),
      __drill_route: '/content',
    };
  });
}

// ── Administration ──────────────────────────────────────────────────────────

// Who can use the organisation and what they can open — the periodic access
// review (21 CFR 11.10(d), EU GMP Annex 11 §12).
// The screens a person has, as the server decides them (getUserModules): their
// role's screens, plus or minus what was changed for them personally. The column
// listed only the personal changes, so a role's screens never showed (P6,
// Saad 2026-10-14). "Differs from role" is what to check in an access review.
const SCREEN_NAMES = {
  mims_core: 'Cases', inbox: 'Inbox', transmissions: 'Transmissions', browse_content: 'Browse Content',
  content_mgmt: 'Content Management', reports: 'Reports', admin_console: 'MIMS Admin',
};
const screenName = (key) => SCREEN_NAMES[key] || key;

async function getUserAccessReview(orgId) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.role AS user_role, u.name, u.email, COALESCE(uoa.role_at_org, u.role) AS role,
            CASE WHEN u.is_active = 0 OR u.is_disabled = 1 THEN 'Disabled'
                 WHEN u.locked_until IS NOT NULL AND u.locked_until > NOW() THEN 'Locked'
                 ELSE 'Active' END AS account_status,
            (SELECT DATE_FORMAT(MAX(la.login_time), '%Y-%m-%d %H:%i') FROM login_audit la
              WHERE la.user_id = u.id AND la.auth_event = 'login_success') AS last_sign_in,
            u.failed_login_attempts, DATE_FORMAT(u.password_expires_at, '%Y-%m-%d') AS password_expires,
            DATE_FORMAT(u.created_at, '%Y-%m-%d') AS created
       FROM user_org_access uoa
       JOIN users u ON u.id = uoa.user_id
      WHERE uoa.org_id = ? AND uoa.is_active = 1
      ORDER BY u.name`,
    [orgId]
  );
  const [roleRows] = await pool.execute(
    "SELECT role, module FROM role_permissions WHERE can_access = 1 AND module <> 'platform_admin_console'"
  );
  const [personal] = rows.length
    ? await pool.query('SELECT user_id, module, can_access FROM user_module_permissions WHERE user_id IN (?)', [rows.map((r) => r.id)])
    : [[]];
  return rows.map(({ id, user_role: userRole, ...row }) => {
    const byRole = new Set(roleRows.filter((r) => r.role === userRole).map((r) => r.module));
    const screens = new Set(byRole);
    personal.filter((p) => p.user_id === id).forEach((p) => (p.can_access ? screens.add(p.module) : screens.delete(p.module)));
    const added = [...screens].filter((m) => !byRole.has(m) && SCREEN_NAMES[m]).map((m) => `+ ${screenName(m)}`);
    const removed = [...byRole].filter((m) => !screens.has(m) && SCREEN_NAMES[m]).map((m) => `− ${screenName(m)}`);
    return {
      name: row.name,
      email: row.email,
      role: row.role,
      account_status: row.account_status,
      modules: [...screens].filter((m) => SCREEN_NAMES[m]).map(screenName).sort().join(', '),
      differs_from_role: [...added, ...removed].join(', '),
      last_sign_in: row.last_sign_in || 'Never',
      failed_login_attempts: row.failed_login_attempts,
      password_expires: row.password_expires,
      created: row.created,
    };
  });
}

// ── Catalogue ───────────────────────────────────────────────────────────────

const DATASETS = Object.freeze({
  'daily-operations-pack': getOperationsSummary,
  'daily-case-summary': getCaseVolume,
  'daily-case-openings': getCasesReceived,
  'daily-case-closures': getCasesClosed,
  'open-backlog': getOpenBacklog,
  'team-workload': getTeamWorkload,
  'case-duplicates': getPossibleDuplicates,
  'mi-response-timeliness': getMiResponseTimes,
  'mi-response-performance': getMiResponsePerformance,
  'mi-enquiry-mix': getMiEnquiryMix,
  'mi-off-label': getMiOffLabel,
  'mi-safety-check': getMiSafetyCheck,
  'handoff-timeliness': getHandoffTimeliness,
  'transmission-sla': getTransmissionSlaReport,
  'icsr-submissions': getIcsrSubmissions,
  'inbox-performance': getInboxPerformanceReport,
  'inbox-sla': getInboxSlaReport,
  'content-usage': getContentUsage,
  'content-review-due': getContentReviewDue,
  'user-access-review': getUserAccessReview,
});

const BUILT_DATASETS = new Set(Object.keys(DATASETS));

// Whose cases ctx.user may see: undefined for all, their id for their own, 0 for none.
async function caseScopeOf(user) {
  if (!user || hasGlobalAdminScope(user)) return undefined;
  if (!(await getUserModules(user.userId)).includes('mims_core')) return 0;
  const scope = await resolveActivityScope(user, 'case.view');
  return scope === 'all' ? undefined : scope === 'own' ? Number(user.userId) : 0;
}

// ctx.user, when given, hides content in folders that user may not read and
// cases that user may not see.
async function getDatasetByReportKey(reportKey, orgId, filters = {}, ctx = {}) {
  const dataset = DATASETS[reportKey];
  if (!dataset) {
    // Only a custom report saved on a data source the rebuild retired gets here.
    const err = new Error('This report uses a data source that no longer exists. Make it again from a report in the library.');
    err.code = 'REPORT_NOT_BUILT';
    throw err;
  }
  const { __case_scope: _ignored, ...chosen } = filters || {};
  return dataset(orgId, { ...chosen, __case_scope: await caseScopeOf(ctx.user) }, ctx);
}

module.exports = {
  PERIODS,
  ROW_CAP,
  periodRange,
  resolvePeriod,
  getDatasetByReportKey,
  BUILT_DATASETS,
};
