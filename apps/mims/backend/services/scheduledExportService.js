'use strict';

/**
 * scheduledExportService.js — reports and dashboards emailed or notified on a
 * schedule.
 *
 * Reports review (Saad, 2026-10-14):
 *   - each schedule covers a period (yesterday, last 7 days, last month ...)
 *     worked out on the schedule's own calendar; only the daily case reports
 *     got "yesterday" before and everything else covered the hours of today
 *     that had passed at send time (RL3);
 *   - daily, weekly, or monthly on the 1st;
 *   - recipients are people in the organisation who can see the report
 *     (reportRecipients), checked on save and on every send (RS6);
 *   - the CSV is the screen export's: readable headers, no hidden link
 *     columns, no formula cells (RL4, RS7);
 *   - the run happens as the person who set the schedule up, so it only ever
 *     contains what they could see.
 */

const pool = require('../database/db');
const { decryptMailboxSecret } = require('./mailboxCrypto');
const mailer = require('../utils/mailer');
const { createNotification } = require('./notificationCenterService');
const { recordReportRun } = require('./reportOpsService');
const {
  getReportDefinitionById,
  getReportDefinitionByKey,
  runReportDefinition,
  getDashboardById,
  runDashboard,
  getModuleConfig,
  canSeeAudience,
} = require('./reportModuleService');
const { periodRange, PERIODS } = require('./reportDatasetService');
const { buildReportCsv } = require('./reportCsv');
const { checkRecipients, parseAddresses } = require('./reportRecipients');
const { isAdminUser } = require('../utils/adminScope');
const { userHasActivityPrivilege } = require('./accessConfigurationService');

const FREQUENCIES = ['daily', 'weekly', 'monthly'];
// What a schedule may carry from the filter bar.
const SCHEDULE_FILTER_KEYS = ['period', 'case_type', 'product', 'owner_id', 'group_by', 'window_days'];

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
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

function cleanFilters(filters) {
  const parsed = parseFilters(filters);
  const out = {};
  for (const key of SCHEDULE_FILTER_KEYS) {
    if (parsed[key] !== undefined && parsed[key] !== null && parsed[key] !== '') out[key] = parsed[key];
  }
  if (out.period && !PERIODS[out.period]) delete out.period;
  return out;
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

  // Monthly: the 1st of the month at the chosen time.
  if (scheduleFrequency === 'monthly') {
    candidateUtc = zonedLocalToUtc(localDate.year, localDate.month, 1, hour, minute, timezoneName);
    if (candidateUtc <= now) {
      const next = new Date(Date.UTC(localDate.year, localDate.month, 1));
      candidateUtc = zonedLocalToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, 1, hour, minute, timezoneName);
    }
    return candidateUtc;
  }

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

// The period a schedule covers when it runs: its own choice, else yesterday,
// the last 7 days or last month to match how often it runs. The dates are those
// of the schedule's time zone on the day it runs.
function defaultPeriodFor(frequency) {
  if (frequency === 'monthly') return 'last_month';
  if (frequency === 'weekly') return 'last_7_days';
  return 'yesterday';
}

function scheduleFilters(config, now = new Date()) {
  const filters = cleanFilters(config.filters);
  const legacy = parseFilters(config.filters);
  if (legacy.date_from || legacy.date_to) return { ...filters, date_from: legacy.date_from, date_to: legacy.date_to };
  const period = filters.period || defaultPeriodFor(String(config.schedule_frequency || 'daily').toLowerCase());
  const timezoneName = validateTimezone(config.timezone_name) ? config.timezone_name : 'UTC';
  const local = getZonedParts(now, timezoneName);
  const [dateFrom, dateTo] = periodRange(period, new Date(Date.UTC(local.year, local.month - 1, local.day)));
  return { ...filters, period, date_from: dateFrom, date_to: dateTo };
}

