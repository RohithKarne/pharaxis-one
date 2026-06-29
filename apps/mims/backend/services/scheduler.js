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
const REGISTRY = require('./schedulerRegistry')

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

const HANDLERS = {
  'expiry-alerts': async () => {
    const { runExpiryAlerts } = require('./expiryAlertService')
    await runExpiryAlerts()
  },
  'cm-expiry-alerts': async () => {
    const { runCmExpiryAlerts } = require('./cmExpiryAlertService')
    await runCmExpiryAlerts()
  },
  'cm-module-lifecycle': async () => {
    const { runCmModuleLifecycle } = require('./cmModuleLifecycleService')
    await runCmModuleLifecycle()
  },
  'cm-content-auto-archive': async () => {
    const { runCmContentAutoArchive } = require('./cmContentLifecycleService')
    await runCmContentAutoArchive()
  },
  'cm-review-reminders': async () => {
    const { runCmReviewReminders } = require('./cmReviewReminderService')
    await runCmReviewReminders()
  },
  'emir-poller': async () => {
    logger.info({ job: 'emir-poller' }, 'EMIR email poll tick')
  },
  'scheduled-exports': async () => {
    const { runScheduledExports } = require('./scheduledExportService')
    await runScheduledExports()
  },
  'case-transmission-sla': async () => {
    const { refreshTransmissionSlaAlerts } = require('./caseGovernanceService')
    await refreshTransmissionSlaAlerts()
  },
  'inbox-operational-sla': async () => {
    const { refreshInboxOperationalAlerts } = require('./inboxGovernanceService')
    await refreshInboxOperationalAlerts()
  },
  'case-state-sla': async () => {
    // WP8: sweep workflow-state SLAs and escalate fresh breaches (notifies owner + target).
    const { scanForBreaches } = require('./workflowSlaService')
    await scanForBreaches()
  },
  'notification-delivery-retry': async () => {
    const { retryFailedNotifications } = require('./notificationCenterService')
    await retryFailedNotifications(200)
  },
  'webhook-delivery-dispatch': async () => {
    const { deliverPendingWebhooks } = require('./api-platform/webhookDeliveryWorker')
    await deliverPendingWebhooks(50)
  },
  'workflow-sla-timers': async () => {
    const { checkSlaTimers } = require('./workflow/slaTimerService')
    await checkSlaTimers()
  },
  'pv-signal-detection': async () => {
    const [orgs] = await pool.execute('SELECT id FROM organisations WHERE is_active = 1 LIMIT 200').catch(async () => [ [] ])
    const { runSignalDetection } = require('./pv/signalDetectionService')
    for (const org of orgs) await runSignalDetection(org.id)
  },
  'novartis-daily-simulation': async () => {
    const { runNovartisSimulation } = require('./novartisSimulationService')
    await runNovartisSimulation({ orgId: 1, useScheduledConfig: true })
  },
  'extra-org-daily-simulation': async () => {
    // Runs simulation for any additional demo orgs configured via EXTRA_DEMO_ORG_IDS env var.
    // Set EXTRA_DEMO_ORG_IDS=2,3 to simulate orgs 2 and 3 alongside Novartis-Demo (org 1).
    const raw = process.env.EXTRA_DEMO_ORG_IDS || ''
    const orgIds = raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n) && n > 0)
    if (!orgIds.length) return
    const { runNovartisSimulation } = require('./novartisSimulationService')
    for (const orgId of orgIds) {
      try {
        await runNovartisSimulation({ orgId, useScheduledConfig: true })
        logger.info({ orgId }, 'extra-org-daily-simulation: completed')
      } catch (err) {
        logger.error({ orgId, err: err.message }, 'extra-org-daily-simulation: failed for org')
      }
    }
  },
  'login-audit-archive': async () => {
    let retentionDays = 90
    try {
      const [[cfg]] = await pool.execute(
        `SELECT setting_value FROM system_config WHERE setting_key = 'login_audit_retention_days' LIMIT 1`
      )
      if (cfg?.setting_value) {
        const parsed = parseInt(cfg.setting_value, 10)
        if (!isNaN(parsed) && parsed > 0) retentionDays = parsed
      }
    } catch (_) {}
    const [result] = await pool.execute(
      `DELETE FROM login_audit WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [retentionDays]
    )
    logger.info({ job: 'login-audit-archive', deleted: result.affectedRows, retentionDays }, 'Login audit archive complete')
  },
  'session-cleanup': async () => {
    const [result] = await pool.execute(`DELETE FROM sessions WHERE expires_at < NOW()`)
    logger.info({ job: 'session-cleanup', deleted: result.affectedRows }, 'session-cleanup: expired sessions pruned')
  },
}

function registerDefaultJobs() {
  if (jobs.length > 0) return
  for (const entry of REGISTRY) {
    if (entry.type !== 'cron') continue
    registerJob({
      name:           entry.name,
      cronExpression: entry.cronExpression,
      description:    entry.description,
      handler:        HANDLERS[entry.name] || (async () => {}),
    })
  }
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
