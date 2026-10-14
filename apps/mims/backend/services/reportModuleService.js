'use strict';

const pool = require('../database/db');
const { getDatasetByReportKey, BUILT_DATASETS, PERIODS, ROW_CAP } = require('./reportDatasetService');
const { columnLabels } = require('./reportCsv');

const DEFAULT_MODULE_CONFIG = Object.freeze({
  default_timezone: 'America/New_York',
  default_delivery_method: 'email',
  default_delivery_target: '',
  email_from_name: 'MIMS Reports',
  reply_to_email: '',
  scheduler_enabled: 1,
  digest_subject_prefix: '[MIMS Reports]',
  run_log_retention_days: 90,
});

const REPORT_GROUP_LABELS = Object.freeze({
  command_center: 'Operations',
  case_detail: 'Cases',
  medical_information: 'Medical Information',
  safety_quality: 'Safety and Quality',
  inbox_operations: 'Inbox',
  content: 'Content',
  administration: 'Administration',
});

// Choices for "Group by", per dataset. Datasets not listed have none.
const GROUP_BY_OPTIONS = Object.freeze({
  'daily-case-summary': [['day', 'Day'], ['week', 'Week'], ['month', 'Month']],
  'mi-response-performance': [['none', 'All enquiries'], ['product', 'Product'], ['category', 'Category'], ['owner', 'Owner'], ['month', 'Month']],
  'mi-enquiry-mix': [['product', 'Product'], ['category', 'Category'], ['channel', 'Channel'], ['month', 'Month']],
});

const CASE_FILTERS = ['period', 'case_type', 'product', 'owner_id'];

// The library (reports review, 2026-10-14). Sixteen of the 24 reports it held
// said "NOT BUILT YET"; every report here runs on the organisation's own case,
// letter, hand-off, inbox, content and user data. Keys of reports that kept
// their meaning are unchanged, so saved schedules and favourites still point
// at them.
const BUILTIN_REPORT_DEFINITIONS = Object.freeze([
  {
    report_key: 'daily-operations-pack',
    name: 'Operations Summary',
    description: 'Received, closed and open cases, MI answers overdue or late, hand-offs overdue and inbox breaches, for the period.',
    group_key: 'command_center',
    default_filters: { period: 'today' },
    allowed_filters: ['period'],
  },
  {
    report_key: 'daily-case-summary',
    name: 'Case Volume',
    description: 'Cases received (by type) and closed per day, week or month.',
    group_key: 'command_center',
    default_filters: { period: 'last_30_days', group_by: 'day' },
    allowed_filters: [...CASE_FILTERS, 'group_by'],
  },
  {
    report_key: 'open-backlog',
    name: 'Open Cases by Age',
    description: 'Every open case today, oldest first, with its age in days since it was received.',
    group_key: 'command_center',
    default_filters: {},
    allowed_filters: ['case_type', 'product', 'owner_id'],
  },
  {
    report_key: 'team-workload',
    name: 'Team Workload',
    description: 'Open cases per owner by type, MI answers overdue, and cases received and closed in the period.',
    group_key: 'command_center',
    default_filters: { period: 'last_30_days' },
    allowed_filters: ['period'],
  },
  {
    report_key: 'daily-case-openings',
    name: 'Cases Received',
    description: 'Cases by Date Received, with product, channel, status and owner.',
    group_key: 'case_detail',
    default_filters: { period: 'last_7_days' },
    allowed_filters: CASE_FILTERS,
  },
  {
    report_key: 'daily-case-closures',
    name: 'Cases Closed',
    description: 'Cases moved to a closed status in the period, who closed them and how many days they were open.',
    group_key: 'case_detail',
    default_filters: { period: 'last_7_days' },
    allowed_filters: CASE_FILTERS,
  },
  {
    report_key: 'case-duplicates',
    name: 'Possible Duplicates',
    description: 'Cases received in the period that were flagged as a possible duplicate of an earlier case.',
    group_key: 'case_detail',
    default_filters: { period: 'last_30_days' },
    allowed_filters: CASE_FILTERS,
  },
  {
    report_key: 'mi-response-timeliness',
    name: 'MI Response Times',
    description: 'Each MI question received in the period: answer-by date, first letter sent, working days taken, and on time, late or overdue.',
    group_key: 'medical_information',
    default_filters: { period: 'last_30_days' },
    allowed_filters: ['period', 'product', 'owner_id'],
  },
  {
    report_key: 'mi-response-performance',
    name: 'MI Response Performance',
    description: 'Enquiries, answered, on time, late and overdue, on-time rate and median working days, overall or by product, category, owner or month.',
    group_key: 'medical_information',
    default_filters: { period: 'last_30_days', group_by: 'none' },
    allowed_filters: ['period', 'product', 'owner_id', 'group_by'],
  },
  {
    report_key: 'mi-enquiry-mix',
    name: 'MI Enquiries by Product, Category or Channel',
    description: 'How many MI questions came in, their share, off-label and answered, grouped as chosen.',
    group_key: 'medical_information',
    default_filters: { period: 'last_30_days', group_by: 'product' },
    allowed_filters: ['period', 'product', 'group_by'],
  },
  {
    report_key: 'mi-off-label',
    name: 'Off-label Enquiries',
    description: 'MI questions marked off-label: the indication asked about, solicited or not, letter sent and promotional review.',
    group_key: 'medical_information',
    default_filters: { period: 'last_90_days' },
    allowed_filters: ['period', 'product', 'owner_id'],
  },
  {
    report_key: 'mi-safety-check',
    name: 'MI Safety Screening Check',
    description: 'MI questions that mention an adverse event or complaint with no AE or PC case, and letters sent with the screening unanswered.',
    group_key: 'medical_information',
    default_filters: { period: 'last_90_days' },
    allowed_filters: ['period', 'product', 'owner_id'],
  },
  {
    report_key: 'handoff-timeliness',
    name: 'AE / PC Hand-off Timeliness',
    description: 'AE and PC cases received in the period: day 0, due date from Transmission Setup, first send to the safety or quality system, on time or late.',
    group_key: 'safety_quality',
    default_filters: { period: 'last_30_days' },
    allowed_filters: CASE_FILTERS,
  },
  {
    report_key: 'transmission-sla',
    name: 'Open Transmissions',
    description: 'AE and PC transmissions still open, with their due date, SLA state and escalation level.',
    group_key: 'safety_quality',
    default_filters: {},
    allowed_filters: ['case_type'],
  },
  {
    report_key: 'icsr-submissions',
    name: 'ICSR Submissions',
    description: 'ICSRs by receive date: report type, seriousness, status, submissions, last submitted and acknowledged, acknowledgement errors.',
    group_key: 'safety_quality',
    default_filters: { period: 'last_90_days' },
    allowed_filters: ['period'],
  },
  {
    report_key: 'inbox-performance',
    name: 'Inbox Performance',
    description: 'Inbox items per queue and person: unread, open, converted or linked, closed, and first-touch and response breaches.',
    group_key: 'inbox_operations',
    default_filters: { period: 'last_7_days' },
    allowed_filters: ['period'],
  },
  {
    report_key: 'inbox-sla',
    name: 'Inbox SLA',
    description: 'Each inbox item with its first-touch and response targets, worst first.',
    group_key: 'inbox_operations',
    default_filters: { period: 'last_7_days' },
    allowed_filters: ['period'],
  },
  {
    report_key: 'content-usage',
    name: 'Content Used in Letters',
    description: 'Documents and modules enclosed in or used for letters: times used, letters, cases and last used.',
    group_key: 'content',
    default_filters: { period: 'last_90_days' },
    allowed_filters: ['period'],
  },
  {
    report_key: 'content-review-due',
    name: 'Content Due for Review or Expiring',
    description: 'Published documents whose periodic review or expiry date falls within the window, or has passed.',
    group_key: 'content',
    default_filters: { window_days: 60 },
    allowed_filters: ['window_days'],
  },
  {
    report_key: 'user-access-review',
    name: 'User Access Review',
    description: 'Everyone with access to the organisation: role, account status, modules, last sign-in and failed attempts — for the periodic access review.',
    group_key: 'administration',
    audience: 'admin_only',
    default_filters: {},
    allowed_filters: [],
  },
].map((item) => ({ dataset_key: item.report_key, audience: 'shared', ...item })));

