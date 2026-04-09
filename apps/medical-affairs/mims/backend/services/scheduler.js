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
    console.log(`[Scheduler] ${startedAt} START ${job.name}`)
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
      console.log(`[Scheduler] ${endedAt} END ${job.name}`)
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
      console.error(`[Scheduler] ${errorAt} ERROR ${job.name}: ${msg}`)
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
    name: 'emir-poller',
    cronExpression: '*/5 * * * *',
    description: 'Polls EMIR mailbox for new emails',
    handler: async () => {
      console.log('EMIR email poll running')
    },
  })

  registerJob({
    name: 'scheduled-exports',
    cronExpression: '0 * * * *',
    description: 'Checks scheduled export jobs',
    handler: async () => {
      const { runScheduledExports } = require('./scheduledExportService');
      await runScheduledExports();
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
