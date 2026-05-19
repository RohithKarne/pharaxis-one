'use strict';

const pool = require('../database/db');
const REGISTRY = require('./schedulerRegistry');

const CRITICAL_COLUMNS = [
  ['products', 'trade_name'],
  ['case_pc_product_info', 'version_id'],
  ['sessions', 'token'],
  ['sessions', 'expires_at'],
  ['user_org_access', 'org_id'],
  ['user_org_access', 'is_active'],
  ['email_job_queue', 'status'],
  ['email_job_queue', 'scheduled_at'],
  ['webhook_deliveries', 'next_retry_at'],
];

async function getCount(sql, params = []) {
  const [[row]] = await pool.execute(sql, params);
  const firstKey = row ? Object.keys(row)[0] : null;
  return Number(firstKey ? row[firstKey] || 0 : 0);
}

async function getSchemaColumns() {
  const clauses = CRITICAL_COLUMNS.map(() => '(table_name = ? AND column_name = ?)').join(' OR ');
  const params = [];
  for (const [table, column] of CRITICAL_COLUMNS) params.push(table, column);
  const [rows] = await pool.execute(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND (${clauses})`,
    params
  );
  return new Set(rows.map((row) => `${row.table_name || row.TABLE_NAME}.${row.column_name || row.COLUMN_NAME}`));
}

async function getRuntimeHealth() {
  const checks = [];
  let overallStatus = 'ok';

  function addCheck(name, status, detail, severity = status) {
    checks.push({ name, status, severity, detail });
    if (status === 'failed') overallStatus = 'failed';
    else if (status === 'warning' && overallStatus === 'ok') overallStatus = 'warning';
  }

  await pool.execute('SELECT 1');
  addCheck('database_connectivity', 'ok', 'Database connection succeeded.');

  const availableColumns = await getSchemaColumns();
  const missingColumns = CRITICAL_COLUMNS
    .map(([table, column]) => `${table}.${column}`)
    .filter((key) => !availableColumns.has(key));
  addCheck(
    'critical_schema_contract',
    missingColumns.length ? 'failed' : 'ok',
    missingColumns.length ? `Missing columns: ${missingColumns.join(', ')}` : `Validated ${CRITICAL_COLUMNS.length} critical columns.`
  );

  const [orgRows] = await pool.execute(
    `SELECT
       COUNT(*) AS active_orgs,
       SUM(CASE WHEN two_factor_enabled = 1 THEN 1 ELSE 0 END) AS orgs_with_2fa
     FROM organisations
     WHERE is_active = 1`
  );
  const orgSummary = orgRows[0] || {};
  addCheck(
    'active_organisations',
    Number(orgSummary.active_orgs || 0) > 0 ? 'ok' : 'failed',
    `${Number(orgSummary.active_orgs || 0)} active organisation(s); ${Number(orgSummary.orgs_with_2fa || 0)} with 2FA enabled.`
  );

  const [adminRows] = await pool.execute(
    `SELECT
       COUNT(DISTINCT u.id) AS admin_users,
       COUNT(DISTINCT CASE WHEN uoa.is_active = 1 THEN u.id END) AS admins_with_org_access
     FROM users u
     LEFT JOIN user_org_access uoa ON uoa.user_id = u.id
     WHERE u.is_active = 1
       AND u.role = 'admin'`
  ).catch(() => [[{ admin_users: 0, admins_with_org_access: 0 }]]);
  const adminSummary = adminRows[0] || {};
  const adminsWithAdminConsole = await getCount(
    `SELECT COUNT(DISTINCT user_id) AS admins_with_admin_console
       FROM user_module_permissions
      WHERE module = 'admin_console'
        AND can_access = 1`
  ).catch(() => 0);
  const adminAccessOk = Number(adminSummary.admins_with_org_access || 0) > 0 && Number(adminsWithAdminConsole || 0) > 0;
  addCheck(
    'admin_access_bootstrap',
    adminAccessOk ? 'ok' : 'warning',
    `${Number(adminSummary.admin_users || 0)} admin user(s); ${Number(adminSummary.admins_with_org_access || 0)} with org access; ${Number(adminsWithAdminConsole || 0)} with admin_console module.`
  );

  const [[themeRow]] = await pool.execute(
    `SELECT config_value
       FROM system_config
      WHERE config_key = 'ui_theme'
      LIMIT 1`
  ).catch(() => [[null]]);
  addCheck(
    'public_theme_configuration',
    themeRow?.config_value ? 'ok' : 'warning',
    themeRow?.config_value ? `ui_theme=${themeRow.config_value}` : 'ui_theme is not explicitly configured; default theme fallback will be used.'
  );

  const [queueRows] = await pool.execute(
    `SELECT
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_email_jobs,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_email_jobs
     FROM email_job_queue`
  ).catch(() => [[{}]]);
  const queueSummary = queueRows[0] || {};
  const pendingEmailJobs = Number(queueSummary.pending_email_jobs || 0);
  const failedEmailJobs = Number(queueSummary.failed_email_jobs || 0);
  addCheck(
    'email_job_queue',
    failedEmailJobs > 0 ? 'warning' : 'ok',
    `${pendingEmailJobs} pending email job(s); ${failedEmailJobs} failed email job(s).`
  );

  const pendingWebhookDeliveries = await getCount(
    `SELECT COUNT(*) AS pending_webhooks
       FROM webhook_deliveries
      WHERE delivered_at IS NULL`
  ).catch(() => 0);
  addCheck(
    'webhook_delivery_queue',
    pendingWebhookDeliveries > 25 ? 'warning' : 'ok',
    `${pendingWebhookDeliveries} webhook delivery record(s) waiting for delivery or retry.`
  );

  const [processRows] = await pool.execute(
    `SELECT
       SUM(CASE WHEN status_code = 401 THEN 1 ELSE 0 END) AS auth_401_24h,
       SUM(CASE WHEN status_code = 403 THEN 1 ELSE 0 END) AS auth_403_24h,
       SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) AS server_5xx_24h
     FROM mims_process_logs
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
  ).catch(() => [[{}]]);
  const processSummary = processRows[0] || {};
  addCheck(
    'auth_and_server_errors_24h',
    Number(processSummary.server_5xx_24h || 0) > 0 ? 'warning' : 'ok',
    `${Number(processSummary.auth_401_24h || 0)} auth 401(s), ${Number(processSummary.auth_403_24h || 0)} auth 403(s), ${Number(processSummary.server_5xx_24h || 0)} server 5xx response(s) in the last 24 hours.`
  );

  const [workerAlerts] = await pool.execute(
    `SELECT source, description, status, created_at
       FROM service_logs
      WHERE status IN ('failed', 'warning')
        AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        AND (
          source NOT IN ('API Exceptions', 'Frontend Runtime')
          OR description LIKE 'Job failed:%'
          OR description LIKE 'Job completed:%'
        )
      ORDER BY created_at DESC
      LIMIT 8`
  ).catch(() => [[]]);
  addCheck(
    'worker_alerts_24h',
    workerAlerts.length > 0 ? 'warning' : 'ok',
    workerAlerts.length > 0 ? `${workerAlerts.length} failed/warning worker log(s) in the last 24 hours.` : 'No failed or warning worker logs in the last 24 hours.'
  );

  return {
    generated_at: new Date().toISOString(),
    status: overallStatus,
    summary: {
      registered_services: REGISTRY.length,
      active_orgs: Number(orgSummary.active_orgs || 0),
      admin_users: Number(adminSummary.admin_users || 0),
      admins_with_org_access: Number(adminSummary.admins_with_org_access || 0),
      admins_with_admin_console: Number(adminsWithAdminConsole || 0),
      pending_email_jobs: pendingEmailJobs,
      failed_email_jobs: failedEmailJobs,
      pending_webhooks: pendingWebhookDeliveries,
      auth_401_24h: Number(processSummary.auth_401_24h || 0),
      auth_403_24h: Number(processSummary.auth_403_24h || 0),
      server_5xx_24h: Number(processSummary.server_5xx_24h || 0),
      worker_alerts_24h: workerAlerts.length,
    },
    checks,
    recent_worker_alerts: workerAlerts.map((row) => ({
      source: row.source,
      description: row.description,
      status: row.status,
      created_at: row.created_at,
    })),
  };
}

module.exports = { getRuntimeHealth };
