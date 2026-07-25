const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')

const router = express.Router()

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin role required' })
  next()
}

router.get('/', authenticate, requireAdmin, async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page || '1', 10))
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit || '25', 10)))
  const offset = (page - 1) * limit

  const where = ['va.org_id = ?']
  const params = [req.user.orgId]

  if (req.query.action) {
    where.push('va.action = ?')
    params.push(req.query.action)
  }
  if (req.query.entity_type) {
    where.push('va.entity_type = ?')
    params.push(req.query.entity_type)
  }
  if (req.query.user_id) {
    where.push('va.user_id = ?')
    params.push(Number(req.query.user_id))
  }
  if (req.query.entity_id) {
    where.push('va.entity_id = ?')
    params.push(Number(req.query.entity_id))
  }
  if (req.query.date_from) {
    where.push('DATE(va.created_at) >= DATE(?)')
    params.push(req.query.date_from)
  }
  if (req.query.date_to) {
    where.push('DATE(va.created_at) <= DATE(?)')
    params.push(req.query.date_to)
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         va.id,
         va.created_at,
         va.user_id,
         va.user_type,
         va.action,
         va.entity_type,
         va.entity_id,
         va.ip_address,
         va.before_value,
         va.after_value,
         va.notes,
         u.name AS user_name,
         u.email AS user_email
       FROM vault_audit_log va
       LEFT JOIN users u
         ON u.id = va.user_id
        AND u.org_id = va.org_id
       WHERE ${where.join(' AND ')}
       ORDER BY va.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    )

    const [[countRow]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM vault_audit_log va
       WHERE ${where.join(' AND ')}`,
      params
    )

    res.json({
      results: rows,
      total: Number(countRow.total),
      page,
      limit
    })
  } catch (error) {
    console.error('List audit entries error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/export', authenticate, requireAdmin, async (req, res) => {
  try {
    const where = ['va.org_id = ?']
    const params = [req.user.orgId]

    if (req.query.action) {
      where.push('va.action = ?')
      params.push(req.query.action)
    }
    if (req.query.entity_type) {
      where.push('va.entity_type = ?')
      params.push(req.query.entity_type)
    }
    if (req.query.date_from) {
      where.push('DATE(va.created_at) >= DATE(?)')
      params.push(req.query.date_from)
    }
    if (req.query.date_to) {
      where.push('DATE(va.created_at) <= DATE(?)')
      params.push(req.query.date_to)
    }

    const [rows] = await pool.execute(
      `SELECT
         va.id,
         va.created_at,
         COALESCE(u.name, 'System') AS user_name,
         COALESCE(u.email, 'N/A') AS user_email,
         va.action,
         va.entity_type,
         va.entity_id,
         COALESCE(va.ip_address, 'N/A') AS ip_address,
         COALESCE(va.notes, '') AS notes
       FROM vault_audit_log va
       LEFT JOIN users u ON u.id = va.user_id AND u.org_id = va.org_id
       WHERE ${where.join(' AND ')}
       ORDER BY va.created_at DESC
       LIMIT 5000`,
      params
    )

    const headers = ['Audit ID', 'Timestamp (UTC)', 'User Name', 'User Email', 'Action', 'Entity Type', 'Entity ID', 'IP Address', 'Notes']
    const csvLines = [headers.join(',')]

    for (const r of rows) {
      const line = [
        r.id,
        `"${new Date(r.created_at).toISOString()}"`,
        `"${String(r.user_name).replace(/"/g, '""')}"`,
        `"${String(r.user_email).replace(/"/g, '""')}"`,
        `"${String(r.action).replace(/"/g, '""')}"`,
        `"${String(r.entity_type || '').replace(/"/g, '""')}"`,
        r.entity_id || '',
        `"${String(r.ip_address).replace(/"/g, '""')}"`,
        `"${String(r.notes).replace(/"/g, '""')}"`
      ].join(',')
      csvLines.push(line)
    }

    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="vault_gxp_audit_log_${Date.now()}.csv"`)
    return res.status(200).send(csvLines.join('\n'))
  } catch (error) {
    console.error('Audit export error:', error)
    return res.status(500).json({ error: 'Audit export failed' })
  }
})

module.exports = router
