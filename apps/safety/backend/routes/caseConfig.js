const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const { requireModule, assertOrgAccess } = require('../middleware/rbac')
const { MODULES } = require('../constants')
const { logAdminAction } = require('../services/auditService')

const router = express.Router()

function normalizePrefix(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12)
}

async function getConfigForOrg(orgId) {
  const [[config]] = await pool.execute(
    `SELECT config_id, org_id, case_prefix, sequence_padding, is_active, updated_by, updated_at
     FROM case_id_config
     WHERE org_id = ?`,
    [orgId]
  )
  return config || null
}

async function generateCaseId(orgId) {
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    const [[config]] = await connection.execute(
      `SELECT case_prefix, sequence_padding
       FROM case_id_config
       WHERE org_id = ? AND is_active = 1
       FOR UPDATE`,
      [orgId]
    )

    if (!config) {
      throw new Error('Case ID configuration is missing or inactive')
    }

    const caseYear = new Date().getUTCFullYear()

    await connection.execute(
      `INSERT INTO case_id_sequences (org_id, case_year, last_sequence)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE last_sequence = LAST_INSERT_ID(last_sequence + 1)`,
      [orgId, caseYear]
    )

    const [[seqRow]] = await connection.execute('SELECT LAST_INSERT_ID() AS next_sequence')
    const nextSequence = Number(seqRow.next_sequence)

    if (!Number.isInteger(nextSequence) || nextSequence <= 0) {
      throw new Error('Failed to generate case sequence')
    }

    const caseId = `${config.case_prefix}-${caseYear}-${String(nextSequence).padStart(config.sequence_padding, '0')}`

    await connection.commit()

    return {
      caseId,
      year: caseYear,
      sequence: nextSequence,
      prefix: config.case_prefix,
      sequencePadding: config.sequence_padding
    }
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

router.use(authenticate)
router.use(requireModule(MODULES.CASE_ID_CONFIG))

router.get('/', async (req, res) => {
  const targetOrgId = req.query.orgId ? Number(req.query.orgId) : req.user.orgId

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) {
    return res.status(400).json({ error: 'Invalid org id' })
  }

  if (!assertOrgAccess(req, res, targetOrgId)) {
    return undefined
  }

  try {
    const config = await getConfigForOrg(targetOrgId)
    if (!config) {
      return res.status(404).json({ error: 'Case ID configuration not found' })
    }

    const [[seq]] = await pool.execute(
      `SELECT case_year, last_sequence
       FROM case_id_sequences
       WHERE org_id = ? AND case_year = ?`,
      [targetOrgId, new Date().getUTCFullYear()]
    )

    return res.json({
      ...config,
      currentYearSequence: seq ? Number(seq.last_sequence) : 0
    })
  } catch (error) {
    console.error('Fetch case config failed:', error)
    return res.status(500).json({ error: 'Failed to fetch case configuration' })
  }
})

router.put('/', async (req, res) => {
  const { orgId, casePrefix, sequencePadding = 5, isActive = true } = req.body
  const targetOrgId = Number(orgId || req.user.orgId)

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) {
    return res.status(400).json({ error: 'Invalid org id' })
  }

  if (!assertOrgAccess(req, res, targetOrgId)) {
    return undefined
  }

  const normalizedPrefix = normalizePrefix(casePrefix)
  if (!normalizedPrefix) {
    return res.status(400).json({ error: 'Valid casePrefix is required' })
  }

  const padding = Number(sequencePadding)
  if (!Number.isInteger(padding) || padding < 3 || padding > 12) {
    return res.status(400).json({ error: 'sequencePadding must be between 3 and 12' })
  }

  try {
    const existing = await getConfigForOrg(targetOrgId)

    await pool.execute(
      `INSERT INTO case_id_config (org_id, case_prefix, sequence_padding, is_active, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         case_prefix = VALUES(case_prefix),
         sequence_padding = VALUES(sequence_padding),
         is_active = VALUES(is_active),
         updated_by = VALUES(updated_by),
         updated_at = CURRENT_TIMESTAMP`,
      [targetOrgId, normalizedPrefix, padding, isActive ? 1 : 0, req.user.userId]
    )

    await logAdminAction({
      orgId: targetOrgId,
      actorUserId: req.user.userId,
      actionType: 'case_id_config_updated',
      entityType: 'case_id_config',
      entityId: String(targetOrgId),
      beforeValue: existing,
      afterValue: {
        case_prefix: normalizedPrefix,
        sequence_padding: padding,
        is_active: isActive ? 1 : 0
      }
    })

    const updated = await getConfigForOrg(targetOrgId)
    return res.json({ message: 'Case ID config updated', config: updated })
  } catch (error) {
    console.error('Update case config failed:', error)
    return res.status(500).json({ error: 'Failed to update case configuration' })
  }
})

router.get('/preview/next-id', async (req, res) => {
  const targetOrgId = req.query.orgId ? Number(req.query.orgId) : req.user.orgId

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) {
    return res.status(400).json({ error: 'Invalid org id' })
  }

  if (!assertOrgAccess(req, res, targetOrgId)) {
    return undefined
  }

  try {
    const config = await getConfigForOrg(targetOrgId)
    if (!config || !config.is_active) {
      return res.status(400).json({ error: 'Active case ID config not found' })
    }

    const currentYear = new Date().getUTCFullYear()
    const [[seq]] = await pool.execute(
      'SELECT last_sequence FROM case_id_sequences WHERE org_id = ? AND case_year = ?',
      [targetOrgId, currentYear]
    )

    const nextSequence = (seq ? Number(seq.last_sequence) : 0) + 1
    const previewId = `${config.case_prefix}-${currentYear}-${String(nextSequence).padStart(config.sequence_padding, '0')}`

    return res.json({
      previewCaseId: previewId,
      nextSequence
    })
  } catch (error) {
    console.error('Preview case id failed:', error)
    return res.status(500).json({ error: 'Failed to preview case id' })
  }
})

router.post('/generate', async (req, res) => {
  const targetOrgId = req.body.orgId ? Number(req.body.orgId) : req.user.orgId

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) {
    return res.status(400).json({ error: 'Invalid org id' })
  }

  if (!assertOrgAccess(req, res, targetOrgId)) {
    return undefined
  }

  try {
    const generated = await generateCaseId(targetOrgId)

    await logAdminAction({
      orgId: targetOrgId,
      actorUserId: req.user.userId,
      actionType: 'case_id_generated',
      entityType: 'case',
      entityId: generated.caseId,
      afterValue: generated
    })

    return res.status(201).json(generated)
  } catch (error) {
    console.error('Generate case id failed:', error)
    return res.status(500).json({ error: error.message || 'Failed to generate case id' })
  }
})

module.exports = router
