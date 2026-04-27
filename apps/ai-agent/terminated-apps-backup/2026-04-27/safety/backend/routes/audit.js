const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const { requireModule, assertOrgAccess } = require('../middleware/rbac')
const { MODULES } = require('../constants')

const router = express.Router()

function parseJsonField(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

router.use(authenticate)
router.use(requireModule(MODULES.AUDIT_TRAIL_VIEW))

router.get('/', async (req, res) => {
  const targetOrgId = req.query.orgId ? Number(req.query.orgId) : req.user.orgId
  const actorUserId = req.query.actorUserId ? Number(req.query.actorUserId) : null
  const actionType = req.query.actionType ? String(req.query.actionType).trim() : null
  const fromDate = req.query.fromDate ? String(req.query.fromDate).trim() : null
  const toDate = req.query.toDate ? String(req.query.toDate).trim() : null
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 150)))

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) {
    return res.status(400).json({ error: 'Invalid org id' })
  }

  if (!assertOrgAccess(req, res, targetOrgId)) {
    return undefined
  }

  try {
    const params = [targetOrgId]
    const whereClauses = ['a.org_id = ?']

    if (actorUserId && Number.isInteger(actorUserId)) {
      whereClauses.push('a.actor_user_id = ?')
      params.push(actorUserId)
    }

    if (actionType) {
      whereClauses.push('a.action_type = ?')
      params.push(actionType)
    }

    if (fromDate) {
      whereClauses.push('a.created_at >= ?')
      params.push(fromDate)
    }

    if (toDate) {
      whereClauses.push('a.created_at <= ?')
      params.push(toDate)
    }

    const [rows] = await pool.execute(
      `SELECT
        a.audit_id,
        a.org_id,
        a.actor_user_id,
        u.full_name AS actor_name,
        u.email AS actor_email,
        a.action_type,
        a.entity_type,
        a.entity_id,
        a.before_value,
        a.after_value,
        a.metadata,
        a.created_at
       FROM admin_audit_log a
       LEFT JOIN users u ON u.user_id = a.actor_user_id
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT ${Number.isFinite(limit) ? limit : 150}`,
      params
    )

    const mapped = rows.map((row) => ({
      ...row,
      before_value: parseJsonField(row.before_value),
      after_value: parseJsonField(row.after_value),
      metadata: parseJsonField(row.metadata)
    }))

    return res.json(mapped)
  } catch (error) {
    console.error('Fetch audit logs failed:', error)
    return res.status(500).json({ error: 'Failed to fetch audit logs' })
  }
})

module.exports = router