// The person who set the schedule up, as the report engine sees a user.
async function scheduleOwner(config) {
  if (!config.created_by) return null;
  const [[row]] = await pool.execute(
    `SELECT u.id, u.role, u.is_active, uoa.role_at_org, uoa.is_active AS member
       FROM users u LEFT JOIN user_org_access uoa ON uoa.user_id = u.id AND uoa.org_id = ?
      WHERE u.id = ?`,
    [config.org_id, config.created_by]
  );
  if (!row || !Number(row.is_active) || !Number(row.member)) return null;
  return { userId: row.id, orgId: config.org_id, role: row.role_at_org || row.role };
}

async function ownerCanSee(owner, audience) {
  const viewer = { admin: isAdminUser(owner), manage: await userHasActivityPrivilege(owner, 'reports.manage') };
  return canSeeAudience(viewer, audience);
}

async function deliverByEmail(config, recipients, csvContent, summary) {
  const systemConfig = await loadSystemConfig();
  const moduleConfig = await getModuleConfig(config.org_id);
  const host = process.env.SMTP_HOST || systemConfig.smtp_host || '';
  const port = Number(process.env.SMTP_PORT || systemConfig.smtp_port || 0);
  const username = process.env.SMTP_USER || systemConfig.smtp_username || '';
  const password = process.env.SMTP_PASS || decryptMailboxSecret(systemConfig.smtp_password) || ''; // MIPM-68: stored encrypted
  const encryption = process.env.SMTP_ENCRYPTION || systemConfig.smtp_encryption || 'STARTTLS';
  const fromEmail = process.env.SMTP_FROM_EMAIL || systemConfig.smtp_from_email || username;
  const fromName = moduleConfig.email_from_name || systemConfig.smtp_from_name || 'MIMS Reports';

  const transporter = mailer.createTransport('operational', {
    host,
    port,
    secure: encryption === 'SSL/TLS',
    requireTLS: encryption === 'STARTTLS',
    auth: {
      user: username,
      pass: password,
    },
    tls: { rejectUnauthorized: process.env.SMTP_ALLOW_INSECURE_TLS !== 'true' },
  });

  const fileDate = new Date().toISOString().slice(0, 10);
  const safeName = (config.export_name || 'scheduled_export').replace(/[^a-zA-Z0-9_-]/g, '_');

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: recipients.join(', '),
    replyTo: moduleConfig.reply_to_email || undefined,
    subject: config.email_subject || `${moduleConfig.digest_subject_prefix || '[MIMS Reports]'} ${config.export_name}`,
    text: `${summary}\n\nThe report is attached as a CSV file. It contains case data from MIMS: keep it inside the organisation.`,
    attachments: [
      {
        filename: `${safeName}_${fileDate}.csv`,
        content: `﻿${csvContent}`,
        contentType: 'text/csv; charset=utf-8',
      },
    ],
  });
}

