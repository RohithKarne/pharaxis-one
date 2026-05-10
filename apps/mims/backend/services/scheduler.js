/**
 * services/scheduler.js — Centralized Cron Job Scheduler
 *
 * Registers and runs named background jobs with node-cron.
 * Logs start/end/error for each execution and never throws up to process level.
 *
 * Owned by: Varun (CTO)
 */

const cron = require('node-cron')
const pool = require('../database/db')
const { logService } = require('./serviceLogger')
const { logger } = require('./logger')

const jobs = []
let isInitialized = false

function registerJob({ name, cronExpression, handler, description }) {
  jobs.push({
    name,
    cronExpression,
    description,
    handler,
    task: null,
    isRunning: false,
  })
}

function toIsoNow() {
  return new Date().toISOString()
}

function buildTask(job) {
  return cron.schedule(job.cronExpression, async () => {
    const startedAt = toIsoNow()
    logger.info({ job: job.name, started_at: startedAt }, 'Scheduler job started')
    try {
      await logService({
        source: 'Job Scheduler',
        service_type: 'CRON',
        description: `Job started: ${job.name}`,
        status: 'success',
        details: { job: job.name, at: startedAt, cron: job.cronExpression },
      })
      await job.handler()
      const endedAt = toIsoNow()
      logger.info({ job: job.name, ended_at: endedAt }, 'Scheduler job completed')
      await logService({
        source: 'Job Scheduler',
        service_type: 'CRON',
        description: `Job completed: ${job.name}`,
        status: 'success',
        details: { job: job.name, at: endedAt, cron: job.cronExpression },
      })
    } catch (err) {
      const errorAt = toIsoNow()
      const msg = err?.stack || err?.message || String(err)
      logger.error({ job: job.name, at: errorAt, error: msg }, 'Scheduler job failed')
      await logService({
        source: 'Job Scheduler',
        service_type: 'CRON',
        description: `Job failed: ${job.name}`,
        status: 'failed',
        details: { job: job.name, at: errorAt, error: msg, cron: job.cronExpression },
      })
    }
  }, { scheduled: false, timezone: 'UTC' })
}

function registerDefaultJobs() {
  if (jobs.length > 0) return

  registerJob({
    name: 'expiry-alerts',
    cronExpression: '0 8 * * *',
    description: 'Runs expiry alert checks',
    handler: async () => {
      const { runExpiryAlerts } = require('./expiryAlertService');
      await runExpiryAlerts();
    },
  })

  registerJob({
    name: 'cm-expiry-alerts',
    cronExpression: '0 7 * * *',
    description: 'Runs CM document expiry alert checks',
    handler: async () => {
      const { runCmExpiryAlerts } = require('./cmExpiryAlertService');
      await runCmExpiryAlerts();
    },
  })

  registerJob({
    name: 'cm-module-lifecycle',
    cronExpression: '45 6 * * *',
    description: 'Archives expired modules and cascades archive to linked documents',
    handler: async () => {
      const { runCmModuleLifecycle } = require('./cmModuleLifecycleService');
      await runCmModuleLifecycle();
    },
  })

  registerJob({
    name: 'emir-poller',
    cronExpression: '*/5 * * * *',
    description: 'Polls EMIR mailbox for new emails',
    handler: async () => {
      logger.info({ job: 'emir-poller' }, 'EMIR email poll tick')
    },
  })

  registerJob({
    name: 'scheduled-exports',
    cronExpression: '*/15 * * * *',
    description: 'Checks timezone-aware scheduled export jobs',
    handler: async () => {
      const { runScheduledExports } = require('./scheduledExportService');
      await runScheduledExports();
    },
  })

  registerJob({
    name: 'case-transmission-sla',
    cronExpression: '*/30 * * * *',
    description: 'Refreshes transmission SLA states and sends escalation alerts',
    handler: async () => {
      const { refreshTransmissionSlaAlerts } = require('./caseGovernanceService');
      await refreshTransmissionSlaAlerts();
    },
  })

  registerJob({
    name: 'inbox-operational-sla',
    cronExpression: '*/30 * * * *',
    description: 'Refreshes inbox SLA breach alerts for first touch and response',
    handler: async () => {
      const { refreshInboxOperationalAlerts } = require('./inboxGovernanceService');
      await refreshInboxOperationalAlerts();
    },
  })

  registerJob({
    name: 'notification-delivery-retry',
    cronExpression: '*/10 * * * *',
    description: 'Retries failed notification deliveries due for retry',
    handler: async () => {
      const { retryFailedNotifications } = require('./notificationCenterService')
      await retryFailedNotifications(200)
    },
  })

  registerJob({
    name: 'novartis-daily-simulation',
    cronExpression: '15 1 * * *',
    description: 'Maintains Novartis high-volume simulation data and archives aged generated cases',
    handler: async () => {
      const { runNovartisSimulation } = require('./novartisSimulationService')
      await runNovartisSimulation({ orgId: 1, useScheduledConfig: true })
    },
  })

  // AC-T4: Login audit auto-archive — runs daily at 02:00 UTC
  registerJob({
    name: 'login-audit-archive',
    cronExpression: '0 2 * * *',
    description: 'Deletes login audit records older than configured retention period',
    handler: async () => {
      // Configurable retention via system_config key 'login_audit_retention_days' (default 90)
      let retentionDays = 90;
      try {
        const [[cfg]] = await pool.execute(
          `SELECT setting_value FROM system_config WHERE setting_key = 'login_audit_retention_days' LIMIT 1`
        );
        if (cfg?.setting_value) {
          const parsed = parseInt(cfg.setting_value, 10);
          if (!isNaN(parsed) && parsed > 0) retentionDays = parsed;
        }
      } catch (_) {}

      const [result] = await pool.execute(
        `DELETE FROM login_audit WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [retentionDays]
      );
      logger.info({ job: 'login-audit-archive', deleted: result.affectedRows, retentionDays }, 'Login audit archive complete');
    },
  })

  // AC-T16: Sessions table cleanup — every 30 min, prune rows where expires_at < NOW()
  // Keeps the sessions table lean; prevents unbounded growth on long-running instances.
  registerJob({
    name: 'session-cleanup',
    cronExpression: '*/30 * * * *',
    description: 'Prunes expired rows from the sessions table to prevent unbounded growth',
    handler: async () => {
      const [result] = await pool.execute(
        `DELETE FROM sessions WHERE expires_at < NOW()`
      );
      logger.info({ job: 'session-cleanup', deleted: result.affectedRows }, 'session-cleanup: expired sessions pruned');
    },
  })
}

function startScheduler() {
  registerDefaultJobs()
  if (isInitialized) return
  for (const job of jobs) {
    if (!job.task) job.task = buildTask(job)
    job.task.start()
    job.isRunning = true
  }
  isInitialized = true
}

function stopScheduler() {
  for (const job of jobs) {
    if (job.task) {
      job.task.stop()
      job.isRunning = false
    }
  }
  isInitialized = false
}

function getJobStatus() {
  return jobs.map(job => ({
    name: job.name,
    cronExpression: job.cronExpression,
    description: job.description,
    isRunning: !!job.isRunning,
  }))
}

module.exports = {
  startScheduler,
  stopScheduler,
  getJobStatus,
}
