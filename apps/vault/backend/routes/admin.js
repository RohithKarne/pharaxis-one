const crypto = require('crypto')
const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const auditService = require('../services/auditService')
const { sendWorkflowTestEmail } = require('../services/workflowNotificationDeliveryService')
const { getOrgAuthPolicy, setOrgAuthPolicy } = require('../services/authPolicyService')
const { assertSafeOutboundUrl } = require('../services/networkGuard')

const router = express.Router()

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin role required' })
  next()
}

function generateApiKey() {
  return `vch_${crypto.randomBytes(16).toString('hex')}`
}

function normalizeConnectorType(value) {
  const allowed = ['veeva_vault', 'mims', 'crm', 'safety', 'custom']
  const normalized = String(value || '').trim().toLowerCase()
  return allowed.includes(normalized) ? normalized : 'custom'
}

function normalizeAuthType(value) {
  const allowed = ['none', 'api_key', 'basic', 'oauth2']
  const normalized = String(value || '').trim().toLowerCase()
  return allowed.includes(normalized) ? normalized : 'none'
}

function maskSecret(value) {
  if (!value) return null
  const raw = String(value)
  if (raw.length <= 4) return '****'
  return `${'*'.repeat(Math.min(8, raw.length - 4))}${raw.slice(-4)}`
}

async function runConnectorHealthTest(connector) {
  const targetUrl = String(connector.base_url || '').trim()
  if (!targetUrl) return { status: 'fail', message: 'Connector base_url missing' }

  let parsedUrl
  try {
    parsedUrl = await assertSafeOutboundUrl(targetUrl)
  } catch (error) {
    return { status: 'fail', message: 'Invalid connector URL' }
  }

  const shouldDoLiveTest = String(process.env.CONNECTOR_TEST_MODE || 'live').toLowerCase() === 'live'
  if (!shouldDoLiveTest) {
    return { status: 'pass', message: 'Connector test simulated (CONNECTOR_TEST_MODE != live)' }
  }

  const timeoutMs = Number.parseInt(process.env.CONNECTOR_TEST_TIMEOUT_MS || '4000', 10)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(15000, Math.max(1000, timeoutMs)))

  try {
    const headers = { 'User-Agent': 'Pharaxis-Vault-Connector-Test/1.0' }
    if (connector.auth_type === 'api_key' && connector.auth_value) {
      headers.Authorization = `Bearer ${connector.auth_value}`
    }
    const response = await fetch(parsedUrl.toString(), { method: 'GET', headers, signal: controller.signal })
    if (!response.ok) {
      return { status: 'fail', message: `Health check returned HTTP ${response.status}` }
    }
    return { status: 'pass', message: 'Health check passed' }
  } catch (error) {
    return { status: 'fail', message: error.message || 'Connector health check failed' }
  } finally {
    clearTimeout(timer)
  }
}

