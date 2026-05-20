/**
 * routes/admin/serviceLogs.js — Service Log API
 *
 * GET /api/admin/service-logs
 * GET /api/admin/service-logs/aggregation
 */

const express = require('express')
const router = express.Router()
const pool = require('../../database/db')
const { authenticate, requireRole } = require('../../middleware/auth')

const ALLOWED_PAGE_SIZES = [10, 20, 50]

function buildFilters(query) {
  const {
    source = '',
    status = '',
    service_type = '',
    date_from = '',
    date_to = '',
  } = query

  const conditions = []
  const params = []

  if (source) { conditions.push('source = ?'); params.push(source) }
  if (status) { conditions.push('status = ?'); params.push(status) }
  if (service_type) { conditions.push('service_type = ?'); params.push(service_type) }
  if (date_from) { conditions.push('DATE(created_at) >= DATE(?)'); params.push(date_from) }
  if (date_to) { conditions.push('DATE(created_at) <= DATE(?)'); params.push(date_to) }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return { where, params }
}

router.get('/service-logs', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const {
      page = '1',
      page_size = '20',
    } = req.query

    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const ps = ALLOWED_PAGE_SIZES.includes(parseInt(page_size, 10))
      ? parseInt(page_size, 10)
      : 20
    const offset = (pageNum - 1) * ps

    const { where, params } = buildFilters(req.query)

    const [[{ c: total }]] = await pool.execute(
      `SELECT COUNT(*) as c FROM service_logs ${where}`,
      params
    )

    const [data] = await pool.execute(
      `SELECT id, source, service_type, description, details, status, created_at
       FROM service_logs ${where}
       ORDER BY created_at DESC
       LIMIT ${ps} OFFSET ${offset}`,
      params
    )

    const [sourceRows] = await pool.execute(
      'SELECT DISTINCT source FROM service_logs ORDER BY source'
    )
    const sources = sourceRows.map(r => r.source)

    res.json({
      data,
      total,
      page: pageNum,
      page_size: ps,
      total_pages: Math.max(1, Math.ceil(total / ps)),
      sources,
    })
  } catch (err) {
    console.error('[SERVICE_LOGS] GET error:', err)
    res.status(500).json({ error: 'Failed to load service logs' })
  }
})

router.get('/service-logs/aggregation', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { trend_days = '14' } = req.query
    const days = Math.min(60, Math.max(1, parseInt(trend_days, 10) || 14))

    const { where, params } = buildFilters(req.query)

    const [[{ c: total }]] = await pool.execute(
      `SELECT COUNT(*) as c FROM service_logs ${where}`,
      params
    )

    const [statusRows] = await pool.execute(
      `SELECT status, COUNT(*) as total
       FROM service_logs ${where}
       GROUP BY status
       ORDER BY total DESC`,
      params
    )

    const [sourceRows] = await pool.execute(
      `SELECT source, COUNT(*) as total
       FROM service_logs ${where}
       GROUP BY source
       ORDER BY total DESC
       LIMIT 10`,
      params
    )

    const [typeRows] = await pool.execute(
      `SELECT service_type, COUNT(*) as total
       FROM service_logs ${where}
       GROUP BY service_type
       ORDER BY total DESC`,
      params
    )

    const [trendRows] = await pool.execute(
      `SELECT DATE(created_at) as day,
              COUNT(*) as total,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
              SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) as warning,
              SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success
       FROM service_logs ${where}
       GROUP BY DATE(created_at)
       ORDER BY day DESC
       LIMIT ${days}`,
      params
    )

    const byStatus = { success: 0, failed: 0, warning: 0, other: 0 }
    for (const row of statusRows) {
      const key = row.status || 'other'
      if (Object.prototype.hasOwnProperty.call(byStatus, key)) byStatus[key] = Number(row.total || 0)
      else byStatus.other += Number(row.total || 0)
    }

    const failureRate = total > 0
      ? Number(((byStatus.failed / total) * 100).toFixed(2))
      : 0

    res.json({
      summary: {
        total,
        by_status: byStatus,
        failure_rate_percent: failureRate,
      },
      top_sources: sourceRows,
      by_service_type: typeRows,
      trend_daily: trendRows.reverse(),
      filters: {
        source: req.query.source || '',
        status: req.query.status || '',
        service_type: req.query.service_type || '',
        date_from: req.query.date_from || '',
        date_to: req.query.date_to || '',
        trend_days: days,
      },
    })
  } catch (err) {
    console.error('[SERVICE_LOGS] AGGREGATION GET error:', err)
    res.status(500).json({ error: 'Failed to load service log aggregation' })
  }
})

module.exports = router
