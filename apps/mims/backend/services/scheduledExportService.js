'use strict';

const pool = require('../database/db');
const nodemailer = require('nodemailer');
const { createNotification } = require('./notificationCenterService');
const { recordReportRun } = require('./reportOpsService');
const {
  getReportDefinitionById,
  getReportDefinitionByKey,
  runReportDefinition,
  getDashboardById,
  runDashboard,
  getModuleConfig,
} = require('./reportModuleService');

function escapeCSV(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function parseFilters(filters) {
  if (!filters) return {};
  if (typeof filters === 'object') return filters;
  try {
    return JSON.parse(filters);
  } catch (_) {
    return {};
  }
}

function buildCSV(rows) {
  if (!rows || rows.length === 0) return 'No data\n';

  const headers = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row || {}).forEach((key) => set.add(key));
      return set;
    }, new Set())
  );
  const dataRows = rows.map((row) => headers.map((header) => escapeCSV(row[header])).join(','));
  return [headers.join(','), ...dataRows].join('\n');
}

async function loadSystemConfig() {
  const [rows] = await pool.execute(
    `SELECT config_key, config_value
     FROM system_config
     WHERE config_key IN ('smtp_host', 'smtp_port', 'smtp_encryption', 'smtp_username', 'smtp_password', 'smtp_from_email', 'smtp_from_name')`
  );
  return rows.reduce((acc, row) => {
    acc[row.config_key] = row.config_value;
    return acc;
  }, {});
}

function validateTimezone(timezoneName) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezoneName }).format(new Date());
    return true;
  } catch (_) {
    return false;
  }
}

function getZonedParts(date, timezoneName) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezoneName,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const values = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second || 0),
  };
}

function addCalendarDays(year, month, day, deltaDays) {
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

function zonedLocalToUtc(year, month, day, hour, minute, timezoneName) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);

  for (let i = 0; i < 4; i += 1) {
    const actual = getZonedParts(new Date(guess), timezoneName);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0);
    guess += target - actualAsUtc;
  }

  return new Date(guess);
}

function parseScheduleTime(value) {
  const match = String(value || '06:00').match(/^(\d{2}):(\d{2})$/);
  if (!match) return { hour: 6, minute: 0 };
  return {
    hour: Math.min(23, Math.max(0, Number(match[1]))),
    minute: Math.min(59, Math.max(0, Number(match[2]))),
  };
}

function computeNextRunAtUtc(config, now = new Date()) {
  const timezoneName = validateTimezone(config.timezone_name) ? config.timezone_name : 'UTC';
  const scheduleFrequency = String(config.schedule_frequency || 'weekly').toLowerCase();
  const rawWeekday = Number.isInteger(Number(config.schedule_weekday)) ? Number(config.schedule_weekday) : 1;
  const scheduleWeekday = Math.min(6, Math.max(0, rawWeekday));
  const { hour, minute } = parseScheduleTime(config.schedule_time_local);
  const zonedNow = getZonedParts(now, timezoneName);

  let localDate = {
    year: zonedNow.year,
    month: zonedNow.month,
    day: zonedNow.day,
  };

  let candidateUtc = zonedLocalToUtc(localDate.year, localDate.month, localDate.day, hour, minute, timezoneName);

  if (scheduleFrequency === 'weekly') {
    const todayWeekday = new Date(Date.UTC(localDate.year, localDate.month - 1, localDate.day)).getUTCDay();
    let deltaDays = scheduleWeekday - todayWeekday;
    if (deltaDays < 0) deltaDays += 7;
    localDate = addCalendarDays(localDate.year, localDate.month, localDate.day, deltaDays);
    candidateUtc = zonedLocalToUtc(localDate.year, localDate.month, localDate.day, hour, minute, timezoneName);
    if (candidateUtc <= now) {
      localDate = addCalendarDays(localDate.year, localDate.month, localDate.day, 7);
      candidateUtc = zonedLocalToUtc(localDate.year, localDate.month, localDate.day, hour, minute, timezoneName);
    }
    return candidateUtc;
  }

  if (candidateUtc <= now) {
    localDate = addCalendarDays(localDate.year, localDate.month, localDate.day, 1);
    candidateUtc = zonedLocalToUtc(localDate.year, localDate.month, localDate.day, hour, minute, timezoneName);
  }

  return candidateUtc;
}