router.get('/channels', authenticate, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, org_id, app_name, api_key, webhook_url, status, created_by, created_at
       FROM content_channels
       WHERE org_id = ?
       ORDER BY created_at DESC`,
      [req.user.orgId]
    )
    res.json(rows)
  } catch (error) {
    console.error('List content channels error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/channels', authenticate, requireAdmin, async (req, res) => {
  const { app_name, webhook_url } = req.body
  if (!app_name) return res.status(400).json({ error: 'app_name is required' })

  try {
    const apiKey = generateApiKey()
    const [result] = await pool.execute(
      `INSERT INTO content_channels (org_id, app_name, api_key, webhook_url, status, created_by)
       VALUES (?, ?, ?, ?, 'active', ?)`,
      [req.user.orgId, String(app_name).trim(), apiKey, webhook_url || null, req.user.userId]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'content_channel_created',
      'content_channel',
      result.insertId,
      req.ip,
      null,
      { app_name, webhook_url: webhook_url || null },
      'Content channel created'
    )

    res.status(201).json({
      id: result.insertId,
      app_name: String(app_name).trim(),
      api_key: apiKey,
      webhook_url: webhook_url || null,
      status: 'active'
    })
  } catch (error) {
    console.error('Create content channel error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/channels/:id', authenticate, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid channel id' })

  const updates = []
  const params = []
  if (req.body.webhook_url !== undefined) {
    updates.push('webhook_url = ?')
    params.push(req.body.webhook_url || null)
  }
  if (req.body.status !== undefined) {
    if (!['active', 'inactive'].includes(req.body.status)) {
      return res.status(400).json({ error: 'status must be active/inactive' })
    }
    updates.push('status = ?')
    params.push(req.body.status)
  }

  if (!updates.length) return res.status(400).json({ error: 'Provide webhook_url and/or status' })

  try {
    params.push(id, req.user.orgId)
    const [result] = await pool.execute(
      `UPDATE content_channels
       SET ${updates.join(', ')}
       WHERE id = ? AND org_id = ?`,
      params
    )
    if (!result.affectedRows) return res.status(404).json({ error: 'Channel not found' })

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'content_channel_updated',
      'content_channel',
      id,
      req.ip,
      null,
      req.body,
      'Content channel updated'
    )

    res.json({ message: 'Channel updated' })
  } catch (error) {
    console.error('Update content channel error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/retention', authenticate, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT oc.config_key, oc.config_value
       FROM org_config oc
       WHERE oc.org_id = ?
         AND oc.config_key LIKE 'retention_type_%'`,
      [req.user.orgId]
    )

    const mapped = rows.map(row => {
      const typeId = Number(String(row.config_key).replace('retention_type_', ''))
      return {
        content_type_id: Number.isNaN(typeId) ? null : typeId,
        review_cycle_months: Number(row.config_value)
      }
    })

    res.json(mapped)
  } catch (error) {
    console.error('Get retention defaults error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/retention', authenticate, requireAdmin, async (req, res) => {
  const defaults = Array.isArray(req.body.defaults) ? req.body.defaults : []
  if (!defaults.length) {
    return res.status(400).json({ error: 'defaults array is required' })
  }

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    for (const item of defaults) {
      const typeId = Number(item.content_type_id)
      const months = Number(item.review_cycle_months)
      if (!Number.isInteger(typeId) || typeId <= 0 || !Number.isInteger(months) || months <= 0) {
        throw new Error('Each default requires valid content_type_id and positive review_cycle_months')
      }

      const key = `retention_type_${typeId}`
      await connection.execute(
        `INSERT INTO org_config (org_id, config_key, config_value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
        [req.user.orgId, key, String(months)]
      )
    }

    await connection.commit()

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'retention_policy_updated',
      'org_config',
      null,
      req.ip,
      null,
      { defaults },
      'Retention defaults updated'
    )

    res.json({ message: 'Retention defaults updated', updated: defaults.length })
  } catch (error) {
    await connection.rollback()
    res.status(400).json({ error: error.message || 'Invalid payload' })
  } finally {
    connection.release()
  }
})

router.post('/workflows/test-email', authenticate, requireAdmin, async (req, res) => {
  const toEmail = String(req.body.to_email || '').trim()
  if (!toEmail) {
    return res.status(400).json({ error: 'to_email is required' })
  }

  try {
    const [[org]] = await pool.execute(
      'SELECT id, name FROM orgs WHERE id = ?',
      [req.user.orgId]
    )

    const result = await sendWorkflowTestEmail({
      toEmail,
      orgName: org?.name || `Org #${req.user.orgId}`,
      requestedBy: `User #${req.user.userId}`
    })

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'workflow_test_email_requested',
      'workflow_notification',
      null,
      req.ip,
      null,
      {
        to_email: toEmail,
        status: result.status,
        error: result.error || null
      },
      'Workflow test email requested'
    )

    if (result.status !== 'sent') {
      return res.status(502).json({
        error: result.error || 'Workflow test email failed',
        status: result.status
      })
    }

    res.json({
      message: 'Workflow test email sent',
      to_email: toEmail,
      status: result.status
    })
  } catch (error) {
    console.error('Workflow test email error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/security/auth-policy', authenticate, requireAdmin, async (req, res) => {
  try {
    const policy = await getOrgAuthPolicy(req.user.orgId)
    res.json(policy)
  } catch (error) {
    console.error('Get auth policy error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.put('/security/auth-policy', authenticate, requireAdmin, async (req, res) => {
  try {
    const policy = await setOrgAuthPolicy(req.user.orgId, req.body || {})
    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'auth_policy_updated',
      'org_config',
      null,
      req.ip,
      null,
      policy,
      'Organization authentication policy updated'
    )
    res.json(policy)
  } catch (error) {
    console.error('Update auth policy error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/integrations/connectors', authenticate, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         id,
         org_id,
         name,
         connector_type,
         base_url,
         auth_type,
         auth_value,
         status,
         last_test_status,
         last_test_message,
         last_tested_at,
         created_by,
         updated_by,
         created_at,
         updated_at
       FROM integration_connectors
       WHERE org_id = ?
       ORDER BY created_at DESC`,
      [req.user.orgId]
    )
    res.json(rows.map(row => ({
      ...row,
      auth_value_masked: maskSecret(row.auth_value),
      auth_value: undefined
    })))
  } catch (error) {
    console.error('List integration connectors error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/integrations/connectors', authenticate, requireAdmin, async (req, res) => {
  const name = String(req.body.name || '').trim()
  const baseUrl = String(req.body.base_url || '').trim()
  if (!name || !baseUrl) {
    return res.status(400).json({ error: 'name and base_url are required' })
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO integration_connectors
         (org_id, name, connector_type, base_url, auth_type, auth_value, status, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.orgId,
        name,
        normalizeConnectorType(req.body.connector_type),
        baseUrl,
        normalizeAuthType(req.body.auth_type),
        req.body.auth_value ? String(req.body.auth_value) : null,
        req.body.status === 'inactive' ? 'inactive' : 'active',
        req.user.userId,
        req.user.userId
      ]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'integration_connector_created',
      'integration_connector',
      result.insertId,
      req.ip,
      null,
      {
        name,
        base_url: baseUrl,
        connector_type: normalizeConnectorType(req.body.connector_type),
        auth_type: normalizeAuthType(req.body.auth_type)
      },
      'Integration connector created'
    )

    res.status(201).json({ id: result.insertId, message: 'Integration connector created' })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Connector name already exists in this organization' })
    }
    console.error('Create integration connector error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/integrations/connectors/:id', authenticate, requireAdmin, async (req, res) => {
  const connectorId = Number(req.params.id)
  if (!Number.isInteger(connectorId) || connectorId <= 0) {
    return res.status(400).json({ error: 'Invalid connector id' })
  }

  const updates = []
  const params = []
  if (req.body.name !== undefined) {
    const name = String(req.body.name || '').trim()
    if (!name) return res.status(400).json({ error: 'name cannot be empty' })
    updates.push('name = ?')
    params.push(name)
  }
  if (req.body.base_url !== undefined) {
    const baseUrl = String(req.body.base_url || '').trim()
    if (!baseUrl) return res.status(400).json({ error: 'base_url cannot be empty' })
    updates.push('base_url = ?')
    params.push(baseUrl)
  }
  if (req.body.connector_type !== undefined) {
    updates.push('connector_type = ?')
    params.push(normalizeConnectorType(req.body.connector_type))
  }
  if (req.body.auth_type !== undefined) {
    updates.push('auth_type = ?')
    params.push(normalizeAuthType(req.body.auth_type))
  }
  if (req.body.auth_value !== undefined) {
    updates.push('auth_value = ?')
    params.push(req.body.auth_value ? String(req.body.auth_value) : null)
  }
  if (req.body.status !== undefined) {
    if (!['active', 'inactive'].includes(req.body.status)) {
      return res.status(400).json({ error: 'status must be active/inactive' })
    }
    updates.push('status = ?')
    params.push(req.body.status)
  }
  if (!updates.length) {
    return res.status(400).json({ error: 'No updates supplied' })
  }

  try {
    updates.push('updated_by = ?')
    params.push(req.user.userId)
    params.push(connectorId, req.user.orgId)
    const [result] = await pool.execute(
      `UPDATE integration_connectors
       SET ${updates.join(', ')}
       WHERE id = ? AND org_id = ?`,
      params
    )
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Connector not found' })
    }

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'integration_connector_updated',
      'integration_connector',
      connectorId,
      req.ip,
      null,
      req.body,
      'Integration connector updated'
    )

    res.json({ message: 'Integration connector updated' })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Connector name already exists in this organization' })
    }
    console.error('Update integration connector error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/integrations/connectors/:id/test', authenticate, requireAdmin, async (req, res) => {
  const connectorId = Number(req.params.id)
  if (!Number.isInteger(connectorId) || connectorId <= 0) {
    return res.status(400).json({ error: 'Invalid connector id' })
  }

  try {
    const [[connector]] = await pool.execute(
      `SELECT id, org_id, name, connector_type, base_url, auth_type, auth_value, status
       FROM integration_connectors
       WHERE id = ? AND org_id = ?`,
      [connectorId, req.user.orgId]
    )
    if (!connector) return res.status(404).json({ error: 'Connector not found' })
    if (connector.status !== 'active') {
      return res.status(409).json({ error: 'Connector must be active before running test' })
    }

    const testResult = await runConnectorHealthTest(connector)
    await pool.execute(
      `UPDATE integration_connectors
       SET last_test_status = ?,
           last_test_message = ?,
           last_tested_at = NOW(),
           updated_by = ?
       WHERE id = ? AND org_id = ?`,
      [testResult.status, testResult.message, req.user.userId, connector.id, req.user.orgId]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'integration_connector_tested',
      'integration_connector',
      connector.id,
      req.ip,
      null,
      testResult,
      'Integration connector tested'
    )

    res.json({
      connector_id: connector.id,
      connector_name: connector.name,
      test_status: testResult.status,
      test_message: testResult.message
    })
  } catch (error) {
    console.error('Integration connector test error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