const BUILTIN_DASHBOARDS = Object.freeze([
  {
    dashboard_key: 'operations-command-center',
    name: 'Operations',
    description: 'Today at a glance: the operations summary, open cases by age and each person\'s workload.',
    widgets: [
      { id: 'ops-pack', title: 'Operations Summary', report_key: 'daily-operations-pack', display_mode: 'table', limit: 8 },
      { id: 'ops-workload', title: 'Team Workload', report_key: 'team-workload', display_mode: 'table', limit: 8 },
      { id: 'ops-backlog', title: 'Oldest Open Cases', report_key: 'open-backlog', display_mode: 'table', limit: 8 },
    ],
  },
  {
    dashboard_key: 'case-compliance-watch',
    name: 'Compliance Watch',
    description: 'MI answers and AE/PC hand-offs against their deadlines, safety signals not handed on, and open transmissions.',
    widgets: [
      { id: 'mi-performance', title: 'MI Response Performance (30 days)', report_key: 'mi-response-performance', display_mode: 'kpi-grid', limit: 1 },
      { id: 'mi-safety', title: 'MI Safety Screening Check', report_key: 'mi-safety-check', display_mode: 'table', limit: 6 },
      { id: 'handoffs', title: 'AE / PC Hand-off Timeliness', report_key: 'handoff-timeliness', display_mode: 'table', limit: 6 },
      { id: 'transmissions', title: 'Open Transmissions', report_key: 'transmission-sla', display_mode: 'table', limit: 6 },
    ],
  },
  {
    dashboard_key: 'content-watch',
    name: 'Content Watch',
    description: 'Content falling due for review or expiring, and what is used in letters.',
    widgets: [
      { id: 'content-due', title: 'Due for Review or Expiring', report_key: 'content-review-due', display_mode: 'table', limit: 8 },
      { id: 'content-used', title: 'Most Used in Letters (90 days)', report_key: 'content-usage', display_mode: 'table', limit: 8 },
    ],
  },
]);

// Who may see a report or dashboard. It was stored as Shared / Admin only /
// Leadership and never checked, so everyone with Reports saw and ran
// everything (reports review RS3). "Leadership" had no meaning anywhere and
// reads as report managers.
const AUDIENCES = Object.freeze({
  shared: 'Everyone with Reports',
  managers: 'Report managers',
  admin_only: 'Administrators',
});

function normalizeAudience(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'leadership') return 'managers';
  return AUDIENCES[key] ? key : 'shared';
}

// viewer: { admin, manage } — see routes/reportModule.js viewerOf().
function canSeeAudience(viewer, audience) {
  const scope = normalizeAudience(audience);
  if (scope === 'shared') return true;
  if (scope === 'managers') return !!(viewer?.admin || viewer?.manage);
  return !!viewer?.admin;
}

let reportModuleSeedPromise = null;
let reportModuleSeedDone = false;

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function sanitizeText(value, fallback = '') {
  return String(value == null ? fallback : value).trim();
}

