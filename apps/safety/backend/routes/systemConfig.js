const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const { requireModule, assertOrgAccess } = require('../middleware/rbac')
const { MODULES } = require('../constants')
const { getConfigMap, setConfigValue } = require('../services/configService')
const { sendMail } = require('../services/emailService')
const { logAdminAction } = require('../services/auditService')

const router = express.Router()

const EDITABLE_CONFIG_KEYS = new Set([
  'smtp_host',
  'smtp_port',
  'smtp_user',
  'smtp_password',
  'smtp_from_email',
  'notification_preferences',
  'session_timeout_minutes',
  'max_concurrent_sessions',
  'audit_retention_days',
  'duplicate_precheck_onset_window_days'
])

router.use(authenticate)
router.use(requireModule(MODULES.SYSTEM_CONFIG))

router.get('/', async (req, res) => {
  const targetOrgId = req.query.orgId ? Number(req.query.orgId) : req.user.orgId

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) {
    return res.status(400).json({ error: 'Invalid org id' })
  }

  if (!assertOrgAccess(req, res, targetOrgId)) {
    return undefined
  }

  try {
    const configMap = await getConfigMap(targetOrgId)
    return res.json(configMap)
  } catch (error) {
    console.error('Fetch system config failed:', error)
    return res.status(500).json({ error: 'Failed to fetch system config' })
  }
})

router.put('/', async (req, res) => {
  const targetOrgId = req.body.orgId ? Number(req.body.orgId) : req.user.orgId
  const updates = req.body.config || {}

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) {
    return res.status(400).json({ error: 'Invalid org id' })
  }

  if (!assertOrgAccess(req, res, targetOrgId)) {
    return undefined
  }

  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return res.status(400).json({ error: 'config object is required' })
  }

  const keys = Object.keys(updates)
  if (!keys.length) {
    return res.status(400).json({ error: 'At least one config key must be provided' })
  }

  const blockedKeys = keys.filter((key) => !EDITABLE_CONFIG_KEYS.has(key))
  if (blockedKeys.length) {
    return res.status(400).json({ error: `Unsupported config keys: ${blockedKeys.join(', ')}` })
  }

  const beforeConfig = await getConfigMap(targetOrgId)

  try {
    for (const key of keys) {
      const rawValue = updates[key]
      const value = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue)
      await setConfigValue(targetOrgId, key, value, req.user.userId)
    }

    const afterConfig = await getConfigMap(targetOrgId)

    await logAdminAction({
      orgId: targetOrgId,
      actorUserId: req.user.userId,
      actionType: 'system_config_updated',
      entityType: 'system_config',
      entityId: String(targetOrgId),
      beforeValue: keys.reduce((acc, key) => {
        acc[key] = beforeConfig[key]
        return acc
      }, {}),
      afterValue: keys.reduce((acc, key) => {
        acc[key] = afterConfig[key]
        return acc
      }, {})
    })

    return res.json({
      message: 'System configuration updated',
      config: afterConfig
    })
  } catch (error) {
    console.error('Update system config failed:', error)
    return res.status(500).json({ error: 'Failed to update system config' })
  }
})

router.post('/test-email', async (req, res) => {
  const targetOrgId = req.body.orgId ? Number(req.body.orgId) : req.user.orgId
  const toEmail = String(req.body.toEmail || req.user.email || '').trim().toLowerCase()

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) {
    return res.status(400).json({ error: 'Invalid org id' })
  }

  if (!assertOrgAccess(req, res, targetOrgId)) {
    return undefined
  }

  if (!toEmail) {
    return res.status(400).json({ error: 'toEmail is required' })
  }

  try {
    const configMap = await getConfigMap(targetOrgId)

    const [[org]] = await pool.execute(
      'SELECT org_name FROM organisations WHERE org_id = ?',
      [targetOrgId]
    )

    const mailResult = await sendMail({
      configMap,
      to: toEmail,
      subject: 'Pharaxis Safety SMTP test',
      text: `SMTP test successful for ${org ? org.org_name : 'organisation'} (${new Date().toISOString()})`,
      html: `<p>SMTP test successful for <b>${org ? org.org_name : 'organisation'}</b>.</p><p>Timestamp: ${new Date().toISOString()}</p>`
    })

    await logAdminAction({
      orgId: targetOrgId,
      actorUserId: req.user.userId,
      actionType: 'system_config_test_email_sent',
      entityType: 'system_config',
      entityId: String(targetOrgId),
      metadata: {
        toEmail,
        accepted: mailResult.accepted,
        rejected: mailResult.rejected
      }
    })

    return res.json({
      message: 'Test email sent',
      result: mailResult
    })
  } catch (error) {
    console.error('Test email failed:', error)
    return res.status(500).json({ error: 'Failed to send test email' })
  }
})

module.exports = router
