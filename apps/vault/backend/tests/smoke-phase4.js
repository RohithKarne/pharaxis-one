/* eslint-disable no-console */
const assert = require('assert')
const { runWorkflowReminderJob } = require('../services/workflowReminderService')

const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 5100}`
const ORG_SLUG = process.env.SMOKE_ORG_SLUG || 'novartis'

const ADMIN_CREDS = {
  orgSlug: ORG_SLUG,
  email: process.env.SMOKE_ADMIN_EMAIL || 'admin@novartis.local',
  password: process.env.SMOKE_ADMIN_PASSWORD || 'Admin@123'
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options)
  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : await response.text()
  return { status: response.status, ok: response.ok, payload, response }
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` }
}

async function login(credentials) {
  const { orgSlug, ...loginPayload } = credentials
  return requestJson('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(orgSlug ? { 'X-Org-Slug': orgSlug } : {})
    },
    body: JSON.stringify(loginPayload)
  })
}

async function run() {
  console.log(`Running Vault Phase 4 smoke tests against ${BASE_URL}`)

  // Emit notifications in-test so feed + delivery fields can be validated deterministically.
  await runWorkflowReminderJob()

  const adminLogin = await login(ADMIN_CREDS)
  assert.strictEqual(adminLogin.status, 200, 'Admin login should return 200')
  const adminToken = adminLogin.payload.token
  assert.ok(adminToken, 'Admin login should return token')

  const insights = await requestJson('/api/workflows/admin/insights', {
    headers: bearer(adminToken)
  })
  assert.strictEqual(insights.status, 200, 'GET /api/workflows/admin/insights should return 200')
  assert.ok(typeof insights.payload.pending_total === 'number', 'Insights should include pending_total')

  const authPolicy = await requestJson('/api/admin/security/auth-policy', {
    headers: bearer(adminToken)
  })
  assert.strictEqual(authPolicy.status, 200, 'GET /api/admin/security/auth-policy should return 200')
  assert.ok(['off', 'optional', 'required'].includes(authPolicy.payload.mfa_mode), 'Auth policy should include mfa_mode')

  const saveAuthPolicy = await requestJson('/api/admin/security/auth-policy', {
    method: 'PUT',
    headers: { ...bearer(adminToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...authPolicy.payload,
      mfa_mode: 'off'
    })
  })
  assert.strictEqual(saveAuthPolicy.status, 200, 'PUT /api/admin/security/auth-policy should return 200')

  const rbacPolicy = await requestJson('/api/workflows/admin/rbac-policy', {
    headers: bearer(adminToken)
  })
  assert.strictEqual(rbacPolicy.status, 200, 'GET /api/workflows/admin/rbac-policy should return 200')
  assert.ok(rbacPolicy.payload.action_role_matrix, 'RBAC policy should include action_role_matrix')

  const analytics = await requestJson('/api/workflows/admin/analytics?window_days=30', {
    headers: bearer(adminToken)
  })
  assert.strictEqual(analytics.status, 200, 'GET /api/workflows/admin/analytics should return 200')
  assert.ok(analytics.payload.kpis, 'Analytics should include kpis')

  const analyticsCsv = await fetch(`${BASE_URL}/api/workflows/admin/analytics/export.csv?window_days=30`, {
    headers: bearer(adminToken)
  })
  assert.strictEqual(analyticsCsv.status, 200, 'GET /api/workflows/admin/analytics/export.csv should return 200')
  const analyticsCsvText = await analyticsCsv.text()
  assert.ok(analyticsCsvText.includes('Metric,Value'), 'Analytics CSV should contain header row')

  const notifications = await requestJson('/api/workflows/admin/notifications?limit=5', {
    headers: bearer(adminToken)
  })
  assert.strictEqual(notifications.status, 200, 'GET /api/workflows/admin/notifications should return 200')
  assert.ok(Array.isArray(notifications.payload), 'Notifications payload should be array')
  if (notifications.payload.length) {
    const sample = notifications.payload[0]
    assert.ok(['sent', 'skipped', 'failed'].includes(sample.email_delivery_status), 'email_delivery_status should be present')
    assert.ok(['sent', 'skipped', 'failed'].includes(sample.webhook_delivery_status), 'webhook_delivery_status should be present')
  }

  const queue = await requestJson('/api/workflows/admin/queue?status=pending', {
    headers: bearer(adminToken)
  })
  assert.strictEqual(queue.status, 200, 'GET /api/workflows/admin/queue should return 200')

  const connectorName = `Smoke Connector ${Date.now()}`
  const connectorCreate = await requestJson('/api/admin/integrations/connectors', {
    method: 'POST',
    headers: { ...bearer(adminToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: connectorName,
      connector_type: 'custom',
      base_url: `${BASE_URL}/api/health`,
      auth_type: 'none'
    })
  })
  assert.strictEqual(connectorCreate.status, 201, 'POST /api/admin/integrations/connectors should return 201')

  const connectors = await requestJson('/api/admin/integrations/connectors', {
    headers: bearer(adminToken)
  })
  assert.strictEqual(connectors.status, 200, 'GET /api/admin/integrations/connectors should return 200')
  const createdConnector = Array.isArray(connectors.payload)
    ? connectors.payload.find(item => item.name === connectorName)
    : null
  assert.ok(createdConnector, 'Created connector should be listed')

  const connectorTest = await requestJson(`/api/admin/integrations/connectors/${createdConnector.id}/test`, {
    method: 'POST',
    headers: bearer(adminToken)
  })
  assert.strictEqual(connectorTest.status, 200, 'POST /api/admin/integrations/connectors/:id/test should return 200')

  const users = await requestJson('/api/users', {
    headers: bearer(adminToken)
  })
  assert.strictEqual(users.status, 200, 'GET /api/users should return 200')

  const pendingTask = Array.isArray(queue.payload.results)
    ? queue.payload.results.find(task => task.status === 'pending')
    : null
  const candidate = Array.isArray(users.payload)
    ? users.payload.find(user => pendingTask && Number(user.id) !== Number(pendingTask.assignee_user_id) && Number(user.is_active) === 1)
    : null

  if (pendingTask && candidate) {
    const delegate = await requestJson(`/api/workflows/tasks/${pendingTask.id}/delegate`, {
      method: 'POST',
      headers: { ...bearer(adminToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        delegate_to_user_id: candidate.id,
        reason: 'Smoke phase4 delegation check'
      })
    })
    assert.ok([200, 409].includes(delegate.status), 'Delegate should return 200 or 409 when already delegated')
  } else {
    console.log('No suitable pending task/user pair for delegation check; skipped')
  }

  console.log('Vault Phase 4 smoke tests passed')
  process.exit(0)
}

run().catch(error => {
  console.error('Phase 4 smoke test failed:', error.message)
  process.exit(1)
})