function getDefaultFiltersForRun(config, now = new Date(), reportKeyOverride = null) {
  const parsedFilters = parseFilters(config.filters);
  if (parsedFilters.date || parsedFilters.date_from || parsedFilters.date_to) return parsedFilters;

  const effectiveKey = String(reportKeyOverride || config.report_key || '');
  if (!(effectiveKey.startsWith('daily-case-') || effectiveKey === 'daily-operations-pack')) return parsedFilters;

  const timezoneName = validateTimezone(config.timezone_name) ? config.timezone_name : 'UTC';
  const zonedNow = getZonedParts(now, timezoneName);
  const previousDay = addCalendarDays(zonedNow.year, zonedNow.month, zonedNow.day, -1);
  const date = `${previousDay.year}-${String(previousDay.month).padStart(2, '0')}-${String(previousDay.day).padStart(2, '0')}`;
  return { ...parsedFilters, date };
}

async function deliverByEmail(config, csvContent) {
  const systemConfig = await loadSystemConfig();
  const moduleConfig = await getModuleConfig(config.org_id);
  const host = process.env.SMTP_HOST || systemConfig.smtp_host || '';
  const port = Number(process.env.SMTP_PORT || systemConfig.smtp_port || 0);
  const username = process.env.SMTP_USER || systemConfig.smtp_username || '';
  const password = process.env.SMTP_PASS || systemConfig.smtp_password || '';
  const encryption = process.env.SMTP_ENCRYPTION || systemConfig.smtp_encryption || 'STARTTLS';
  const fromEmail = process.env.SMTP_FROM_EMAIL || systemConfig.smtp_from_email || username;
  const fromName = moduleConfig.email_from_name || systemConfig.smtp_from_name || 'MIMS Reports';

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: encryption === 'SSL/TLS',
    requireTLS: encryption === 'STARTTLS',
    auth: {
      user: username,
      pass: password,
    },
    tls: { rejectUnauthorized: false },
  });

  if (!config.delivery_target) {
    throw new Error('delivery_target is required for email delivery');
  }

  const fileDate = new Date().toISOString().slice(0, 10);
  const safeName = (config.export_name || 'scheduled_export').replace(/[^a-zA-Z0-9_-]/g, '_');

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: config.delivery_target,
    replyTo: moduleConfig.reply_to_email || undefined,
    subject: config.email_subject || `${moduleConfig.digest_subject_prefix || '[MIMS Reports]'} ${config.export_name}`,
    text: `Attached ${config.target_type || 'report'} output for ${config.export_name}.`,
    attachments: [
      {
        filename: `${safeName}_${fileDate}.csv`,
        content: csvContent,
        contentType: 'text/csv',
      },
    ],
  });
}

async function deliverInApp(config, rowCount) {
  if (!config.created_by) return;
  await createNotification(config.created_by, {
    category: 'scheduled_report',
    severity: 'info',
    title: `Scheduled report ready: ${config.export_name}`,
    message: `${rowCount} row${rowCount === 1 ? '' : 's'} produced for ${config.report_key || 'case-summary'}.`,
    linkUrl: '/reports',
    metadata: { config_id: config.id, report_key: config.report_key, row_count: rowCount },
    eventKey: 'scheduled-report-ready',
  });
}

async function runScheduledExports(now = new Date()) {
  // M-15(a): advisory lock so overlapping ticks can't double-run configs.
  // Held on a dedicated connection for the whole sweep; a second runner that
  // fails to acquire it (timeout 0) returns immediately instead of proceeding.
  const lockConn = await pool.getConnection();
  try {
    const [[lockRow]] = await lockConn.query("SELECT GET_LOCK('scheduled_exports', 0) AS locked");
    if (!Number(lockRow?.locked)) {
      return; // another runner already holds the sweep lock
    }
    try {
      await runScheduledExportsLocked(now);
    } finally {
      await lockConn.query("SELECT RELEASE_LOCK('scheduled_exports')");
    }
  } finally {
    lockConn.release();
  }
}

