const express = require('express')
const { query } = require('../database/db')
const { requireAuth, requireInternal } = require('../middleware/auth')
const { requireRoles } = require('../middleware/authorize')
const { logAudit } = require('../services/auditService')
const { actorFromAuth } = require('../utils/actor')
const { resolveApprovalMatrix } = require('../services/approvalService')

const router = express.Router()
router.use(requireAuth, requireInternal)

router.get('/', async (req, res) => {
  const moduleKey = req.query.moduleKey
  const params = []
  let where = ''

  if (moduleKey) {
    params.push(moduleKey)
    where = `WHERE module_key = $${params.length}`
  }

  const { rows } = await query(`SELECT * FROM ieg_approval_matrix ${where} ORDER BY created_at DESC`, params)
  return res.json({ approvalMatrix: rows })
})

router.post('/', requireRoles(['superadmin', 'admin']), async (req, res) => {
  const { moduleKey, requestType, geography = 'US', minValue = null, maxValue = null, approverChain = [] } = req.body || {}
  if (!moduleKey || !requestType || !Array.isArray(approverChain) || approverChain.length === 0) {
    return res.status(400).json({ error: 'moduleKey, requestType and approverChain are required' })
  }

  const { rows } = await query(
    `
      INSERT INTO ieg_approval_matrix
      (module_key, request_type, geography, min_value, max_value, approver_chain, created_by)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      RETURNING *
    `,
    [moduleKey, requestType, geography, minValue, maxValue, JSON.stringify(approverChain), req.auth.userId]
  )

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey,
    entityType: 'approval_matrix',
    entityId: String(rows[0].id),
    action: 'approval_matrix_created',
    metadata: rows[0]
  })

  return res.status(201).json({ matrix: rows[0] })
})

router.post('/resolve', async (req, res) => {
  const { moduleKey, requestType, geography = 'US', amount = 0 } = req.body || {}
  if (!moduleKey || !requestType) {
    return res.status(400).json({ error: 'moduleKey and requestType are required' })
  }

  const matrix = await resolveApprovalMatrix({ moduleKey, requestType, geography, amount })
  if (!matrix) {
    return res.status(404).json({ error: 'No matching approval matrix found' })
  }

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey,
    entityType: 'approval_matrix',
    entityId: String(matrix.id),
    action: 'approval_matrix_resolved',
    metadata: { requestType, geography, amount }
  })

  return res.json({ matrix })
})

module.exports = router