function slugify(value) {
  return sanitizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function toBoolInt(value, defaultValue = 1) {
  if (value == null) return defaultValue;
  return value ? 1 : 0;
}

function toJson(value, fallback = null) {
  try {
    return JSON.stringify(value == null ? fallback : value);
  } catch (_) {
    return JSON.stringify(fallback);
  }
}

function normalizeDefinition(row) {
  if (!row) return null;
  return {
    id: row.id,
    org_id: row.org_id,
    report_key: row.report_key,
    dataset_key: row.dataset_key,
    is_built: BUILT_DATASETS.has(row.dataset_key),
    name: row.name,
    description: row.description || '',
    group_key: row.group_key,
    group_label: REPORT_GROUP_LABELS[row.group_key] || row.group_key,
    allowed_filters: parseJson(row.allowed_filters, []),
    default_filters: parseJson(row.default_filters, {}),
    group_by_options: (GROUP_BY_OPTIONS[row.dataset_key] || []).map(([value, label]) => ({ value, label })),
    selected_columns: parseJson(row.selected_columns, []),
    visibility_scope: normalizeAudience(row.visibility_scope),
    audience_label: AUDIENCES[normalizeAudience(row.visibility_scope)],
    owner_id: row.owner_id || row.created_by || null,
    is_system: !!row.is_system,
    is_active: !!row.is_active,
    created_by: row.created_by || null,
    updated_by: row.updated_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function normalizeDashboard(row) {
  if (!row) return null;
  return {
    id: row.id,
    org_id: row.org_id,
    dashboard_key: row.dashboard_key,
    name: row.name,
    description: row.description || '',
    layout: parseJson(row.layout_json, []),
    widgets: parseJson(row.widgets_json, []),
    visibility_scope: normalizeAudience(row.visibility_scope),
    audience_label: AUDIENCES[normalizeAudience(row.visibility_scope)],
    owner_id: row.owner_id || row.created_by || null,
    is_system: !!row.is_system,
    is_active: !!row.is_active,
    created_by: row.created_by || null,
    updated_by: row.updated_by || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function pickVisibleColumns(rows, selectedColumns = []) {
  if (!Array.isArray(rows) || rows.length === 0) return { rows: [], columns: selectedColumns || [] };

  const requested = Array.isArray(selectedColumns) ? selectedColumns.filter(Boolean) : [];
  const allColumns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => {
        if (!key.startsWith('__')) set.add(key);
      });
      return set;
    }, new Set())
  );
  const activeColumns = requested.length > 0
    ? requested.filter((column) => allColumns.includes(column))
    : allColumns;

  return {
    columns: activeColumns,
    rows: rows.map((row) => {
      const next = {};
      activeColumns.forEach((column) => {
        next[column] = row[column];
      });
      Object.keys(row || {}).forEach((key) => {
        if (key.startsWith('__')) next[key] = row[key];
      });
      return next;
    }),
  };
}

function makeKpisFromRows(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const first = rows[0] || {};
  return Object.entries(first)
    .filter(([key, value]) => !key.startsWith('__') && typeof value === 'number')
    .slice(0, 4)
    .map(([key, value]) => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      value,
    }));
}

function buildDashboardCsvRows(dashboardName, widgets = []) {
  const rows = [];
  widgets.forEach((widget) => {
    const widgetRows = Array.isArray(widget.rows) ? widget.rows : [];
    if (widgetRows.length === 0) {
      rows.push({
        dashboard_name: dashboardName,
        widget_title: widget.title,
        display_mode: widget.display_mode,
        status: 'no_data',
      });
      return;
    }
    widgetRows.forEach((row, index) => {
      rows.push({
        dashboard_name: dashboardName,
        widget_title: widget.title,
        display_mode: widget.display_mode,
        row_number: index + 1,
        ...row,
      });
    });
  });
  return rows;
}

async function ensureReportModuleSeed() {
  if (reportModuleSeedDone) return;
  if (reportModuleSeedPromise) {
    await reportModuleSeedPromise;
    return;
  }

  reportModuleSeedPromise = (async () => {
    for (const item of BUILTIN_REPORT_DEFINITIONS) {
      await pool.execute(
        `INSERT INTO report_definitions
           (org_id, report_key, dataset_key, name, description, group_key, allowed_filters, default_filters,
            selected_columns, visibility_scope, is_system, is_active, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, NULL, NULL)
         ON DUPLICATE KEY UPDATE
           dataset_key = VALUES(dataset_key),
           name = VALUES(name),
           description = VALUES(description),
           group_key = VALUES(group_key),
           allowed_filters = VALUES(allowed_filters),
           default_filters = VALUES(default_filters),
           selected_columns = VALUES(selected_columns),
           visibility_scope = VALUES(visibility_scope),
           is_system = VALUES(is_system),
           is_active = VALUES(is_active)`,
        [
          null,
          item.report_key,
          item.dataset_key,
          item.name,
          item.description,
          item.group_key,
          JSON.stringify(item.allowed_filters || []),
          JSON.stringify(item.default_filters || {}),
          JSON.stringify(item.selected_columns || []),
          item.audience,
        ]
      );
    }
    // Library reports that were removed (the unbuilt ones) stop showing.
    await pool.query(
      'UPDATE report_definitions SET is_active = 0 WHERE org_id IS NULL AND is_system = 1 AND report_key NOT IN (?)',
      [BUILTIN_REPORT_DEFINITIONS.map((item) => item.report_key)]
    );

    for (const item of BUILTIN_DASHBOARDS) {
      await pool.execute(
        `INSERT INTO report_dashboards
           (org_id, dashboard_key, name, description, layout_json, widgets_json, visibility_scope, is_system, is_active, created_by, updated_by)
         VALUES (?, ?, ?, ?, '[]', ?, 'shared', 1, 1, NULL, NULL)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           description = VALUES(description),
           widgets_json = VALUES(widgets_json),
           visibility_scope = VALUES(visibility_scope),
           is_system = VALUES(is_system),
           is_active = VALUES(is_active)`,
        [
          null,
          item.dashboard_key,
          item.name,
          item.description,
          JSON.stringify(item.widgets || []),
        ]
      );
    }
    await pool.query(
      'UPDATE report_dashboards SET is_active = 0 WHERE org_id IS NULL AND is_system = 1 AND dashboard_key NOT IN (?)',
      [BUILTIN_DASHBOARDS.map((item) => item.dashboard_key)]
    );

    reportModuleSeedDone = true;
  })();

  try {
    await reportModuleSeedPromise;
  } finally {
    reportModuleSeedPromise = null;
  }
}

function getDatasetCatalog() {
  return BUILTIN_REPORT_DEFINITIONS.map((item) => ({
    dataset_key: item.dataset_key,
    is_built: BUILT_DATASETS.has(item.dataset_key),
    default_report_key: item.report_key,
    name: item.name,
    description: item.description,
    group_key: item.group_key,
    group_label: REPORT_GROUP_LABELS[item.group_key] || item.group_key,
    allowed_filters: item.allowed_filters || [],
    default_filters: item.default_filters || {},
  }));
}