async function runScheduledExportsLocked(now) {
  const [configs] = await pool.query(
    'SELECT * FROM scheduled_export_configs WHERE is_active = 1 ORDER BY id ASC'
  );

  for (const config of configs) {
    const moduleConfig = await getModuleConfig(config.org_id);
    if (!Number(moduleConfig.scheduler_enabled || 0)) continue;

    const nextRunAt = config.next_run_at_utc ? new Date(config.next_run_at_utc) : computeNextRunAtUtc(config, now);
    if (!(config.next_run_at_utc)) {
      await pool.query(
        'UPDATE scheduled_export_configs SET next_run_at_utc = ? WHERE id = ?',
        [nextRunAt, config.id]
      );
    }

    if (nextRunAt > now) continue;

    let runStatus = 'success';
    let lastError = null;
    let rowCount = 0;
    let runTargetType = config.target_type || 'report';
    let runTargetId = config.target_id || null;
    let resolvedReportKey = config.report_key || 'case-summary';
    let resolvedReportName = config.export_name || config.report_key || 'Scheduled Report';

    try {
      let csvRows = [];

      if ((config.target_type || 'report') === 'dashboard') {
        const dashboard = await getDashboardById(config.org_id, config.target_id);
        if (!dashboard) throw new Error('Scheduled dashboard target not found');
        const filters = getDefaultFiltersForRun(config, now);
        const dashboardPayload = await runDashboard(dashboard, config.org_id, filters);
        csvRows = dashboardPayload.csv_rows;
        rowCount = csvRows.length;
        resolvedReportKey = dashboard.dashboard_key;
        resolvedReportName = dashboard.name;
        runTargetType = 'dashboard';
        runTargetId = dashboard.id;
      } else {
        let definition = null;
        if (config.target_id) {
          definition = await getReportDefinitionById(config.org_id, config.target_id);
        }
        if (!definition && config.report_key) {
          definition = await getReportDefinitionByKey(config.org_id, config.report_key);
        }
        if (!definition) {
          throw new Error('Scheduled report target not found');
        }
        const filters = getDefaultFiltersForRun(config, now, definition.dataset_key);
        const reportPayload = await runReportDefinition(definition, config.org_id, filters);
        csvRows = reportPayload.rows;
        rowCount = reportPayload.row_count;
        resolvedReportKey = definition.report_key;
        resolvedReportName = definition.name;
        runTargetType = 'report';
        runTargetId = definition.id;
      }

      const csvContent = buildCSV(csvRows);

      if (config.delivery_method === 'email') {
        await deliverByEmail(config, csvContent);
      } else if (config.delivery_method === 'in_app') {
        await deliverInApp(config, rowCount);
      } else {
        console.log(
          `[ScheduledExport] report ran id=${config.id} target=${resolvedReportKey} rows=${rowCount}`
        );
      }
    } catch (err) {
      runStatus = 'failed';
      lastError = err?.message || String(err);
      console.error(
        `[ScheduledExport] report failed id=${config.id} org_id=${config.org_id}: ${lastError}`
      );
    } finally {
      // M-15(b): advance the cursor from this run's scheduled time, not wall-clock
      // `now`, so cadence stays anchored to the schedule and does not drift when a
      // tick fires late. +1s past nextRunAt so computeNextRunAtUtc yields the next slot.
      const cursorBase = new Date(nextRunAt.getTime() + 1000);
      const next = computeNextRunAtUtc(config, cursorBase);
      await recordReportRun({
        orgId: config.org_id,
        reportKey: resolvedReportKey,
        reportName: resolvedReportName,
        targetType: runTargetType,
        targetId: runTargetId,
        runMode: 'scheduled',
        triggeredBy: config.created_by || null,
        filters: getDefaultFiltersForRun(config, now),
        timezoneName: config.timezone_name || 'UTC',
        rowCount,
        deliveryMethod: config.delivery_method || null,
        deliveryTarget: config.delivery_target || null,
        status: runStatus,
        errorMessage: lastError,
      }).catch(() => {});
      await pool.query(
        `UPDATE scheduled_export_configs
         SET last_run_at = NOW(),
             last_run_status = ?,
             last_error = ?,
             next_run_at_utc = ?
         WHERE id = ?`,
        [runStatus, lastError, next, config.id]
      );
    }
  }
}