async function deliverInApp(config, summary) {
  if (!config.created_by) return;
  await createNotification(config.created_by, {
    category: 'scheduled_report',
    severity: 'info',
    title: `Scheduled report ready: ${config.export_name}`,
    message: summary,
    linkUrl: '/reports',
    metadata: { config_id: config.id, report_key: config.report_key },
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

// One schedule's run: returns what it produced, or throws why it could not.
async function runOneSchedule(config, now) {
  const owner = await scheduleOwner(config);
  if (!owner) throw new Error('The person who set up this schedule no longer has access to the organisation.');
  const filters = scheduleFilters(config, now);
  let target;
  let columns;
  let rows;
  if ((config.target_type || 'report') === 'dashboard') {
    target = await getDashboardById(config.org_id, config.target_id);
    if (!target) throw new Error('The dashboard this schedule sends no longer exists.');
    if (!await ownerCanSee(owner, target.visibility_scope)) throw new Error('The person who set up this schedule can no longer see this dashboard.');
    const viewer = { admin: isAdminUser(owner), manage: await userHasActivityPrivilege(owner, 'reports.manage') };
    const payload = await runDashboard(target, config.org_id, filters, viewer, { user: owner });
    rows = payload.csv_rows;
    columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  } else {
    target = (config.target_id && await getReportDefinitionById(config.org_id, config.target_id))
      || (config.report_key && await getReportDefinitionByKey(config.org_id, config.report_key));
    if (!target) throw new Error('The report this schedule sends no longer exists.');
    if (!await ownerCanSee(owner, target.visibility_scope)) throw new Error('The person who set up this schedule can no longer see this report.');
    const payload = await runReportDefinition(target, config.org_id, filters, { user: owner });
    rows = payload.rows;
    columns = payload.columns;
  }
  return { target, filters, columns, rows };
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
    let filters = null;
    let diagnostics = null;
    let sentTo = null;
    let runTargetType = config.target_type || 'report';
    let runTargetId = config.target_id || null;
    let resolvedReportKey = config.report_key || 'scheduled-report';
    let resolvedReportName = config.export_name || 'Scheduled Report';

    try {
      const result = await runOneSchedule(config, now);
      filters = result.filters;
      rowCount = result.rows.length;
      resolvedReportKey = result.target.report_key || result.target.dashboard_key;
      resolvedReportName = result.target.name;
      runTargetId = result.target.id;
      const period = filters.date_from ? `${filters.date_from} to ${filters.date_to}` : 'current';
      const summary = `${result.target.name} — ${period}, ${rowCount} row${rowCount === 1 ? '' : 's'}.`;

      if (config.delivery_method === 'email') {
        const { allowed, refused } = await checkRecipients(config.org_id, config.delivery_target, result.target.visibility_scope);
        if (!allowed.length) throw new Error('None of the recipients can receive this report any more.');
        sentTo = allowed.map((p) => p.email).join(', ');
        if (refused.length) diagnostics = { recipients_skipped: refused };
        await deliverByEmail(config, allowed.map((p) => p.email), buildReportCsv(result.columns, result.rows), summary);
      } else {
        await deliverInApp(config, summary);
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
        filters: filters || cleanFilters(config.filters),
        timezoneName: config.timezone_name || 'UTC',
        rowCount,
        deliveryMethod: config.delivery_method || null,
        deliveryTarget: sentTo || config.delivery_target || null,
        status: runStatus,
        errorMessage: lastError,
        diagnostics,
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

// Everything a schedule needs, checked: name, target, how often, when, time
// zone, period and filters, and recipients who may receive the target.
async function normalizeSchedule(orgId, data, existing = {}) {
  const has = (key) => Object.prototype.hasOwnProperty.call(data, key);
  const pick = (key, fallback) => (has(key) ? data[key] : (existing[key] ?? fallback));
  const moduleConfig = await getModuleConfig(orgId);

  const exportName = String(pick('export_name', '') || '').trim();
  if (!exportName) throw badRequest('Enter a name for the schedule.');

  const targetType = String(pick('target_type', 'report')).toLowerCase() === 'dashboard' ? 'dashboard' : 'report';
  const targetId = Number(pick('target_id', 0)) || null;
  const target = targetType === 'dashboard'
    ? (targetId && await getDashboardById(orgId, targetId))
    : (targetId && await getReportDefinitionById(orgId, targetId));
  if (!target) throw badRequest(targetType === 'dashboard' ? 'Choose a dashboard to schedule.' : 'Choose a report to schedule.');
  if (targetType === 'report' && !target.is_built) throw badRequest('This report uses a data source that no longer exists, so it cannot be scheduled.');

  const frequency = String(pick('schedule_frequency', 'daily')).toLowerCase();
  if (!FREQUENCIES.includes(frequency)) throw badRequest('Choose daily, weekly or monthly.');
  const time = String(pick('schedule_time_local', '08:00'));
  if (!/^\d{2}:\d{2}$/.test(time)) throw badRequest('Enter the time as HH:MM.');
  const weekday = Number(pick('schedule_weekday', 1));
  const timezoneRaw = pick('timezone_name', null);
  const timezoneName = validateTimezone(timezoneRaw) ? timezoneRaw
    : (validateTimezone(moduleConfig.default_timezone) ? moduleConfig.default_timezone : 'UTC');
  if (timezoneRaw && !validateTimezone(timezoneRaw)) throw badRequest(`"${timezoneRaw}" is not a time zone.`);

  const deliveryMethod = String(pick('delivery_method', moduleConfig.default_delivery_method || 'email')) === 'in_app' ? 'in_app' : 'email';
  let deliveryTarget = null;
  if (deliveryMethod === 'email') {
    const addresses = parseAddresses(pick('delivery_target', ''));
    if (!addresses.length) throw badRequest('Choose who the report is emailed to.');
    const { refused } = await checkRecipients(orgId, addresses.join(','), target.visibility_scope);
    if (refused.length) {
      throw badRequest(`Reports are only emailed to people in this organisation who can see this report. Not allowed: ${refused.join(', ')}.`);
    }
    deliveryTarget = addresses.join(', ');
    if (deliveryTarget.length > 255) throw badRequest('Too many recipients for one schedule.');
  }

  return {
    export_name: exportName,
    target_type: targetType,
    report_key: target.report_key || target.dashboard_key,
    target_id: target.id,
    export_format: 'csv',
    schedule_frequency: frequency,
    schedule_time_local: time,
    schedule_weekday: Math.min(6, Math.max(0, Number.isInteger(weekday) ? weekday : 1)),
    timezone_name: timezoneName,
    filters: JSON.stringify(cleanFilters(pick('filters', {}))),
    delivery_method: deliveryMethod,
    delivery_target: deliveryTarget,
    email_subject: String(pick('email_subject', '') || '').trim() || null,
    is_active: pick('is_active', 1) === false || Number(pick('is_active', 1)) === 0 ? 0 : 1,
  };
}

async function createExportConfig(orgId, userId, data) {
  const config = await normalizeSchedule(orgId, data || {});
  const [result] = await pool.query(
    `INSERT INTO scheduled_export_configs
       (org_id, export_name, target_type, report_key, target_id, export_format, schedule_frequency, schedule_time_local,
        schedule_weekday, timezone_name, next_run_at_utc, filters, delivery_method, delivery_target, email_subject, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orgId, config.export_name, config.target_type, config.report_key, config.target_id, config.export_format,
      config.schedule_frequency, config.schedule_time_local, config.schedule_weekday, config.timezone_name,
      computeNextRunAtUtc(config), config.filters, config.delivery_method, config.delivery_target,
      config.email_subject, config.is_active, userId,
    ]
  );
  return result.insertId;
}

async function updateExportConfig(id, orgId, data) {
  const [[existing]] = await pool.query(
    'SELECT * FROM scheduled_export_configs WHERE id = ? AND org_id = ? LIMIT 1',
    [id, orgId]
  );
  if (!existing) {
    const err = new Error('Schedule not found.');
    err.statusCode = 404;
    throw err;
  }
  const config = await normalizeSchedule(orgId, data || {}, { ...existing, filters: parseFilters(existing.filters) });
  await pool.query(
    `UPDATE scheduled_export_configs
        SET export_name = ?, target_type = ?, report_key = ?, target_id = ?, schedule_frequency = ?, schedule_time_local = ?,
            schedule_weekday = ?, timezone_name = ?, next_run_at_utc = ?, filters = ?, delivery_method = ?, delivery_target = ?,
            email_subject = ?, is_active = ?, updated_at = NOW()
      WHERE id = ? AND org_id = ?`,
    [
      config.export_name, config.target_type, config.report_key, config.target_id, config.schedule_frequency,
      config.schedule_time_local, config.schedule_weekday, config.timezone_name, computeNextRunAtUtc(config),
      config.filters, config.delivery_method, config.delivery_target, config.email_subject, config.is_active, id, orgId,
    ]
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
    const err = new Error('Schedule not found.');
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
    const err = new Error('Schedule not found.');
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
    const err = new Error('Schedule not found.');
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
  scheduleFilters,
};

// An empty name is not a time zone: Intl accepts undefined as "the server's
// own", so a schedule saved without one stored NULL and failed to save.
function validateTimezone(timezoneName) {
  if (!timezoneName || typeof timezoneName !== 'string') return false;
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
