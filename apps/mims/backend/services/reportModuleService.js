'use strict';

const pool = require('../database/db');
const { getDatasetByReportKey } = require('./reportDatasetService');

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
  command_center: 'Command Center',
  inbox_operations: 'Inbox Operations',
  case_operational: 'Case Operational',
  case_detail: 'Case Detail',
  case_compliance: 'Case Compliance',
  platform_analytics: 'Platform Analytics',
  platform_deep_analytics: 'Platform Deep Analytics',
});

const BUILTIN_REPORT_DEFINITIONS = Object.freeze([
  {
    report_key: 'daily-operations-pack',
    dataset_key: 'daily-operations-pack',
    name: 'Daily Operations Pack',
    description: 'Leadership pack for openings, closures, backlog, and inbox operational risk.',
    group_key: 'command_center',
    default_filters: { date_from: '', date_to: '' },
    allowed_filters: ['date_from', 'date_to'],
  },
  {
    report_key: 'daily-case-summary',
    dataset_key: 'daily-case-summary',
    name: 'Daily Case Summary',
    description: 'Aggregated case openings, closures, and backlog for the selected period.',
    group_key: 'case_operational',
    default_filters: { date_from: '', date_to: '' },
    allowed_filters: ['date_from', 'date_to'],
  },
  {
    report_key: 'daily-case-openings',
    dataset_key: 'daily-case-openings',
    name: 'Daily Case Openings',
    description: 'Detailed case list for newly opened cases.',
    group_key: 'case_detail',
    default_filters: { date_from: '', date_to: '' },
    allowed_filters: ['date_from', 'date_to'],
  },
  {
    report_key: 'daily-case-closures',
    dataset_key: 'daily-case-closures',
    name: 'Daily Case Closures',
    description: 'Detailed case list for cases closed in the selected period.',
    group_key: 'case_detail',
    default_filters: { date_from: '', date_to: '' },
    allowed_filters: ['date_from', 'date_to'],
  },
  {
    report_key: 'inbox-performance',
    dataset_key: 'inbox-performance',
    name: 'Inbox Performance',
    description: 'Operational view of queue throughput, ownership, and breach counts.',
    group_key: 'inbox_operations',
    default_filters: { date_from: '', date_to: '' },
    allowed_filters: ['date_from', 'date_to'],
  },
  {
    report_key: 'inbox-sla',
    dataset_key: 'inbox-sla',
    name: 'Inbox SLA',
    description: 'Item-level SLA status for first touch and first response.',
    group_key: 'inbox_operations',
    default_filters: { date_from: '', date_to: '' },
    allowed_filters: ['date_from', 'date_to'],
  },
  {
    report_key: 'transmission-sla',
    dataset_key: 'transmission-sla',
    name: 'Transmission SLA',
    description: 'Open AE and PC transmissions with current SLA state and escalation level.',
    group_key: 'case_compliance',
    default_filters: { date_from: '', date_to: '' },
    allowed_filters: ['date_from', 'date_to'],
  },
  {
    report_key: 'case-source',
    dataset_key: 'case-source',
    name: 'Cases by Source',
    description: 'Case origin sources for the selected period.',
    group_key: 'case_detail',
    default_filters: { date_from: '', date_to: '' },
    allowed_filters: ['date_from', 'date_to'],
  },
  {
    report_key: 'case-duplicates',
    dataset_key: 'case-duplicates',
    name: 'Duplicate Cases',
    description: 'Potential duplicate case pairs within the selected period.',
    group_key: 'case_detail',
    default_filters: { date_from: '', date_to: '' },
    allowed_filters: ['date_from', 'date_to'],
  },
  {
    report_key: 'regulatory-readiness',
    dataset_key: 'regulatory-readiness',
    name: 'Regulatory Readiness',
    description: 'Cases reviewed for regulatory submission readiness.',
    group_key: 'case_compliance',
    default_filters: {},
    allowed_filters: [],
  },
  {
    report_key: 'case-monthly-trend',
    dataset_key: 'case-monthly-trend',
    name: 'Monthly Case Trend',
    description: 'Month-on-month case volume for compliance trending.',
    group_key: 'case_compliance',
    default_filters: { months: 6 },
    allowed_filters: ['months'],
  },
  {
    report_key: 'case-closure-rate',
    dataset_key: 'case-closure-rate',
    name: 'Case Closure Rate',
    description: 'Percentage of cases closed within the selected date range.',
    group_key: 'case_compliance',
    default_filters: { date_from: '', date_to: '' },
    allowed_filters: ['date_from', 'date_to'],
  },
  {
    report_key: 'case-by-org',
    dataset_key: 'case-by-org',
    name: 'Cases by Organisation',
    description: 'Platform-admin view of case volume per organisation.',
    group_key: 'case_compliance',
    default_filters: {},
    allowed_filters: [],
  },
  {
    report_key: 'user-activity',
    dataset_key: 'user-activity',
    name: 'User Activity',
    description: 'Login frequency and active users over the selected period.',
    group_key: 'platform_analytics',
    default_filters: { date_from: '', date_to: '' },
    allowed_filters: ['date_from', 'date_to'],
  },
  {
    report_key: 'module-usage',
    dataset_key: 'module-usage',
    name: 'Module Usage',
    description: 'Most accessed platform modules over the last 30 days.',
    group_key: 'platform_analytics',
    default_filters: {},
    allowed_filters: [],
  },
  {
    report_key: 'org-activity',
    dataset_key: 'org-activity',
    name: 'Organisation Activity',
    description: 'Case and login activity per organisation.',
    group_key: 'platform_analytics',
    default_filters: {},
    allowed_filters: [],
  },
  {
    report_key: 'user-roles',
    dataset_key: 'user-roles',
    name: 'User Roles',
    description: 'Distribution of users across roles for the active organisation.',
    group_key: 'platform_analytics',
    default_filters: {},
    allowed_filters: [],
  },
  {
    report_key: 'content-usage',
    dataset_key: 'content-usage',
    name: 'Content Usage',
    description: 'Document access and FAQ usage frequency.',
    group_key: 'platform_analytics',
    default_filters: {},
    allowed_filters: [],
  },
  {
    report_key: 'security-events',
    dataset_key: 'security-events',
    name: 'Security Events',
    description: 'Failed logins, IP blocks, and two-factor lockout events.',
    group_key: 'platform_deep_analytics',
    default_filters: { date_from: '', date_to: '' },
    allowed_filters: ['date_from', 'date_to'],
  },
  {
    report_key: 'integration-sync',
    dataset_key: 'integration-sync',
    name: 'Integration Sync',
    description: 'Vault, MIR, and CRM sync state visibility.',
    group_key: 'platform_deep_analytics',
    default_filters: {},
    allowed_filters: [],
  },
  {
    report_key: 'audit-summary',
    dataset_key: 'audit-summary',
    name: 'Audit Summary',
    description: 'Summary of audit trail events over time.',
    group_key: 'platform_deep_analytics',
    default_filters: { date_from: '', date_to: '' },
    allowed_filters: ['date_from', 'date_to'],
  },
  {
    report_key: 'system-health',
    dataset_key: 'system-health',
    name: 'System Health',
    description: 'Background jobs, scheduler runs, and error-rate indicators.',
    group_key: 'platform_deep_analytics',
    default_filters: {},
    allowed_filters: [],
  },
  {
    report_key: 'field-usage',
    dataset_key: 'field-usage',
    name: 'Field Usage',
    description: 'Case form field population and adoption.',
    group_key: 'platform_deep_analytics',
    default_filters: {},
    allowed_filters: [],
  },
]);

