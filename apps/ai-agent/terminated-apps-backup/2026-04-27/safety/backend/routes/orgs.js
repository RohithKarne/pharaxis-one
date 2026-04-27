const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const { requireModule, assertOrgAccess } = require('../middleware/rbac')
const { MODULES, ROLES } = require('../constants')
const { logAdminAction } = require('../services/auditService')
const { ensureDefaultConfig } = require('../services/configService')

const router = express.Router()

const DEFAULT_ORG_SETTINGS = {
  safetyInboxEmail: '',
  caseIntakeMode: 'manual',
  defaultTriagePriority: 'medium',
  autoAssignMedicalReviewer: true,
  requireStudyCode: false,
  timezone: 'UTC',
  dashboardAccent: 'teal'
}

function toSlug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function deriveCasePrefix(slug) {
  const normalized = String(slug || '')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 3)

  return normalized || 'ORG'
}

function parseStoredSettings(rawSettings) {
  if (!rawSettings) return { ...DEFAULT_ORG_SETTINGS }
  if (typeof rawSettings === 'object') {
    return {
      ...DEFAULT_ORG_SETTINGS,
      ...rawSettings
    }
  }

  try {
    const parsed = JSON.parse(rawSettings)
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_ORG_SETTINGS }
    }
    return {
      ...DEFAULT_ORG_SETTINGS,
      ...parsed
    }
  } catch {
    return { ...DEFAULT_ORG_SETTINGS }
  }
}

function normalizeSettingsPayload(payload = {}) {
  const normalized = {}
  const entries = payload && typeof payload === 'object' ? payload : {}

  if (Object.prototype.hasOwnProperty.call(entries, 'safetyInboxEmail')) {
    normalized.safetyInboxEmail = String(entries.safetyInboxEmail || '').trim().slice(0, 160)
  }

  if (Object.prototype.hasOwnProperty.call(entries, 'caseIntakeMode')) {
    const mode = String(entries.caseIntakeMode || '').trim().toLowerCase()
    if (!['manual', 'email', 'api'].includes(mode)) {
      return { error: 'caseIntakeMode must be one of: manual, email, api' }
    }
    normalized.caseIntakeMode = mode
  }

  if (Object.prototype.hasOwnProperty.call(entries, 'defaultTriagePriority')) {
    const priority = String(entries.defaultTriagePriority || '').trim().toLowerCase()
    if (!['low', 'medium', 'high', 'critical'].includes(priority)) {
      return { error: 'defaultTriagePriority must be one of: low, medium, high, critical' }
    }
    normalized.defaultTriagePriority = priority
  }

  if (Object.prototype.hasOwnProperty.call(entries, 'autoAssignMedicalReviewer')) {
    normalized.autoAssignMedicalReviewer = Boolean(entries.autoAssignMedicalReviewer)
  }

  if (Object.prototype.hasOwnProperty.call(entries, 'requireStudyCode')) {
    normalized.requireStudyCode = Boolean(entries.requireStudyCode)
  }

  if (Object.prototype.hasOwnProperty.call(entries, 'timezone')) {
    const timezone = String(entries.timezone || '').trim()
    if (!timezone) {
      return { error: 'timezone is required when provided' }
    }
    normalized.timezone = timezone.slice(0, 64)
  }

  if (Object.prototype.hasOwnProperty.call(entries, 'dashboardAccent')) {
    const accent = String(entries.dashboardAccent || '').trim().toLowerCase()
    if (!['teal', 'blue', 'emerald', 'sunset'].includes(accent)) {
      return { error: 'dashboardAccent must be one of: teal, blue, emerald, sunset' }
    }
    normalized.dashboardAccent = accent
  }

  return { normalized }
}

router.use(authenticate)
router.use(requireModule(MODULES.ORG_MANAGEMENT))

router.get('/', async (req, res) => {
  const { status } = req.query

  try {
    if (req.user.role === ROLES.SUPER_ADMIN) {
      const params = []
      let whereSql = ''
      if (status) {
        whereSql = 'WHERE status = ?'
        params.push(status)
      }

      const [rows] = await pool.execute(
        `SELECT org_id, org_name, org_slug, org_type, status, created_at, updated_at
         FROM organisations
         ${whereSql}
         ORDER BY org_name ASC`,
        params
      )

      return res.json(rows)
    }

    const [[org]] = await pool.execute(
      `SELECT org_id, org_name, org_slug, org_type, status, created_at, updated_at
       FROM organisations
       WHERE org_id = ?`,
      [req.user.orgId]
    )

    if (!org) {
      return res.status(404).json({ error: 'Organisation not found' })
    }

    return res.json([org])
  } catch (error) {
    console.error('List organisations failed:', error)
    return res.status(500).json({ error: 'Failed to list organisations' })
  }
})

