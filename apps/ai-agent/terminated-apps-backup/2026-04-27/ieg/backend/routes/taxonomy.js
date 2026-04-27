const express = require('express')
const { query } = require('../database/db')
const { requireAuth, requireInternal } = require('../middleware/auth')

const router = express.Router()
router.use(requireAuth, requireInternal)

router.get('/', async (_req, res) => {
  const { rows } = await query(`SELECT * FROM ieg_evidence_taxonomy WHERE is_active = TRUE ORDER BY taxonomy_type, label`)
  return res.json({ taxonomy: rows })
})

router.post('/', async (req, res) => {
  const { taxonomyType, code, label } = req.body || {}
  if (!taxonomyType || !code || !label) {
    return res.status(400).json({ error: 'taxonomyType, code and label are required' })
  }

  await query(
    `
      INSERT INTO ieg_evidence_taxonomy (taxonomy_type, code, label)
      VALUES ($1, $2, $3)
      ON CONFLICT (taxonomy_type, code)
      DO UPDATE SET label = EXCLUDED.label, is_active = TRUE
    `,
    [taxonomyType, code, label]
  )

  const { rows } = await query(
    `
      SELECT *
      FROM ieg_evidence_taxonomy
      WHERE taxonomy_type = $1 AND code = $2
      LIMIT 1
    `,
    [taxonomyType, code]
  )

  return res.status(201).json({ entry: rows[0] })
})

module.exports = router
