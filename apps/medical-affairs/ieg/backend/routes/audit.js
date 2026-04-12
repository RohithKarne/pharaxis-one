const express = require('express')
const { query } = require('../database/db')
const { requireAuth, requireInternal } = require('../middleware/auth')

const router = express.Router()
router.use(requireAuth, requireInternal)

router.get('/', async (req, res) => {
  const { moduleKey, entityType, entityId, limit = 200 } = req.query
  const params = []
  const whereClauses = []

  if (moduleKey) {
    params.push(moduleKey)
    whereClauses.push(`module_key = $${params.length}`)
  }
  if (entityType) {
    params.push(entityType)
    whereClauses.push(`entity_type = $${params.length}`)
  }
  if (entityId) {
    params.push(String(entityId))
    whereClauses.push(`entity_id = $${params.length}`)
  }

  params.push(Math.min(Number(limit) || 200, 500))

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
  const { rows } = await query(
    `SELECT * FROM ieg_audit_log ${whereSql} ORDER BY occurred_at DESC LIMIT $${params.length}`,
    params
  )

  return res.json({ audit: rows })
})

module.exports = router
