const express = require('express')
const { query } = require('../database/db')
const { requireAuth } = require('../middleware/auth')
const { authorizeRoles } = require('../middleware/authorize')
const { asyncHandler } = require('../utils/asyncHandler')
const { ROLES } = require('../utils/constants')

const router = express.Router()

router.get(
  '/',
  requireAuth,
  authorizeRoles([ROLES.ORG_ADMIN, ROLES.PUBLICATIONS_MANAGER]),
  asyncHandler(async (req, res) => {
    const params = []
    const clauses = []

    if (!req.user.isSuperadmin) {
      clauses.push('tenant_id = ?')
      params.push(req.user.tenantId)
    } else if (req.query.tenantId) {
      clauses.push('tenant_id = ?')
      params.push(Number(req.query.tenantId))
    }

    if (req.query.publicationId) {
      clauses.push("entity_type = 'publication' AND entity_id = ?")
      params.push(String(req.query.publicationId))
    }

    if (req.query.actorUserId) {
      clauses.push('actor_user_id = ?')
      params.push(Number(req.query.actorUserId))
    }

    if (req.query.actionType) {
      clauses.push('action_type = ?')
      params.push(String(req.query.actionType))
    }

    if (req.query.startDate) {
      clauses.push('occurred_at >= ?')
      params.push(`${String(req.query.startDate)} 00:00:00`)
    }

    if (req.query.endDate) {
      clauses.push('occurred_at <= ?')
      params.push(`${String(req.query.endDate)} 23:59:59`)
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''

    const rows = await query(
      `
        SELECT
          id,
          tenant_id AS tenantId,
          actor_user_id AS actorUserId,
          action_type AS actionType,
          entity_type AS entityType,
          entity_id AS entityId,
          metadata,
          occurred_at AS occurredAt
        FROM pub_audit_log
        ${whereSql}
        ORDER BY occurred_at DESC
        LIMIT 500
      `,
      params
    )

    res.json({ entries: rows })
  })
)

module.exports = router
