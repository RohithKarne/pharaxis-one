/**
 * routes/admin/serviceLogs.js — Service Log API
 *
 * GET /api/admin/service-logs
 *   Query params:
 *     source     — filter by source name (e.g. "Email Accounts")
 *     status     — filter by status: success | failed | warning
 *     date_from  — ISO date string (YYYY-MM-DD), inclusive
 *     date_to    — ISO date string (YYYY-MM-DD), inclusive
 *     page       — page number (default: 1)
 *     page_size  — rows per page: 10 | 20 | 50 (default: 20)
 *
 *   Response:
 *     { data: [], total, page, page_size, total_pages, sources: [] }
 */

const express = require('express')
const router = express.Router()
const pool = require('../../database/db')
const { authenticate, requireRole } = require('../../middleware/auth')

const ALLOWED_PAGE_SIZES = [10, 20, 50]

router.get('/service-logs', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const {
      source    = '',
      status    = '',
      date_from = '',
      date_to   = '',
      page      = '1',
      page_size = '20',
    } = req.query

    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const ps = ALLOWED_PAGE_SIZES.includes(parseInt(page_size, 10))
      ? parseInt(page_size, 10)
      : 20
    const offset = (pageNum - 1) * ps

    const conditions = []
    const params = []

    if (source)    { conditions.push('source = ?');                      params.push(source) }
    if (status)    { conditions.push('status = ?');                      params.push(status) }
    if (date_from) { conditions.push('DATE(created_at) >= DATE(?)');     params.push(date_from) }
    if (date_to)   { conditions.push('DATE(created_at) <= DATE(?)');     params.push(date_to) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

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

    // Distinct source values for the filter dropdown
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

module.exports = router