async function listReportDefinitions(orgId, options = {}) {
  await ensureReportModuleSeed();
  const includeInactive = !!options.includeInactive;
  const productGroupId = Number(options.productGroupId || 0);
  const productGroupFilter = productGroupId
    ? `AND EXISTS (
         SELECT 1
           FROM product_group_assignments pga
          WHERE pga.target_type = 'report_definition'
            AND pga.target_id = report_definitions.id
            AND pga.group_id = ?
       )`
    : '';
  const params = productGroupId ? [orgId, productGroupId] : [orgId];
  const [rows] = await pool.execute(
    `SELECT *
     FROM report_definitions
     WHERE (org_id IS NULL OR org_id = ?)
       ${includeInactive ? 'AND (is_active = 1 OR org_id IS NOT NULL)' : 'AND is_active = 1'}
       ${productGroupFilter}
     ORDER BY
       CASE WHEN org_id IS NULL THEN 0 ELSE 1 END,
       name ASC`,
    params
  );
  // Retired library reports never show, even to managers; the library keeps
  // the order of its headings.
  const order = BUILTIN_REPORT_DEFINITIONS.map((item) => item.report_key);
  const rank = (row) => (row.org_id == null ? order.indexOf(row.report_key) : order.length);
  return rows.map(normalizeDefinition).sort((a, b) => rank(a) - rank(b));
}

async function getReportDefinitionById(orgId, id) {
  await ensureReportModuleSeed();
  const [rows] = await pool.execute(
    `SELECT *
     FROM report_definitions
     WHERE id = ?
       AND (org_id IS NULL OR org_id = ?)
       AND (is_active = 1 OR org_id IS NOT NULL)
     LIMIT 1`,
    [id, orgId]
  );
  return normalizeDefinition(rows[0]);
}

async function getReportDefinitionByKey(orgId, reportKey) {
  await ensureReportModuleSeed();
  const [rows] = await pool.execute(
    `SELECT *
     FROM report_definitions
     WHERE report_key = ?
       AND (org_id IS NULL OR org_id = ?)
       AND (is_active = 1 OR org_id IS NOT NULL)
     ORDER BY CASE WHEN org_id IS NULL THEN 0 ELSE 1 END DESC
     LIMIT 1`,
    [reportKey, orgId]
  );
  return normalizeDefinition(rows[0]);
}

async function ensureUniqueDefinitionKey(orgId, baseKey) {
  let key = baseKey || `custom-report-${Date.now()}`;
  let counter = 1;
  while (true) {
    const [rows] = await pool.execute(
      'SELECT id FROM report_definitions WHERE report_key = ? LIMIT 1',
      [key]
    );
    if (!rows.length) return key;
    counter += 1;
    key = `${baseKey}-${counter}`;
  }
}

async function validateReportPayload(orgId, payload = {}, existing = null) {
  const datasetKey = sanitizeText(payload.dataset_key || existing?.dataset_key);
  if (!datasetKey) throw new Error('dataset_key is required.');
  const catalogItem = getDatasetCatalog().find((item) => item.dataset_key === datasetKey);
  if (!catalogItem) throw new Error('Unsupported dataset_key.');
  if (!catalogItem.is_built) throw new Error('This dataset is not built yet, so no report can be made from it.');
  const name = sanitizeText(payload.name || existing?.name || catalogItem.name);
  if (!name) throw new Error('Report name is required.');
  const selectedColumns = Array.isArray(payload.selected_columns) ? payload.selected_columns : existing?.selected_columns || [];
  if (selectedColumns.length) {
    const preview = await previewDataset(datasetKey, orgId, payload.default_filters || existing?.default_filters || {});
    const available = new Set(preview.columns || []);
    const invalid = selectedColumns.filter((column) => !available.has(column));
    if (invalid.length) throw new Error(`Invalid selected columns: ${invalid.join(', ')}`);
  }
  return { catalogItem };
}

async function validateDashboardPayload(orgId, payload = {}, existing = null) {
  const name = sanitizeText(payload.name || existing?.name);
  if (!name) throw new Error('Dashboard name is required.');
  const widgets = Array.isArray(payload.widgets) ? payload.widgets : existing?.widgets || [];
  for (const widget of widgets) {
    const definition = widget.report_definition_id
      ? await getReportDefinitionById(orgId, widget.report_definition_id)
      : await getReportDefinitionByKey(orgId, widget.report_key);
    if (!definition) throw new Error(`Dashboard widget references an invalid report: ${widget.report_key || widget.report_definition_id || 'unknown'}`);
  }
  return { widgets };
}