const BUILTIN_DASHBOARDS = Object.freeze([
  {
    dashboard_key: 'operations-command-center',
    name: 'Operations Command Center',
    description: 'Single-screen operational view for openings, queues, and transmission risk.',
    widgets: [
      { id: 'ops-pack', title: 'Daily Operations Pack', report_key: 'daily-operations-pack', display_mode: 'kpi-grid', limit: 7 },
      { id: 'ops-inbox', title: 'Inbox Performance', report_key: 'inbox-performance', display_mode: 'table', limit: 6 },
      { id: 'ops-transmission', title: 'Transmission SLA', report_key: 'transmission-sla', display_mode: 'table', limit: 6 },
    ],
  },
  {
    dashboard_key: 'case-compliance-watch',
    name: 'Case Compliance Watch',
    description: 'Monitors closure discipline, regulatory readiness, and trends.',
    widgets: [
      { id: 'closure-rate', title: 'Case Closure Rate', report_key: 'case-closure-rate', display_mode: 'kpi-grid', limit: 4 },
      { id: 'trend', title: 'Monthly Case Trend', report_key: 'case-monthly-trend', display_mode: 'list', limit: 6 },
      { id: 'readiness', title: 'Regulatory Readiness', report_key: 'regulatory-readiness', display_mode: 'table', limit: 6 },
    ],
  },
  {
    dashboard_key: 'platform-observability',
    name: 'Platform Observability',
    description: 'Visibility into system health, security events, and module usage.',
    widgets: [
      { id: 'system-health', title: 'System Health', report_key: 'system-health', display_mode: 'table', limit: 5 },
      { id: 'security-events', title: 'Security Events', report_key: 'security-events', display_mode: 'list', limit: 8 },
      { id: 'module-usage', title: 'Module Usage', report_key: 'module-usage', display_mode: 'table', limit: 6 },
    ],
  },
]);

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