router.post('/', async (req, res) => {
  const { orgName, orgSlug, orgType = 'pharma_direct' } = req.body

  if (!orgName) {
    return res.status(400).json({ error: 'orgName is required' })
  }

  if (!['CRO', 'pharma_direct'].includes(orgType)) {
    return res.status(400).json({ error: 'orgType must be CRO or pharma_direct' })
  }

  if (req.user.role !== ROLES.SUPER_ADMIN) {
    return res.status(403).json({ error: 'Only Super Admin can create new organisations' })
  }

  const slug = orgSlug ? toSlug(orgSlug) : toSlug(orgName)
  if (!slug) {
    return res.status(400).json({ error: 'Unable to derive a valid org slug' })
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO organisations (org_name, org_slug, org_type, status)
       VALUES (?, ?, ?, 'active')`,
      [orgName.trim(), slug, orgType]
    )

    const orgId = result.insertId

    await ensureDefaultConfig(orgId, req.user.userId)

    await pool.execute(
      `INSERT INTO case_id_config (org_id, case_prefix, sequence_padding, is_active, updated_by)
       VALUES (?, ?, 5, 1, ?)`,
      [orgId, deriveCasePrefix(slug), req.user.userId]
    )

    await logAdminAction({
      orgId,
      actorUserId: req.user.userId,
      actionType: 'organisation_created',
      entityType: 'organisation',
      entityId: String(orgId),
      afterValue: { orgName: orgName.trim(), orgSlug: slug, orgType }
    })

    return res.status(201).json({
      org_id: orgId,
      org_name: orgName.trim(),
      org_slug: slug,
      org_type: orgType,
      status: 'active'
    })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Organisation slug already exists' })
    }
    console.error('Create organisation failed:', error)
    return res.status(500).json({ error: 'Failed to create organisation' })
  }
})

router.patch('/:orgId/status', async (req, res) => {
  const targetOrgId = Number(req.params.orgId)
  const { status } = req.body

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) {
    return res.status(400).json({ error: 'Invalid org id' })
  }

  if (!['active', 'inactive'].includes(status)) {
    return res.status(400).json({ error: 'status must be active or inactive' })
  }

  if (!assertOrgAccess(req, res, targetOrgId)) {
    return undefined
  }

  try {
    const [[existing]] = await pool.execute(
      'SELECT org_id, org_name, status FROM organisations WHERE org_id = ?',
      [targetOrgId]
    )

    if (!existing) {
      return res.status(404).json({ error: 'Organisation not found' })
    }

    if (existing.status === status) {
      return res.json({ message: 'No change applied', organisation: existing })
    }

    await pool.execute(
      'UPDATE organisations SET status = ? WHERE org_id = ?',
      [status, targetOrgId]
    )

    if (status === 'inactive') {
      await pool.execute(
        `UPDATE user_sessions
         SET status = 'revoked', revoked_at = NOW(), revoked_by = ?, revoke_reason = 'org_deactivated'
         WHERE org_id = ? AND status = 'active'`,
        [req.user.userId, targetOrgId]
      )
    }

    await logAdminAction({
      orgId: targetOrgId,
      actorUserId: req.user.userId,
      actionType: status === 'inactive' ? 'organisation_deactivated' : 'organisation_activated',
      entityType: 'organisation',
      entityId: String(targetOrgId),
      beforeValue: { status: existing.status },
      afterValue: { status }
    })

    return res.json({
      message: `Organisation status updated to ${status}`,
      organisation: {
        ...existing,
        status
      }
    })
  } catch (error) {
    console.error('Update organisation status failed:', error)
    return res.status(500).json({ error: 'Failed to update organisation status' })
  }
})

router.get('/:orgId/settings', async (req, res) => {
  const targetOrgId = Number(req.params.orgId)

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) {
    return res.status(400).json({ error: 'Invalid org id' })
  }

  if (!assertOrgAccess(req, res, targetOrgId)) {
    return undefined
  }

  try {
    const [[org]] = await pool.execute(
      'SELECT org_id, org_name, org_type, settings_json FROM organisations WHERE org_id = ?',
      [targetOrgId]
    )

    if (!org) {
      return res.status(404).json({ error: 'Organisation not found' })
    }

    return res.json({
      org_id: org.org_id,
      org_name: org.org_name,
      org_type: org.org_type,
      settings: parseStoredSettings(org.settings_json)
    })
  } catch (error) {
    console.error('Fetch organisation settings failed:', error)
    return res.status(500).json({ error: 'Failed to fetch organisation settings' })
  }
})

router.patch('/:orgId/settings', async (req, res) => {
  const targetOrgId = Number(req.params.orgId)
  const settingsPayload = req.body?.settings && typeof req.body.settings === 'object'
    ? req.body.settings
    : req.body

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) {
    return res.status(400).json({ error: 'Invalid org id' })
  }

  if (!assertOrgAccess(req, res, targetOrgId)) {
    return undefined
  }

  const { normalized, error: payloadError } = normalizeSettingsPayload(settingsPayload)
  if (payloadError) {
    return res.status(400).json({ error: payloadError })
  }

  if (!Object.keys(normalized).length) {
    return res.status(400).json({ error: 'No valid settings fields provided' })
  }

  try {
    const [[org]] = await pool.execute(
      'SELECT org_id, org_name, settings_json FROM organisations WHERE org_id = ?',
      [targetOrgId]
    )

    if (!org) {
      return res.status(404).json({ error: 'Organisation not found' })
    }

    const beforeSettings = parseStoredSettings(org.settings_json)
    const afterSettings = {
      ...beforeSettings,
      ...normalized
    }

    await pool.execute(
      'UPDATE organisations SET settings_json = ? WHERE org_id = ?',
      [JSON.stringify(afterSettings), targetOrgId]
    )

    await logAdminAction({
      orgId: targetOrgId,
      actorUserId: req.user.userId,
      actionType: 'organisation_settings_updated',
      entityType: 'organisation_settings',
      entityId: String(targetOrgId),
      beforeValue: beforeSettings,
      afterValue: afterSettings
    })

    return res.json({
      message: 'Organisation settings updated',
      org_id: targetOrgId,
      settings: afterSettings
    })
  } catch (error) {
    console.error('Update organisation settings failed:', error)
    return res.status(500).json({ error: 'Failed to update organisation settings' })
  }
})

module.exports = router
