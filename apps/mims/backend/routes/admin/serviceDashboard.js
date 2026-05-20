'use strict';
/**
 * routes/admin/serviceDashboard.js
 * GET /api/admin/service-dashboard
 *
 * Returns all registered services/schedulers with runtime stats.
 * Auto-discovers new jobs: add an entry to schedulerRegistry.js → appears here.
 */

const express  = require('express')
const router   = express.Router()
const pool     = require('../../database/db')
const { authenticate, requireRole } = require('../../middleware/auth')
const REGISTRY = require('../../services/schedulerRegistry')
const { CronExpressionParser } = require('cron-parser')

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

function toIST(date) {
  if (!date) return null
  const d = new Date(typeof date === 'string' ? date : date)
  if (isNaN(d)) return null
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().replace('T', ' ').substring(0, 19) + ' IST'
}

function nextRunDate(cronExpression) {
  if (!cronExpression) return null
  try {
    const interval = CronExpressionParser.parse(cronExpression, { tz: 'UTC' })
    return toIST(interval.next().toDate())
  } catch {
    return null
  }
}

router.get('/service-dashboard', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    // Last run stats for cron jobs — keyed by job name from details JSON
    const [cronStats] = await pool.execute(`
      SELECT
        JSON_UNQUOTE(JSON_EXTRACT(details, '$.job'))                                          AS job_name,
        MAX(created_at)                                                                        AS last_run_date,
        MAX(CASE WHEN status = 'success' THEN created_at ELSE NULL END)                       AS last_successful_run_date,
        SUBSTRING_INDEX(GROUP_CONCAT(status ORDER BY created_at DESC SEPARATOR ','), ',', 1)  AS last_run_status
      FROM service_logs
      WHERE (description LIKE 'Job completed:%' OR description LIKE 'Job failed:%')
        AND JSON_EXTRACT(details, '$.job') IS NOT NULL
      GROUP BY JSON_UNQUOTE(JSON_EXTRACT(details, '$.job'))
    `)

    const cronStatsMap = {}
    for (const row of cronStats) {
      if (row.job_name) cronStatsMap[row.job_name] = row
    }

    // DPPR last run from dppr_execution_log
    const [[dpprStats]] = await pool.execute(`
      SELECT
        MAX(created_at)                                                     AS last_run_date,
        MAX(CASE WHEN status = 'success' THEN created_at ELSE NULL END)    AS last_successful_run_date,
        SUBSTRING_INDEX(GROUP_CONCAT(status ORDER BY created_at DESC SEPARATOR ','), ',', 1) AS last_run_status
      FROM dppr_execution_log
    `).catch(() => [[null]])

    // Email worker last run from service_logs by source
    const [[emailStats]] = await pool.execute(`
      SELECT
        MAX(created_at)                                                     AS last_run_date,
        MAX(CASE WHEN status = 'success' THEN created_at ELSE NULL END)    AS last_successful_run_date,
        SUBSTRING_INDEX(GROUP_CONCAT(status ORDER BY created_at DESC SEPARATOR ','), ',', 1) AS last_run_status
      FROM service_logs
      WHERE source = 'Email Worker'
    `).catch(() => [[null]])

    const services = REGISTRY.map(entry => {
      let stats = null

      if (entry.type === 'cron') {
        stats = cronStatsMap[entry.name] || null
      } else if (entry.name === 'dppr-enforcement') {
        stats = dpprStats
      } else if (entry.name === 'email-worker') {
        stats = emailStats
      }

      return {
        name:                   entry.name,
        source:                 entry.source,
        description:            entry.description,
        type:                   entry.type,
        cron_expression:        entry.cronExpression || null,
        poll_interval:          entry.pollInterval   || null,
        enabled:                true,
        last_run_date:          toIST(stats?.last_run_date)              || null,
        last_successful_run_date: toIST(stats?.last_successful_run_date) || null,
        last_run_status:        stats?.last_run_status                   || null,
        next_run_date:          entry.type === 'poll'
                                  ? entry.pollInterval
                                  : nextRunDate(entry.cronExpression),
        config_route:           entry.configRoute || null,
      }
    })

    res.json({ services, total: services.length })
  } catch (err) {
    console.error('[SERVICE_DASHBOARD] GET error:', err)
    res.status(500).json({ error: 'Failed to load service dashboard' })
  }
})

module.exports = router