function normalizeSensitivity(value) {
  const next = sanitizeText(value, 'standard').toLowerCase();
  return ['standard', 'restricted', 'sensitive'].includes(next) ? next : 'standard';
}

function normalizeLifecycle(value) {
  const next = sanitizeText(value, 'published').toLowerCase();
  return ['draft', 'published', 'certified', 'archived'].includes(next) ? next : 'published';
}

function parseFormulaFields(value) {
  const parsed = parseJson(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((field) => ({
      key: slugify(field.key || field.label || ''),
      label: sanitizeText(field.label || field.key || ''),
      expression: sanitizeText(field.expression || ''),
    }))
    .filter((field) => field.key && field.expression);
}

function validateFormulaFields(fields = []) {
  const unsafe = fields.find((field) => !/^[a-zA-Z0-9_\s.+\-*/()%<>=!&|?:'"]+$/.test(field.expression || ''));
  if (unsafe) throw new Error(`Unsafe formula expression for ${unsafe.key}.`);
}

function applyFormulaFields(rows = [], fields = []) {
  if (!Array.isArray(fields) || fields.length === 0) return rows;
  validateFormulaFields(fields);
  return rows.map((row) => {
    const next = { ...row };
    for (const field of fields) {
      try {
        const args = Object.keys(row || {});
        const values = args.map((key) => row[key]);
        // Expressions are regex-limited above and executed only against row values.
        next[field.key] = Function(...args, `"use strict"; return (${field.expression});`)(...values);
      } catch (_) {
        next[field.key] = null;
      }
    }
    return next;
  });
}

function normalizeDefinition(row) {
  if (!row) return null;
  return {
    id: row.id,
    org_id: row.org_id,
    report_key: row.report_key,
    dataset_key: row.dataset_key,
    name: row.name,
    description: row.description || '',
    group_key: row.group_key,
    group_label: REPORT_GROUP_LABELS[row.group_key] || row.group_key,
    allowed_filters: parseJson(row.allowed_filters, []),
    default_filters: parseJson(row.default_filters, {}),
    selected_columns: parseJson(row.selected_columns, []),
    formula_fields: parseFormulaFields(row.formula_fields),
    visibility_scope: row.visibility_scope || 'shared',
    lifecycle_status: normalizeLifecycle(row.lifecycle_status),
    draft: parseJson(row.draft_json, null),
    sensitivity_level: normalizeSensitivity(row.sensitivity_level),
    owner_id: row.owner_id || row.created_by || null,
    certified_by: row.certified_by || null,
    certified_at: row.certified_at || null,
    certification_expires_at: row.certification_expires_at || null,
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
    visibility_scope: row.visibility_scope || 'shared',
    lifecycle_status: normalizeLifecycle(row.lifecycle_status),
    draft: parseJson(row.draft_json, null),
    sensitivity_level: normalizeSensitivity(row.sensitivity_level),
    owner_id: row.owner_id || row.created_by || null,
    is_template: !!row.is_template,
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'shared', 1, 1, NULL, NULL)
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
        ]
      );
    }

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
    default_report_key: item.report_key,
    name: item.name,
    description: item.description,
    group_key: item.group_key,
    group_label: REPORT_GROUP_LABELS[item.group_key] || item.group_key,
    allowed_filters: item.allowed_filters || [],
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
       ${includeInactive ? '' : 'AND is_active = 1'}
       ${productGroupFilter}
     ORDER BY
       CASE WHEN org_id IS NULL THEN 0 ELSE 1 END,
       group_key ASC,
       name ASC`,
    params
  );
  return rows.map(normalizeDefinition);
}

async function getReportDefinitionById(orgId, id) {
  await ensureReportModuleSeed();
  const [rows] = await pool.execute(
    `SELECT *
     FROM report_definitions
     WHERE id = ?
       AND (org_id IS NULL OR org_id = ?)
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

async function recordEntityVersion(orgId, entityType, entityId, snapshot, userId, changeSummary) {
  if (!orgId || !entityType || !entityId || !snapshot) return null;
  const [[row]] = await pool.execute(
    'SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version FROM report_entity_versions WHERE org_id = ? AND entity_type = ? AND entity_id = ?',
    [orgId, entityType, entityId]
  );
  const versionNumber = Number(row?.next_version || 1);
  await pool.execute(
    `INSERT INTO report_entity_versions
       (org_id, entity_type, entity_id, version_number, snapshot_json, change_summary, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [orgId, entityType, entityId, versionNumber, JSON.stringify(snapshot), sanitizeText(changeSummary), userId || null]
  );
  return versionNumber;
}

async function listEntityVersions(orgId, entityType, entityId) {
  const [rows] = await pool.execute(
    `SELECT id, entity_type, entity_id, version_number, snapshot_json, change_summary, created_by, created_at
     FROM report_entity_versions
     WHERE org_id = ? AND entity_type = ? AND entity_id = ?
     ORDER BY version_number DESC`,
    [orgId, entityType, entityId]
  );
  return rows.map((row) => ({ ...row, snapshot: parseJson(row.snapshot_json, {}) }));
}

async function validateReportPayload(orgId, payload = {}, existing = null) {
  const datasetKey = sanitizeText(payload.dataset_key || existing?.dataset_key);
  if (!datasetKey) throw new Error('dataset_key is required.');
  const catalogItem = getDatasetCatalog().find((item) => item.dataset_key === datasetKey);
  if (!catalogItem) throw new Error('Unsupported dataset_key.');
  const name = sanitizeText(payload.name || existing?.name || catalogItem.name);
  if (!name) throw new Error('Report name is required.');
  const formulaFields = parseFormulaFields(payload.formula_fields || existing?.formula_fields || []);
  validateFormulaFields(formulaFields);
  const selectedColumns = Array.isArray(payload.selected_columns) ? payload.selected_columns : existing?.selected_columns || [];
  if (selectedColumns.length) {
    const preview = await previewDataset(datasetKey, orgId, payload.default_filters || existing?.default_filters || {});
    const available = new Set([...(preview.columns || []), ...formulaFields.map((field) => field.key)]);
    const invalid = selectedColumns.filter((column) => !available.has(column));
    if (invalid.length) throw new Error(`Invalid selected columns: ${invalid.join(', ')}`);
  }
  return { catalogItem, formulaFields };
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
        selected_columns, formula_fields, visibility_scope, lifecycle_status, sensitivity_level, is_system, is_active, created_by, updated_by, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, 0, ?, ?, ?, ?)`,
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
      toJson(parseFormulaFields(payload.formula_fields || []), []),
      sanitizeText(payload.visibility_scope, 'shared'),
      normalizeSensitivity(payload.sensitivity_level),
      toBoolInt(payload.is_active, 1),
      userId || null,
      userId || null,
      userId || null,
    ]
  );
  const created = await getReportDefinitionById(orgId, result.insertId);
  await recordEntityVersion(orgId, 'report', created.id, created, userId, 'created');
  return created;
}

