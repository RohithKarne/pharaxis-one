/**
 * routes/admin/systemActivity.js — System Activity (Email Import)
 *
 * GET /api/admin/system-activity
 *   Query params:
 *     status     — success | failed | warning
 *     date_from  — YYYY-MM-DD (inclusive, based on created_at)
 *     task       — task name (default: Email Import)
 *     page       — page number (default: 1)
 *     page_size  — 10 | 20 | 50 (default: 20)
 *
 * Response:
 *   { summary: { total, success, failed, warning }, data: [], total, page, page_size, total_pages }
 */

const express = require('express')
const router = express.Router()
const db = require('../../database/db')
const { authenticate, requireRole } = require('../../middleware/auth')

const ALLOWED_PAGE_SIZES = [10, 20, 50]

function safeJsonParse(s) {
  if (!s) return null
  try { return JSON.parse(s) } catch { return null }
}

function parseCountFromDescription(desc) {
  if (!desc) return null
  const m = String(desc).match(/—\s*(\d+)\s+new email/i)
  return m ? parseInt(m[1], 10) : null
}

router.get('/system-activity', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  try {
    const {
      status    = '',
      date_from = '',
      task      = 'Email Import',
      page      = '1',
      page_size = '20',
    } = req.query

    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const ps = ALLOWED_PAGE_SIZES.includes(parseInt(page_size, 10))
      ? parseInt(page_size, 10)
      : 20
    const offset = (pageNum - 1) * ps

    const baseConditions = ["source = 'Email Accounts'", "service_type = 'IMAP'"]
    const baseParams = []

    const conditions = [...baseConditions]
    const params = [...baseParams]

    if (status)    { conditions.push('status = ?');                  params.push(status) }
    if (date_from) { conditions.push("date(created_at) >= date(?)"); params.push(date_from) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const baseWhere = baseConditions.length ? `WHERE ${baseConditions.join(' AND ')}` : ''

    const total = db.prepare(
      `SELECT COUNT(*) as c FROM service_logs ${where}`
    ).get(...params).c

    const rows = db.prepare(
      `SELECT id, source, service_type, description, details, status, created_at
       FROM service_logs ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    ).all(...params, ps, offset)

    const summaryRows = db.prepare(
      `SELECT status, COUNT(*) as c FROM service_logs ${baseWhere} GROUP BY status`
    ).all(...baseParams)

    const summaryTotal = db.prepare(
      `SELECT COUNT(*) as c FROM service_logs ${baseWhere}`
    ).get(...baseParams).c

    const summary = { total: summaryTotal, success: 0, failed: 0, warning: 0 }
    for (const r of summaryRows) {
      if (r.status === 'success') summary.success = r.c
      else if (r.status === 'failed') summary.failed = r.c
      else if (r.status === 'warning') summary.warning = r.c
    }

    const data = rows.map(r => {
      const details = safeJsonParse(r.details) || {}
      const fallbackCount = parseCountFromDescription(r.description)
      const totalCount = details.total_count ?? fallbackCount

      return {
        id: r.id,
        task_name: details.task_name || task || 'Email Import',
        status: r.status,
        start_at: details.start_at || r.created_at,
        end_at: details.end_at || r.created_at,
        total_count: totalCount,
        error_count: details.error_count ?? (r.status === 'failed' ? 1 : 0),
        warning_count: details.warning_count ?? 0,
        current_count: details.current_count ?? totalCount,
        last_activity_at: details.last_activity_at || r.created_at,
        last_poll_at: details.last_poll_at || null,
      }
    })

    res.json({
      summary,
      data,
      total,
      page: pageNum,
      page_size: ps,
      total_pages: Math.max(1, Math.ceil(total / ps)),
    })
  } catch (err) {
    console.error('[SYSTEM_ACTIVITY] GET error:', err)
    res.status(500).json({ error: 'Failed to load system activity' })
  }
})

module.exports = router
