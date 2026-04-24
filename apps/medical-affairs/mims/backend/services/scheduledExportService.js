'use strict';

const pool = require('../database/db');
const nodemailer = require('nodemailer');
const { createNotification } = require('./notificationCenterService');
const { getDatasetByReportKey } = require('./reportDatasetService');
const { recordReportRun } = require('./reportOpsService');

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

  const headers = Object.keys(rows[0]);
  const dataRows = rows.map((row) => headers.map((header) => escapeCSV(row[header])).join(','));
  return [headers.join(','), ...dataRows].join('\n');
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

function getDefaultFiltersForRun(config, now = new Date()) {
  const parsedFilters = parseFilters(config.filters);
  if (parsedFilters.date || parsedFilters.date_from || parsedFilters.date_to) return parsedFilters;

  if (!String(config.report_key || '').startsWith('daily-case-')) return parsedFilters;

  const timezoneName = validateTimezone(config.timezone_name) ? config.timezone_name : 'UTC';
  const zonedNow = getZonedParts(now, timezoneName);
  const previousDay = addCalendarDays(zonedNow.year, zonedNow.month, zonedNow.day, -1);
  const date = `${previousDay.year}-${String(previousDay.month).padStart(2, '0')}-${String(previousDay.day).padStart(2, '0')}`;
  return { ...parsedFilters, date };
}

async function deliverByEmail(config, csvContent) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 0),
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  });

  if (!config.delivery_target) {
    throw new Error('delivery_target is required for email delivery');
  }

  const fileDate = new Date().toISOString().slice(0, 10);
  const safeName = (config.export_name || 'scheduled_export').replace(/[^a-zA-Z0-9_-]/g, '_');

  await transporter.sendMail({
    from: process.env.SMTP_USER || '',
    to: config.delivery_target,
    subject: `Scheduled report: ${config.export_name}`,
    text: `Attached report ${config.report_key || 'case-summary'} for org ${config.org_id}.`,
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
  const [configs] = await pool.query(
    'SELECT * FROM scheduled_export_configs WHERE is_active = 1 ORDER BY id ASC'
  );

  for (const config of configs) {
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

    try {
      const filters = getDefaultFiltersForRun(config, now);
      const rows = await getDatasetByReportKey(config.report_key || 'case-summary', config.org_id, filters);
      rowCount = rows.length;
      const csvContent = buildCSV(rows);

      if (config.delivery_method === 'email') {
        await deliverByEmail(config, csvContent);
      } else if (config.delivery_method === 'in_app') {
        await deliverInApp(config, rows.length);
      } else {
        console.log(
          `[ScheduledExport] report ran id=${config.id} report_key=${config.report_key || 'case-summary'} rows=${rows.length}`
        );
      }
    } catch (err) {
      runStatus = 'failed';
      lastError = err?.message || String(err);
      console.error(
        `[ScheduledExport] report failed id=${config.id} org_id=${config.org_id}: ${lastError}`
      );
    } finally {
      const next = computeNextRunAtUtc(config, new Date(now.getTime() + 60 * 1000));
      await recordReportRun({
        orgId: config.org_id,
        reportKey: config.report_key || 'case-summary',
        reportName: config.export_name || config.report_key || 'Scheduled Report',
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
  if ((data.delivery_method || 'email') === 'email' && !String(data.delivery_target || '').trim()) {
    const err = new Error('delivery_target is required for email delivery');
    err.statusCode = 400;
    throw err;
  }
  const timezoneName = validateTimezone(data.timezone_name) ? data.timezone_name : 'UTC';
  const scheduleFrequency = String(data.schedule_frequency || 'daily').toLowerCase() === 'weekly' ? 'weekly' : 'daily';
  const scheduleTimeLocal = String(data.schedule_time_local || '08:00');
  const scheduleWeekday = Number.isInteger(Number(data.schedule_weekday)) ? Number(data.schedule_weekday) : 1;

  const payload = {
    export_name: exportName,
    report_key: data.report_key || 'daily-case-summary',
    export_format: data.export_format || 'csv',
    cron_expression: data.cron_expression || '0 6 * * 1',
    schedule_frequency: scheduleFrequency,
    schedule_time_local: scheduleTimeLocal,
    schedule_weekday: scheduleWeekday,
    timezone_name: timezoneName,
    filters: data.filters ? JSON.stringify(data.filters) : null,
    delivery_method: data.delivery_method || 'email',
    delivery_target: data.delivery_target || null,
  };

  const nextRunAtUtc = computeNextRunAtUtc(payload);

  const [result] = await pool.query(
    `INSERT INTO scheduled_export_configs
       (org_id, export_name, report_key, export_format, cron_expression, schedule_frequency, schedule_time_local,
        schedule_weekday, timezone_name, next_run_at_utc, filters, delivery_method, delivery_target, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orgId,
      payload.export_name,
      payload.report_key,
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
    report_key: data.report_key || existing.report_key || 'case-summary',
  };

  if (Object.prototype.hasOwnProperty.call(data, 'delivery_method') && nextConfig.delivery_method === 'email' && !String(nextConfig.delivery_target || '').trim()) {
    const err = new Error('delivery_target is required for email delivery');
    err.statusCode = 400;
    throw err;
  }

  const fields = [];
  const values = [];
  const allowed = [
    'export_name',
    'report_key',
    'export_format',
    'cron_expression',
    'schedule_frequency',
    'schedule_time_local',
    'schedule_weekday',
    'timezone_name',
    'filters',
    'delivery_method',
    'delivery_target',
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
  deleteExportConfig,
  computeNextRunAtUtc,
  validateTimezone,
};
