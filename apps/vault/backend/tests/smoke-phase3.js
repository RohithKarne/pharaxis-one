/* eslint-disable no-console */
const assert = require('assert')

const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 5100}`
const ORG_SLUG = process.env.SMOKE_ORG_SLUG || 'novartis'

const ADMIN_CREDS = {
  orgSlug: ORG_SLUG,
  email: process.env.SMOKE_ADMIN_EMAIL || 'admin@novartis.local',
  password: process.env.SMOKE_ADMIN_PASSWORD || 'Admin@123'
}

const REVIEWER_CREDS = {
  orgSlug: ORG_SLUG,
  email: process.env.SMOKE_REVIEWER_EMAIL || 'reviewer@novartis.local',
  password: process.env.SMOKE_REVIEWER_PASSWORD || 'Reviewer@123'
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
  console.log(`Running Vault Phase 3 smoke tests against ${BASE_URL}`)

  const adminLogin = await login(ADMIN_CREDS)
  assert.strictEqual(adminLogin.status, 200, 'Admin login should return 200')
  const adminToken = adminLogin.payload.token
  assert.ok(adminToken, 'Admin login should return token')

  const reviewerLogin = await login(REVIEWER_CREDS)
  assert.strictEqual(reviewerLogin.status, 200, 'Reviewer login should return 200')
  const reviewerToken = reviewerLogin.payload.token
  assert.ok(reviewerToken, 'Reviewer login should return token')

  const templates = await requestJson('/api/workflows/templates', {
    headers: bearer(adminToken)
  })
  assert.strictEqual(templates.status, 200, 'GET /api/workflows/templates should return 200')
  assert.ok(Array.isArray(templates.payload), 'Templates payload should be array')

  const queue = await requestJson('/api/workflows/admin/queue?status=pending', {
    headers: bearer(adminToken)
  })
  assert.strictEqual(queue.status, 200, 'GET /api/workflows/admin/queue should return 200')
  assert.ok(queue.payload && Array.isArray(queue.payload.results), 'Queue payload should include results')

  const myTasks = await requestJson('/api/workflows/tasks/my?status=pending', {
    headers: bearer(reviewerToken)
  })
  assert.strictEqual(myTasks.status, 200, 'GET /api/workflows/tasks/my should return 200')
  assert.ok(Array.isArray(myTasks.payload), 'My tasks payload should be array')

  const selectedTask = myTasks.payload.find(task => task.status === 'pending' && task.activation_status === 'ready')
  if (selectedTask) {
    const commentsList = await requestJson(`/api/workflows/tasks/${selectedTask.id}/comments`, {
      headers: bearer(reviewerToken)
    })
    assert.strictEqual(commentsList.status, 200, 'GET comments should return 200')
    assert.ok(Array.isArray(commentsList.payload), 'Comments payload should be array')

    const commentAdd = await requestJson(`/api/workflows/tasks/${selectedTask.id}/comments`, {
      method: 'POST',
      headers: { ...bearer(reviewerToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comment_text: `Smoke phase3 comment ${new Date().toISOString()}`
      })
    })
    assert.strictEqual(commentAdd.status, 201, 'POST comment should return 201')
  } else {
    console.log('No ready reviewer task found; comment/reassign checks skipped')
  }

  const users = await requestJson('/api/users', { headers: bearer(adminToken) })
  assert.strictEqual(users.status, 200, 'GET /api/users as admin should return 200')
  const approver = Array.isArray(users.payload)
    ? users.payload.find(user => user.role === 'approver' && user.is_active)
    : null

  const queueTask = queue.payload.results.find(task => task.status === 'pending')
  if (queueTask && approver) {
    const reassign = await requestJson(`/api/workflows/tasks/${queueTask.id}/reassign`, {
      method: 'POST',
      headers: { ...bearer(adminToken), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assignee_user_id: approver.id,
        reason: 'Smoke phase3 reassignment'
      })
    })
    assert.ok([200, 409].includes(reassign.status), 'Reassign should return 200 or 409 when already assigned')
  } else {
    console.log('No pending queue task or approver found; reassignment check skipped')
  }

  const queueCompleted = await requestJson('/api/workflows/admin/queue?status=completed', {
    headers: bearer(adminToken)
  })
  assert.strictEqual(queueCompleted.status, 200, 'GET completed queue should return 200')

  console.log('Vault Phase 3 smoke tests passed')
}

run().catch(error => {
  console.error('Phase 3 smoke test failed:', error.message)
  process.exit(1)
})