async function getExportConfigs(orgId) {
  const [rows] = await pool.query(
    'SELECT * FROM scheduled_export_configs WHERE org_id = ? ORDER BY created_at DESC',
    [orgId]
  );
  return rows.map((row) => ({ ...row, filters: parseFilters(row.filters) }));
}

async function createExportConfig(orgId, userId, data) {
  const exportName = String(data.export_name || '').trim();
  if (!exportName) {
    const err = new Error('export_name is required');
    err.statusCode = 400;
    throw err;
  }
  const moduleConfig = await getModuleConfig(orgId);
  const deliveryMethod = data.delivery_method || moduleConfig.default_delivery_method || 'email';
  const deliveryTarget = String(data.delivery_target || moduleConfig.default_delivery_target || '').trim();
  if (deliveryMethod === 'email' && !deliveryTarget) {
    const err = new Error('delivery_target is required for email delivery');
    err.statusCode = 400;
    throw err;
  }
  const timezoneName = validateTimezone(data.timezone_name) ? data.timezone_name : 'UTC';
  const scheduleFrequency = String(data.schedule_frequency || 'daily').toLowerCase() === 'weekly' ? 'weekly' : 'daily';
  const scheduleTimeLocal = String(data.schedule_time_local || '08:00');
  const scheduleWeekday = Number.isInteger(Number(data.schedule_weekday)) ? Number(data.schedule_weekday) : 1;
  const targetType = String(data.target_type || 'report').toLowerCase() === 'dashboard' ? 'dashboard' : 'report';
  const targetId = data.target_id ? Number(data.target_id) : null;
  const reportDefinition = targetType === 'report' && targetId
    ? await getReportDefinitionById(orgId, targetId)
    : null;
  const dashboardDefinition = targetType === 'dashboard' && targetId
    ? await getDashboardById(orgId, targetId)
    : null;
  if (targetType === 'report' && !reportDefinition) {
    const err = new Error('A valid report target is required');
    err.statusCode = 400;
    throw err;
  }
  if (targetType === 'dashboard' && !dashboardDefinition) {
    const err = new Error('A valid dashboard target is required');
    err.statusCode = 400;
    throw err;
  }

  const payload = {
    export_name: exportName,
    target_type: targetType,
    report_key: data.report_key || reportDefinition?.report_key || (targetType === 'dashboard' ? `dashboard-${targetId || 'bundle'}` : 'daily-case-summary'),
    target_id: targetId,
    export_format: data.export_format || 'csv',
    cron_expression: data.cron_expression || '0 6 * * 1',
    schedule_frequency: scheduleFrequency,
    schedule_time_local: scheduleTimeLocal,
    schedule_weekday: scheduleWeekday,
    timezone_name: timezoneName,
    filters: data.filters ? JSON.stringify(data.filters) : null,
    delivery_method: deliveryMethod,
    delivery_target: deliveryTarget || null,
    email_subject: data.email_subject || null,
  };

  const nextRunAtUtc = computeNextRunAtUtc(payload);

  const [result] = await pool.query(
    `INSERT INTO scheduled_export_configs
       (org_id, export_name, target_type, report_key, target_id, export_format, cron_expression, schedule_frequency, schedule_time_local,
        schedule_weekday, timezone_name, next_run_at_utc, filters, delivery_method, delivery_target, email_subject, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orgId,
      payload.export_name,
      payload.target_type,
      payload.report_key,
      payload.target_id,
      payload.export_format,
      payload.cron_expression,
      payload.schedule_frequency,
      payload.schedule_time_local,
      payload.schedule_weekday,
      payload.timezone_name,
      nextRunAtUtc,
      payload.filters,
      payload.delivery_method,
      payload.delivery_target,
      payload.email_subject,
      userId,
    ]
  );

  return result.insertId;
}

async function updateExportConfig(id, orgId, data) {
  const [existingRows] = await pool.query(
    'SELECT * FROM scheduled_export_configs WHERE id = ? AND org_id = ? LIMIT 1',
    [id, orgId]
  );

  if (!existingRows.length) {
    const err = new Error('Config not found');
    err.statusCode = 404;
    throw err;
  }

  const existing = existingRows[0];
  const nextConfig = {
    ...existing,
    ...data,
    timezone_name: data.timezone_name ? (validateTimezone(data.timezone_name) ? data.timezone_name : 'UTC') : existing.timezone_name,
    schedule_frequency: data.schedule_frequency ? (String(data.schedule_frequency).toLowerCase() === 'weekly' ? 'weekly' : 'daily') : existing.schedule_frequency,
    schedule_time_local: data.schedule_time_local || existing.schedule_time_local,
    schedule_weekday: Object.prototype.hasOwnProperty.call(data, 'schedule_weekday')
      ? Number(data.schedule_weekday)
      : existing.schedule_weekday,
    target_type: data.target_type ? (String(data.target_type).toLowerCase() === 'dashboard' ? 'dashboard' : 'report') : existing.target_type || 'report',
    target_id: Object.prototype.hasOwnProperty.call(data, 'target_id') ? Number(data.target_id || 0) || null : existing.target_id,
  };
  nextConfig.report_key = data.report_key || existing.report_key || (nextConfig.target_type === 'dashboard' ? `dashboard-${nextConfig.target_id || 'bundle'}` : 'case-summary');

  if (nextConfig.target_type === 'report' && nextConfig.target_id && !await getReportDefinitionById(orgId, nextConfig.target_id)) {
    const err = new Error('A valid report target is required');
    err.statusCode = 400;
    throw err;
  }
  if (nextConfig.target_type === 'dashboard' && nextConfig.target_id && !await getDashboardById(orgId, nextConfig.target_id)) {
    const err = new Error('A valid dashboard target is required');
    err.statusCode = 400;
    throw err;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'delivery_method') && nextConfig.delivery_method === 'email' && !String(nextConfig.delivery_target || '').trim()) {
    const err = new Error('delivery_target is required for email delivery');
    err.statusCode = 400;
    throw err;
  }

  const fields = [];
  const values = [];
  const allowed = [
    'export_name',
    'target_type',
    'report_key',
    'target_id',
    'export_format',
    'cron_expression',
    'schedule_frequency',
    'schedule_time_local',
    'schedule_weekday',
    'timezone_name',
    'filters',
    'delivery_method',
    'delivery_target',
    'email_subject',
    'is_active',
  ];

  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    fields.push(`${key} = ?`);
    values.push(key === 'filters' ? (data[key] ? JSON.stringify(data[key]) : null) : nextConfig[key]);
  }

  fields.push('next_run_at_utc = ?');
  values.push(computeNextRunAtUtc(nextConfig));
  values.push(id, orgId);

  await pool.query(
    `UPDATE scheduled_export_configs
     SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = ? AND org_id = ?`,
    values
  );
}

async function pauseExportConfig(id, orgId, userId) {
  const [result] = await pool.query(
    `UPDATE scheduled_export_configs
     SET is_active = 0, paused_at = NOW(), paused_by = ?, updated_at = NOW()
     WHERE id = ? AND org_id = ?`,
    [userId || null, id, orgId]
  );
  if (!result.affectedRows) {
    const err = new Error('Config not found');
    err.statusCode = 404;
    throw err;
  }
}

async function resumeExportConfig(id, orgId) {
  const [rows] = await pool.query(
    'SELECT * FROM scheduled_export_configs WHERE id = ? AND org_id = ? LIMIT 1',
    [id, orgId]
  );
  if (!rows.length) {
    const err = new Error('Config not found');
    err.statusCode = 404;
    throw err;
  }
  const nextRunAtUtc = computeNextRunAtUtc(rows[0]);
  await pool.query(
    `UPDATE scheduled_export_configs
     SET is_active = 1, paused_at = NULL, paused_by = NULL, next_run_at_utc = ?, updated_at = NOW()
     WHERE id = ? AND org_id = ?`,
    [nextRunAtUtc, id, orgId]
  );
}

async function deleteExportConfig(id, orgId) {
  const [result] = await pool.query(
    'DELETE FROM scheduled_export_configs WHERE id = ? AND org_id = ?',
    [id, orgId]
  );

  if (!result.affectedRows) {
    const err = new Error('Config not found');
    err.statusCode = 404;
    throw err;
  }
}

module.exports = {
  runScheduledExports,
  getExportConfigs,
  createExportConfig,
  updateExportConfig,
  pauseExportConfig,
  resumeExportConfig,
  deleteExportConfig,
  computeNextRunAtUtc,
  validateTimezone,
};