async function updateReportDefinition(orgId, userId, id, payload = {}) {
  const existing = await getReportDefinitionById(orgId, id);
  if (!existing) throw new Error('Report definition not found.');
  if (existing.is_system) throw new Error('System report definitions cannot be edited.');
  await validateReportPayload(orgId, payload, existing);

  if (existing.lifecycle_status === 'certified' || existing.certified_at) {
    const draft = {
      ...existing,
      ...payload,
      id: existing.id,
      report_key: existing.report_key,
      dataset_key: sanitizeText(payload.dataset_key, existing.dataset_key),
      formula_fields: parseFormulaFields(payload.formula_fields || existing.formula_fields || []),
      default_filters: payload.default_filters || existing.default_filters || {},
      selected_columns: Array.isArray(payload.selected_columns) ? payload.selected_columns : existing.selected_columns || [],
    };
    await pool.execute(
      `UPDATE report_definitions
       SET draft_json = ?, lifecycle_status = 'draft', updated_by = ?, updated_at = NOW()
       WHERE id = ? AND org_id = ?`,
      [JSON.stringify(draft), userId || null, id, orgId]
    );
    const updated = await getReportDefinitionById(orgId, id);
    await recordEntityVersion(orgId, 'report', id, updated, userId, 'draft updated');
    return updated;
  }

  await pool.execute(
    `UPDATE report_definitions
     SET name = ?,
         description = ?,
         group_key = ?,
         default_filters = ?,
         selected_columns = ?,
         formula_fields = ?,
         visibility_scope = ?,
         lifecycle_status = ?,
         sensitivity_level = ?,
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
      toJson(parseFormulaFields(payload.formula_fields || existing.formula_fields || []), []),
      sanitizeText(payload.visibility_scope, existing.visibility_scope || 'shared'),
      normalizeLifecycle(payload.lifecycle_status || existing.lifecycle_status),
      normalizeSensitivity(payload.sensitivity_level || existing.sensitivity_level),
      payload.owner_id || existing.owner_id || userId || null,
      toBoolInt(payload.is_active, existing.is_active ? 1 : 0),
      userId || null,
      id,
      orgId,
    ]
  );
  const updated = await getReportDefinitionById(orgId, id);
  await recordEntityVersion(orgId, 'report', id, updated, userId, 'updated');
  return updated;
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

async function runReportDefinition(definition, orgId, filters = {}) {
  const mergedFilters = {
    ...(definition.default_filters || {}),
    ...(filters || {}),
  };
  const sourceRows = await getDatasetByReportKey(definition.dataset_key, orgId, mergedFilters);
  const rows = applyFormulaFields(sourceRows, definition.formula_fields || []);
  const visible = pickVisibleColumns(rows, definition.selected_columns);
  return {
    definition,
    filters: mergedFilters,
    columns: visible.columns,
    rows: visible.rows,
    row_count: visible.rows.length,
  };
}

async function previewDataset(datasetKey, orgId, filters = {}) {
  const catalogItem = getDatasetCatalog().find((item) => item.dataset_key === datasetKey);
  if (!catalogItem) throw new Error('Unsupported dataset_key.');
  return runReportDefinition({
    ...catalogItem,
    selected_columns: [],
    default_filters: {},
  }, orgId, filters);
}

async function listDashboards(orgId, options = {}) {
  await ensureReportModuleSeed();
  const includeInactive = !!options.includeInactive;
  const [rows] = await pool.execute(
    `SELECT *
     FROM report_dashboards
     WHERE (org_id IS NULL OR org_id = ?)
       ${includeInactive ? '' : 'AND is_active = 1'}
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
       (org_id, dashboard_key, name, description, layout_json, widgets_json, visibility_scope, lifecycle_status,
        sensitivity_level, is_system, is_active, created_by, updated_by, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, 0, ?, ?, ?, ?)`,
    [
      orgId,
      dashboardKey,
      name,
      sanitizeText(payload.description),
      JSON.stringify(Array.isArray(payload.layout) ? payload.layout : []),
      JSON.stringify(Array.isArray(payload.widgets) ? payload.widgets : []),
      sanitizeText(payload.visibility_scope, 'shared'),
      normalizeSensitivity(payload.sensitivity_level),
      toBoolInt(payload.is_active, 1),
      userId || null,
      userId || null,
      userId || null,
    ]
  );
  const created = await getDashboardById(orgId, result.insertId);
  await recordEntityVersion(orgId, 'dashboard', created.id, created, userId, 'created');
  return created;
}

async function updateDashboard(orgId, userId, id, payload = {}) {
  const existing = await getDashboardById(orgId, id);
  if (!existing) throw new Error('Dashboard not found.');
  if (existing.is_system) throw new Error('System dashboards cannot be edited.');
  await validateDashboardPayload(orgId, payload, existing);

  if (existing.lifecycle_status === 'certified') {
    const draft = {
      ...existing,
      ...payload,
      id: existing.id,
      dashboard_key: existing.dashboard_key,
      widgets: Array.isArray(payload.widgets) ? payload.widgets : existing.widgets || [],
      layout: Array.isArray(payload.layout) ? payload.layout : existing.layout || [],
    };
    await pool.execute(
      `UPDATE report_dashboards
       SET draft_json = ?, lifecycle_status = 'draft', updated_by = ?, updated_at = NOW()
       WHERE id = ? AND org_id = ?`,
      [JSON.stringify(draft), userId || null, id, orgId]
    );
    const updated = await getDashboardById(orgId, id);
    await recordEntityVersion(orgId, 'dashboard', id, updated, userId, 'draft updated');
    return updated;
  }

  await pool.execute(
    `UPDATE report_dashboards
     SET name = ?,
         description = ?,
         layout_json = ?,
         widgets_json = ?,
         visibility_scope = ?,
         lifecycle_status = ?,
         sensitivity_level = ?,
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
      sanitizeText(payload.visibility_scope, existing.visibility_scope || 'shared'),
      normalizeLifecycle(payload.lifecycle_status || existing.lifecycle_status),
      normalizeSensitivity(payload.sensitivity_level || existing.sensitivity_level),
      payload.owner_id || existing.owner_id || userId || null,
      toBoolInt(payload.is_active, existing.is_active ? 1 : 0),
      userId || null,
      id,
      orgId,
    ]
  );
  const updated = await getDashboardById(orgId, id);
  await recordEntityVersion(orgId, 'dashboard', id, updated, userId, 'updated');
  return updated;
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

