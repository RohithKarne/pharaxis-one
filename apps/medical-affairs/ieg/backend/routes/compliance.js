const express = require('express')
const { query } = require('../database/db')
const { requireAuth, requireInternal } = require('../middleware/auth')
const { requireRoles } = require('../middleware/authorize')

const router = express.Router()
router.use(requireAuth, requireInternal)

router.get('/rules', async (req, res) => {
  const moduleKey = req.query.moduleKey
  const params = []
  let where = 'WHERE is_active = TRUE'
  if (moduleKey) {
    params.push(moduleKey)
    where += ` AND module_key IN ($${params.length}, 'shared')`
  }

  const { rows } = await query(`SELECT * FROM ieg_compliance_rules ${where} ORDER BY module_key, rule_key`, params)
  return res.json({ rules: rows })
})

router.post('/rules', requireRoles(['superadmin', 'admin']), async (req, res) => {
  const { jurisdiction = 'US', moduleKey, ruleKey, severity, threshold = {}, message } = req.body || {}
  if (!moduleKey || !ruleKey || !severity || !message) {
    return res.status(400).json({ error: 'moduleKey, ruleKey, severity, message are required' })
  }

  await query(
    `
      INSERT INTO ieg_compliance_rules (jurisdiction, module_key, rule_key, severity, threshold, message)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      ON CONFLICT (jurisdiction, module_key, rule_key)
      DO UPDATE SET severity = EXCLUDED.severity, threshold = EXCLUDED.threshold, message = EXCLUDED.message, is_active = TRUE
    `,
    [jurisdiction, moduleKey, ruleKey, severity, JSON.stringify(threshold), message]
  )

  const { rows } = await query(
    `
      SELECT *
      FROM ieg_compliance_rules
      WHERE jurisdiction = $1 AND module_key = $2 AND rule_key = $3
      LIMIT 1
    `,
    [jurisdiction, moduleKey, ruleKey]
  )

  return res.status(201).json({ rule: rows[0] })
})

module.exports = router