async function createReportDefinition(orgId, userId, payload = {}) {
  await ensureReportModuleSeed();
  const datasetKey = sanitizeText(payload.dataset_key);
  if (!datasetKey) throw new Error('dataset_key is required.');

  const catalogItem = getDatasetCatalog().find((item) => item.dataset_key === datasetKey);
  if (!catalogItem) throw new Error('Unsupported dataset_key.');
  await validateReportPayload(orgId, payload);

  const baseName = sanitizeText(payload.name, catalogItem.name);
  const reportKey = await ensureUniqueDefinitionKey(orgId, slugify(`${orgId}-${baseName}`));
  const [result] = await pool.execute(
    `INSERT INTO report_definitions
       (org_id, report_key, dataset_key, name, description, group_key, allowed_filters, default_filters,
        selected_columns, visibility_scope, is_system, is_active, created_by, updated_by, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    [
      orgId,
      reportKey,
      datasetKey,
      baseName,
      sanitizeText(payload.description),
      sanitizeText(payload.group_key, catalogItem.group_key),
      JSON.stringify(Array.isArray(payload.allowed_filters) ? payload.allowed_filters : catalogItem.allowed_filters || []),
      JSON.stringify(payload.default_filters || {}),
      JSON.stringify(Array.isArray(payload.selected_columns) ? payload.selected_columns : []),
      normalizeAudience(payload.visibility_scope),
      toBoolInt(payload.is_active, 1),
      userId || null,
      userId || null,
      userId || null,
    ]
  );
  return getReportDefinitionById(orgId, result.insertId);
}

async function updateReportDefinition(orgId, userId, id, payload = {}) {
  const existing = await getReportDefinitionById(orgId, id);
  if (!existing) throw new Error('Report definition not found.');
  if (existing.is_system) throw new Error('System report definitions cannot be edited.');
  await validateReportPayload(orgId, payload, existing);

  await pool.execute(
    `UPDATE report_definitions
     SET name = ?,
         description = ?,
         group_key = ?,
         default_filters = ?,
         selected_columns = ?,
         visibility_scope = ?,
         owner_id = ?,
         is_active = ?,
         updated_by = ?,
         updated_at = NOW()
     WHERE id = ? AND org_id = ?`,
    [
      sanitizeText(payload.name, existing.name),
      sanitizeText(payload.description, existing.description),
      sanitizeText(payload.group_key, existing.group_key),
      JSON.stringify(payload.default_filters || existing.default_filters || {}),
      JSON.stringify(Array.isArray(payload.selected_columns) ? payload.selected_columns : existing.selected_columns || []),
      normalizeAudience(payload.visibility_scope || existing.visibility_scope),
      payload.owner_id || existing.owner_id || userId || null,
      toBoolInt(payload.is_active, existing.is_active ? 1 : 0),
      userId || null,
      id,
      orgId,
    ]
  );
  return getReportDefinitionById(orgId, id);
}

async function deleteReportDefinition(orgId, id) {
  const existing = await getReportDefinitionById(orgId, id);
  if (!existing) throw new Error('Report definition not found.');
  if (existing.is_system) throw new Error('System report definitions cannot be deleted.');

  await pool.execute(
    'DELETE FROM report_definitions WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return existing;
}

// Filters chosen at run time win over the report's saved ones; typed dates
// replace a saved named period. ctx.user limits content to readable folders.
async function runReportDefinition(definition, orgId, filters = {}, ctx = {}) {
  const runtime = Object.fromEntries(Object.entries(filters || {}).filter(([, value]) => value !== '' && value != null));
  const saved = { ...(definition.default_filters || {}) };
  if (runtime.date_from || runtime.date_to || runtime.period) { delete saved.period; delete saved.date_from; delete saved.date_to; }
  const mergedFilters = { ...saved, ...runtime };
  const rows = await getDatasetByReportKey(definition.dataset_key, orgId, mergedFilters, ctx);
  const visible = pickVisibleColumns(rows, definition.selected_columns);
  return {
    definition,
    filters: mergedFilters,
    columns: visible.columns,
    column_labels: columnLabels(visible.columns),
    rows: visible.rows,
    row_count: visible.rows.length,
    truncated: rows.length >= ROW_CAP,
  };
}

async function previewDataset(datasetKey, orgId, filters = {}, ctx = {}) {
  const catalogItem = getDatasetCatalog().find((item) => item.dataset_key === datasetKey);
  if (!catalogItem) throw new Error('Unsupported dataset_key.');
  return runReportDefinition({
    ...catalogItem,
    selected_columns: [],
  }, orgId, filters, ctx);
}

async function listDashboards(orgId, options = {}) {
  await ensureReportModuleSeed();
  const includeInactive = !!options.includeInactive;
  const [rows] = await pool.execute(
    `SELECT *
     FROM report_dashboards
     WHERE (org_id IS NULL OR org_id = ?)
       ${includeInactive ? 'AND (is_active = 1 OR org_id IS NOT NULL)' : 'AND is_active = 1'}
     ORDER BY CASE WHEN org_id IS NULL THEN 0 ELSE 1 END, name ASC`,
    [orgId]
  );
  return rows.map(normalizeDashboard);
}

async function getDashboardById(orgId, id) {
  await ensureReportModuleSeed();
  const [rows] = await pool.execute(
    `SELECT *
     FROM report_dashboards
     WHERE id = ?
       AND (org_id IS NULL OR org_id = ?)
       AND (is_active = 1 OR org_id IS NOT NULL)
     LIMIT 1`,
    [id, orgId]
  );
  return normalizeDashboard(rows[0]);
}

async function ensureUniqueDashboardKey(baseKey) {
  let key = baseKey || `dashboard-${Date.now()}`;
  let counter = 1;
  while (true) {
    const [rows] = await pool.execute(
      'SELECT id FROM report_dashboards WHERE dashboard_key = ? LIMIT 1',
      [key]
    );
    if (!rows.length) return key;
    counter += 1;
    key = `${baseKey}-${counter}`;
  }
}

async function createDashboard(orgId, userId, payload = {}) {
  await ensureReportModuleSeed();
  const name = sanitizeText(payload.name);
  if (!name) throw new Error('Dashboard name is required.');
  await validateDashboardPayload(orgId, payload);
  const dashboardKey = await ensureUniqueDashboardKey(slugify(`${orgId}-${name}`));
  const [result] = await pool.execute(
    `INSERT INTO report_dashboards
       (org_id, dashboard_key, name, description, layout_json, widgets_json, visibility_scope,
        is_system, is_active, created_by, updated_by, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    [
      orgId,
      dashboardKey,
      name,
      sanitizeText(payload.description),
      JSON.stringify(Array.isArray(payload.layout) ? payload.layout : []),
      JSON.stringify(Array.isArray(payload.widgets) ? payload.widgets : []),
      normalizeAudience(payload.visibility_scope),
      toBoolInt(payload.is_active, 1),
      userId || null,
      userId || null,
      userId || null,
    ]
  );
  return getDashboardById(orgId, result.insertId);
}

async function updateDashboard(orgId, userId, id, payload = {}) {
  const existing = await getDashboardById(orgId, id);
  if (!existing) throw new Error('Dashboard not found.');
  if (existing.is_system) throw new Error('System dashboards cannot be edited.');
  await validateDashboardPayload(orgId, payload, existing);

  await pool.execute(
    `UPDATE report_dashboards
     SET name = ?,
         description = ?,
         layout_json = ?,
         widgets_json = ?,
         visibility_scope = ?,
         owner_id = ?,
         is_active = ?,
         updated_by = ?,
         updated_at = NOW()
     WHERE id = ? AND org_id = ?`,
    [
      sanitizeText(payload.name, existing.name),
      sanitizeText(payload.description, existing.description),
      JSON.stringify(Array.isArray(payload.layout) ? payload.layout : existing.layout || []),
      JSON.stringify(Array.isArray(payload.widgets) ? payload.widgets : existing.widgets || []),
      normalizeAudience(payload.visibility_scope || existing.visibility_scope),
      payload.owner_id || existing.owner_id || userId || null,
      toBoolInt(payload.is_active, existing.is_active ? 1 : 0),
      userId || null,
      id,
      orgId,
    ]
  );
  return getDashboardById(orgId, id);
}

async function deleteDashboard(orgId, id) {
  const existing = await getDashboardById(orgId, id);
  if (!existing) throw new Error('Dashboard not found.');
  if (existing.is_system) throw new Error('System dashboards cannot be deleted.');
  await pool.execute(
    'DELETE FROM report_dashboards WHERE id = ? AND org_id = ?',
    [id, orgId]
  );
  return existing;
}

async function runDashboard(dashboard, orgId, filters = {}, viewer = null, ctx = {}) {
  const widgets = [];
  for (const widget of dashboard.widgets || []) {
    const definition = widget.report_definition_id
      ? await getReportDefinitionById(orgId, widget.report_definition_id)
      : await getReportDefinitionByKey(orgId, widget.report_key);
    if (!definition) continue;
    // A widget on a report the viewer may not see shows that, not the data.
    if (viewer && !canSeeAudience(viewer, definition.visibility_scope)) {
      widgets.push({
        id: widget.id || `${definition.report_key}-${widgets.length + 1}`,
        title: widget.title || definition.name,
        display_mode: widget.display_mode || 'table',
        report_key: definition.report_key,
        definition_id: definition.id,
        not_available: true,
        rows: [],
        columns: [],
        row_count: 0,
        kpis: [],
      });
      continue;
    }
    // A widget on an unbuilt report shows that, instead of failing the dashboard.
    if (!definition.is_built) {
      widgets.push({
        id: widget.id || `${definition.report_key}-${widgets.length + 1}`,
        title: widget.title || definition.name,
        display_mode: widget.display_mode || 'table',
        report_key: definition.report_key,
        definition_id: definition.id,
        not_built: true,
        rows: [],
        columns: [],
        row_count: 0,
        kpis: [],
      });
      continue;
    }
    const result = await runReportDefinition(definition, orgId, filters, ctx);
    widgets.push({
      id: widget.id || `${definition.report_key}-${widgets.length + 1}`,
      title: widget.title || definition.name,
      display_mode: widget.display_mode || 'table',
      report_key: definition.report_key,
      definition_id: definition.id,
      rows: result.rows.slice(0, Number(widget.limit || 6)),
      columns: result.columns,
      column_labels: result.column_labels,
      row_count: result.row_count,
      kpis: makeKpisFromRows(result.rows),
    });
  }

  return {
    dashboard,
    widgets,
    csv_rows: buildDashboardCsvRows(dashboard.name, widgets),
  };
}

async function duplicateReportDefinition(orgId, userId, id) {
  const existing = await getReportDefinitionById(orgId, id);
  if (!existing) throw new Error('Report definition not found.');
  return createReportDefinition(orgId, userId, {
    dataset_key: existing.dataset_key,
    name: `${existing.name} Copy`,
    description: existing.description,
    group_key: existing.group_key,
    allowed_filters: existing.allowed_filters,
    default_filters: existing.default_filters,
    selected_columns: existing.selected_columns,
    visibility_scope: existing.visibility_scope,
    is_active: true,
  });
}

async function duplicateDashboard(orgId, userId, id) {
  const existing = await getDashboardById(orgId, id);
  if (!existing) throw new Error('Dashboard not found.');
  return createDashboard(orgId, userId, {
    name: `${existing.name} Copy`,
    description: existing.description,
    layout: existing.layout,
    widgets: existing.widgets,
    visibility_scope: existing.visibility_scope,
    is_active: true,
  });
}

async function createDashboardTemplate(orgId, userId, dashboardId, payload = {}) {
  const dashboard = await getDashboardById(orgId, dashboardId);
  if (!dashboard) throw new Error('Dashboard not found.');
  const name = sanitizeText(payload.name, `${dashboard.name} Template`);
  const key = await ensureUniqueDashboardKey(slugify(`${orgId}-template-${name}`));
  const [result] = await pool.execute(
    `INSERT INTO report_dashboard_templates
       (org_id, template_key, name, description, layout_json, widgets_json, is_system, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [orgId, key, name, sanitizeText(payload.description, dashboard.description), toJson(dashboard.layout || [], []), toJson(dashboard.widgets || [], []), userId || null]
  );
  return getDashboardTemplateById(orgId, result.insertId);
}

async function getDashboardTemplateById(orgId, templateId) {
  const [rows] = await pool.execute(
    'SELECT * FROM report_dashboard_templates WHERE id = ? AND (org_id = ? OR org_id IS NULL) LIMIT 1',
    [templateId, orgId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    layout: parseJson(row.layout_json, []),
    widgets: parseJson(row.widgets_json, []),
  };
}

async function listDashboardTemplates(orgId) {
  const [rows] = await pool.execute(
    'SELECT * FROM report_dashboard_templates WHERE org_id = ? OR org_id IS NULL ORDER BY is_system DESC, name ASC',
    [orgId]
  );
  return rows.map((row) => ({
    ...row,
    layout: parseJson(row.layout_json, []),
    widgets: parseJson(row.widgets_json, []),
  }));
}

async function createDashboardFromTemplate(orgId, userId, templateId, payload = {}) {
  const template = await getDashboardTemplateById(orgId, templateId);
  if (!template) throw new Error('Dashboard template not found.');
  return createDashboard(orgId, userId, {
    name: sanitizeText(payload.name, template.name),
    description: sanitizeText(payload.description, template.description),
    layout: template.layout,
    widgets: template.widgets,
    visibility_scope: payload.visibility_scope || 'shared',
    is_active: true,
  });
}

async function listFavorites(orgId, userId) {
  const [rows] = await pool.execute(
    'SELECT id, target_type, target_id, created_at FROM report_favorites WHERE org_id = ? AND user_id = ? ORDER BY created_at DESC',
    [orgId, userId]
  );
  return rows;
}

async function addFavorite(orgId, userId, targetType, targetId) {
  const normalizedType = String(targetType || '').toLowerCase() === 'dashboard' ? 'dashboard' : 'report';
  await pool.execute(
    `INSERT INTO report_favorites (org_id, user_id, target_type, target_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE created_at = created_at`,
    [orgId, userId, normalizedType, Number(targetId)]
  );
  return listFavorites(orgId, userId);
}

async function deleteFavorite(orgId, userId, targetType, targetId) {
  await pool.execute(
    'DELETE FROM report_favorites WHERE org_id = ? AND user_id = ? AND target_type = ? AND target_id = ?',
    [orgId, userId, String(targetType || '').toLowerCase(), Number(targetId)]
  );
  return listFavorites(orgId, userId);
}

async function listDashboardShares(orgId, dashboardId = null) {
  const params = [orgId];
  let where = 'org_id = ?';
  if (dashboardId) {
    where += ' AND dashboard_id = ?';
    params.push(Number(dashboardId));
  }
  const [rows] = await pool.execute(
    `SELECT * FROM report_dashboard_shares WHERE ${where} ORDER BY created_at DESC`,
    params
  );
  return rows;
}

async function addDashboardShare(orgId, userId, payload = {}) {
  const dashboard = await getDashboardById(orgId, Number(payload.dashboard_id));
  if (!dashboard) throw new Error('Dashboard not found.');
  const shareType = ['org', 'role', 'user'].includes(String(payload.share_type || '').toLowerCase())
    ? String(payload.share_type).toLowerCase()
    : 'role';
  const shareValue = sanitizeText(payload.share_value);
  if (!shareValue) throw new Error('share_value is required.');
  await pool.execute(
    `INSERT INTO report_dashboard_shares (org_id, dashboard_id, share_type, share_value, created_by)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE created_by = VALUES(created_by)`,
    [orgId, dashboard.id, shareType, shareValue, userId || null]
  );
  return listDashboardShares(orgId, dashboard.id);
}

async function deleteDashboardShare(orgId, shareId) {
  await pool.execute('DELETE FROM report_dashboard_shares WHERE id = ? AND org_id = ?', [shareId, orgId]);
}

async function setRoleDefaultDashboard(orgId, userId, roleKey, dashboardId) {
  const dashboard = await getDashboardById(orgId, dashboardId);
  if (!dashboard) throw new Error('Dashboard not found.');
  await pool.execute(
    `INSERT INTO report_role_default_dashboards (org_id, role_key, dashboard_id, updated_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE dashboard_id = VALUES(dashboard_id), updated_by = VALUES(updated_by), updated_at = NOW()`,
    [orgId, sanitizeText(roleKey), dashboard.id, userId || null]
  );
  return getRoleDefaultDashboards(orgId);
}

async function getRoleDefaultDashboards(orgId) {
  const [rows] = await pool.execute(
    `SELECT rdd.*, rd.name AS dashboard_name
     FROM report_role_default_dashboards rdd
     LEFT JOIN report_dashboards rd ON rd.id = rdd.dashboard_id
     WHERE rdd.org_id = ?
     ORDER BY rdd.role_key`,
    [orgId]
  );
  return rows;
}

async function recordUsageEvent(orgId, userId, eventType, targetType, targetId, metadata = {}) {
  await pool.execute(
    `INSERT INTO report_usage_events (org_id, user_id, event_type, target_type, target_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [orgId, userId || null, eventType, targetType, targetId || null, toJson(metadata, {})]
  );
}

async function listUsageAnalytics(orgId) {
  const [rows] = await pool.execute(
    `SELECT event_type, target_type, target_id, COUNT(*) AS count, MAX(created_at) AS last_event_at
     FROM report_usage_events
     WHERE org_id = ?
     GROUP BY event_type, target_type, target_id
     ORDER BY count DESC, last_event_at DESC
     LIMIT 50`,
    [orgId]
  );
  return rows;
}

async function validateReportConfig(orgId) {
  const issues = [];
  const [brokenSchedules] = await pool.execute(
    `SELECT sec.id, sec.export_name
     FROM scheduled_export_configs sec
     LEFT JOIN report_definitions rd ON sec.target_type = 'report' AND rd.id = sec.target_id
     LEFT JOIN report_dashboards db ON sec.target_type = 'dashboard' AND db.id = sec.target_id
     WHERE sec.org_id = ? AND sec.is_active = 1
       AND ((sec.target_type = 'report' AND rd.id IS NULL) OR (sec.target_type = 'dashboard' AND db.id IS NULL))`,
    [orgId]
  );
  brokenSchedules.forEach((row) => issues.push({ severity: 'critical', type: 'broken_schedule_target', message: `Schedule target missing: ${row.export_name}`, entity_id: row.id }));
  const [emailSchedules] = await pool.execute(
    "SELECT id, export_name FROM scheduled_export_configs WHERE org_id = ? AND is_active = 1 AND delivery_method = 'email' AND (delivery_target IS NULL OR delivery_target = '')",
    [orgId]
  );
  emailSchedules.forEach((row) => issues.push({ severity: 'critical', type: 'missing_delivery_target', message: `Email schedule missing delivery target: ${row.export_name}`, entity_id: row.id }));
  const templates = await listDashboardTemplates(orgId);
  const defaults = await getRoleDefaultDashboards(orgId);
  return { issues, templates_count: templates.length, role_defaults_count: defaults.length };
}

async function listRecommendations(orgId) {
  const analytics = await listUsageAnalytics(orgId);
  const recommendations = [];
  const frequentlyUsed = analytics.find((row) => Number(row.count || 0) >= 3 && row.target_id);
  if (frequentlyUsed) recommendations.push({ type: 'pin_candidate', message: `Frequently used ${frequentlyUsed.target_type} #${frequentlyUsed.target_id} can be pinned or favorited.` });
  const [staleSchedules] = await pool.execute(
    `SELECT id, export_name FROM scheduled_export_configs
     WHERE org_id = ? AND is_active = 1 AND (last_run_at IS NULL OR last_run_at < DATE_SUB(NOW(), INTERVAL 30 DAY))
     LIMIT 10`,
    [orgId]
  );
  staleSchedules.forEach((row) => recommendations.push({ type: 'stale_schedule_review', message: `Review schedule "${row.export_name}" because it has not run recently.`, entity_id: row.id }));
  return recommendations;
}

async function getModuleConfig(orgId) {
  const [rows] = await pool.execute(
    'SELECT * FROM report_module_configs WHERE org_id = ? LIMIT 1',
    [orgId]
  );
  if (!rows.length) {
    return { org_id: orgId, ...DEFAULT_MODULE_CONFIG };
  }
  const row = rows[0];
  return {
    org_id: row.org_id,
    default_timezone: row.default_timezone || DEFAULT_MODULE_CONFIG.default_timezone,
    default_delivery_method: row.default_delivery_method || DEFAULT_MODULE_CONFIG.default_delivery_method,
    default_delivery_target: row.default_delivery_target || '',
    email_from_name: row.email_from_name || DEFAULT_MODULE_CONFIG.email_from_name,
    reply_to_email: row.reply_to_email || '',
    scheduler_enabled: Number(row.scheduler_enabled || 0) ? 1 : 0,
    digest_subject_prefix: row.digest_subject_prefix || DEFAULT_MODULE_CONFIG.digest_subject_prefix,
    run_log_retention_days: Number(row.run_log_retention_days || DEFAULT_MODULE_CONFIG.run_log_retention_days),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function saveModuleConfig(orgId, userId, payload = {}) {
  const merged = {
    ...(await getModuleConfig(orgId)),
    ...payload,
  };
  await pool.execute(
    `INSERT INTO report_module_configs
       (org_id, default_timezone, default_delivery_method, default_delivery_target, email_from_name,
        reply_to_email, scheduler_enabled, digest_subject_prefix, run_log_retention_days, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       default_timezone = VALUES(default_timezone),
       default_delivery_method = VALUES(default_delivery_method),
       default_delivery_target = VALUES(default_delivery_target),
       email_from_name = VALUES(email_from_name),
       reply_to_email = VALUES(reply_to_email),
       scheduler_enabled = VALUES(scheduler_enabled),
       digest_subject_prefix = VALUES(digest_subject_prefix),
       run_log_retention_days = VALUES(run_log_retention_days),
       updated_by = VALUES(updated_by),
       updated_at = NOW()`,
    [
      orgId,
      sanitizeText(merged.default_timezone, DEFAULT_MODULE_CONFIG.default_timezone),
      sanitizeText(merged.default_delivery_method, DEFAULT_MODULE_CONFIG.default_delivery_method),
      sanitizeText(merged.default_delivery_target),
      sanitizeText(merged.email_from_name, DEFAULT_MODULE_CONFIG.email_from_name),
      sanitizeText(merged.reply_to_email),
      toBoolInt(merged.scheduler_enabled, 1),
      sanitizeText(merged.digest_subject_prefix, DEFAULT_MODULE_CONFIG.digest_subject_prefix),
      Number(merged.run_log_retention_days || DEFAULT_MODULE_CONFIG.run_log_retention_days),
      userId || null,
    ]
  );
  return getModuleConfig(orgId);
}

// Choices for the filter bar: named periods, products and case owners of the
// organisation.
async function getFilterOptions(orgId) {
  const [products] = await pool.execute(
    'SELECT DISTINCT trade_name FROM products WHERE org_id = ? AND trade_name IS NOT NULL ORDER BY trade_name', [orgId]);
  const [owners] = await pool.execute(
    `SELECT u.id, u.name FROM user_org_access uoa JOIN users u ON u.id = uoa.user_id
      WHERE uoa.org_id = ? AND uoa.is_active = 1 AND u.is_active = 1 ORDER BY u.name`, [orgId]);
  return {
    periods: Object.entries(PERIODS).map(([value, label]) => ({ value, label })),
    case_types: [{ value: 'MI', label: 'Medical Information' }, { value: 'AE', label: 'Adverse Event' }, { value: 'PC', label: 'Product Complaint' }],
    products: products.map((row) => row.trade_name),
    owners: [{ id: 'unassigned', name: 'Unassigned' }, ...owners],
    window_days: [30, 60, 90],
  };
}

async function getModuleSummary(orgId) {
  await ensureReportModuleSeed();
  const [[reportCount]] = await pool.execute(
    'SELECT COUNT(*) AS total FROM report_definitions WHERE (org_id IS NULL OR org_id = ?) AND is_active = 1',
    [orgId]
  );
  const [[dashboardCount]] = await pool.execute(
    'SELECT COUNT(*) AS total FROM report_dashboards WHERE (org_id IS NULL OR org_id = ?) AND is_active = 1',
    [orgId]
  );
  const [[scheduleCount]] = await pool.execute(
    'SELECT COUNT(*) AS total FROM scheduled_export_configs WHERE org_id = ? AND is_active = 1',
    [orgId]
  );
  const [[failedRuns]] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM report_run_ledger
     WHERE org_id = ?
       AND status = 'failed'
       AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
    [orgId]
  );

  return {
    total_reports: Number(reportCount?.total || 0),
    total_dashboards: Number(dashboardCount?.total || 0),
    total_schedules: Number(scheduleCount?.total || 0),
    failed_runs_last_7_days: Number(failedRuns?.total || 0),
  };
}

module.exports = {
  DEFAULT_MODULE_CONFIG,
  AUDIENCES,
  normalizeAudience,
  canSeeAudience,
  REPORT_GROUP_LABELS,
  ensureReportModuleSeed,
  getDatasetCatalog,
  listReportDefinitions,
  getReportDefinitionById,
  getReportDefinitionByKey,
  createReportDefinition,
  updateReportDefinition,
  deleteReportDefinition,
  duplicateReportDefinition,
  previewDataset,
  runReportDefinition,
  listDashboards,
  getDashboardById,
  createDashboard,
  updateDashboard,
  deleteDashboard,
  duplicateDashboard,
  createDashboardTemplate,
  listDashboardTemplates,
  createDashboardFromTemplate,
  listFavorites,
  addFavorite,
  deleteFavorite,
  listDashboardShares,
  addDashboardShare,
  deleteDashboardShare,
  setRoleDefaultDashboard,
  getRoleDefaultDashboards,
  recordUsageEvent,
  listUsageAnalytics,
  validateReportConfig,
  listRecommendations,
  runDashboard,
  getModuleConfig,
  saveModuleConfig,
  getModuleSummary,
  getFilterOptions,
};