async function runDashboard(dashboard, orgId, filters = {}) {
  const widgets = [];
  for (const widget of dashboard.widgets || []) {
    const definition = widget.report_definition_id
      ? await getReportDefinitionById(orgId, widget.report_definition_id)
      : await getReportDefinitionByKey(orgId, widget.report_key);
    if (!definition) continue;
    const result = await runReportDefinition(definition, orgId, filters);
    widgets.push({
      id: widget.id || `${definition.report_key}-${widgets.length + 1}`,
      title: widget.title || definition.name,
      display_mode: widget.display_mode || 'table',
      report_key: definition.report_key,
      definition_id: definition.id,
      rows: result.rows.slice(0, Number(widget.limit || 6)),
      columns: result.columns,
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
    formula_fields: existing.formula_fields,
    visibility_scope: existing.visibility_scope,
    sensitivity_level: existing.sensitivity_level,
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
    sensitivity_level: existing.sensitivity_level,
    is_active: true,
  });
}

async function publishReportDefinition(orgId, userId, id) {
  const existing = await getReportDefinitionById(orgId, id);
  if (!existing) throw new Error('Report definition not found.');
  if (existing.is_system) throw new Error('System report definitions cannot be published.');
  const draft = existing.draft || {};
  const payload = Object.keys(draft).length ? draft : existing;
  await validateReportPayload(orgId, payload, existing);
  await pool.execute(
    `UPDATE report_definitions
     SET name = ?, description = ?, dataset_key = ?, group_key = ?, default_filters = ?, selected_columns = ?,
         formula_fields = ?, visibility_scope = ?, lifecycle_status = 'published', draft_json = NULL,
         sensitivity_level = ?, updated_by = ?, updated_at = NOW()
     WHERE id = ? AND org_id = ?`,
    [
      sanitizeText(payload.name, existing.name),
      sanitizeText(payload.description, existing.description),
      sanitizeText(payload.dataset_key, existing.dataset_key),
      sanitizeText(payload.group_key, existing.group_key),
      toJson(payload.default_filters || existing.default_filters || {}, {}),
      toJson(Array.isArray(payload.selected_columns) ? payload.selected_columns : existing.selected_columns || [], []),
      toJson(parseFormulaFields(payload.formula_fields || existing.formula_fields || []), []),
      sanitizeText(payload.visibility_scope, existing.visibility_scope || 'shared'),
      normalizeSensitivity(payload.sensitivity_level || existing.sensitivity_level),
      userId || null,
      id,
      orgId,
    ]
  );
  const updated = await getReportDefinitionById(orgId, id);
  await recordEntityVersion(orgId, 'report', id, updated, userId, 'published');
  return updated;
}

async function certifyReportDefinition(orgId, userId, id, payload = {}) {
  const existing = await getReportDefinitionById(orgId, id);
  if (!existing) throw new Error('Report definition not found.');
  if (existing.lifecycle_status === 'draft') throw new Error('Publish draft before certification.');
  await pool.execute(
    `UPDATE report_definitions
     SET lifecycle_status = 'certified',
         certified_by = ?,
         certified_at = NOW(),
         certification_expires_at = ?,
         sensitivity_level = ?,
         updated_by = ?,
         updated_at = NOW()
     WHERE id = ? AND (org_id = ? OR org_id IS NULL)`,
    [
      userId || null,
      payload.certification_expires_at || null,
      normalizeSensitivity(payload.sensitivity_level || existing.sensitivity_level || 'restricted'),
      userId || null,
      id,
      orgId,
    ]
  );
  const updated = await getReportDefinitionById(orgId, id);
  await recordEntityVersion(orgId, 'report', id, updated, userId, 'certified');
  return updated;
}

async function publishDashboard(orgId, userId, id) {
  const existing = await getDashboardById(orgId, id);
  if (!existing) throw new Error('Dashboard not found.');
  if (existing.is_system) throw new Error('System dashboards cannot be published.');
  const draft = existing.draft || {};
  const payload = Object.keys(draft).length ? draft : existing;
  await validateDashboardPayload(orgId, payload, existing);
  await pool.execute(
    `UPDATE report_dashboards
     SET name = ?, description = ?, layout_json = ?, widgets_json = ?, visibility_scope = ?,
         lifecycle_status = 'published', draft_json = NULL, sensitivity_level = ?, updated_by = ?, updated_at = NOW()
     WHERE id = ? AND org_id = ?`,
    [
      sanitizeText(payload.name, existing.name),
      sanitizeText(payload.description, existing.description),
      toJson(Array.isArray(payload.layout) ? payload.layout : existing.layout || [], []),
      toJson(Array.isArray(payload.widgets) ? payload.widgets : existing.widgets || [], []),
      sanitizeText(payload.visibility_scope, existing.visibility_scope || 'shared'),
      normalizeSensitivity(payload.sensitivity_level || existing.sensitivity_level),
      userId || null,
      id,
      orgId,
    ]
  );
  const updated = await getDashboardById(orgId, id);
  await recordEntityVersion(orgId, 'dashboard', id, updated, userId, 'published');
  return updated;
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
    sensitivity_level: payload.sensitivity_level || 'standard',
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
  publishReportDefinition,
  certifyReportDefinition,
  listEntityVersions,
  previewDataset,
  runReportDefinition,
  listDashboards,
  getDashboardById,
  createDashboard,
  updateDashboard,
  deleteDashboard,
  duplicateDashboard,
  publishDashboard,
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
};
