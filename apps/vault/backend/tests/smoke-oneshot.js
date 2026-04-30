/* eslint-disable no-console */
const BASE_URL = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5100'
const ORG_SLUG = process.env.SMOKE_ORG_SLUG || 'novartis'
const ORG_EMAIL = process.env.SMOKE_ADMIN_EMAIL || 'admin@novartis.local'
const ORG_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || 'Admin@123'
const SA_EMAIL = process.env.SMOKE_SUPERADMIN_EMAIL || 'superadmin@pharaxis.local'
const SA_PASSWORD = process.env.SMOKE_SUPERADMIN_PASSWORD || 'Super@123'

async function asJson(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options)
  const payload = await asJson(response)
  if (!response.ok) {
    throw new Error(`${path} -> ${response.status} ${JSON.stringify(payload)}`)
  }
  return payload
}

async function run() {
  console.log('Starting one-shot smoke checks...')

  await request('/api/health')
  console.log('PASS /api/health')

  const orgLogin = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orgSlug: ORG_SLUG,
      email: ORG_EMAIL,
      password: ORG_PASSWORD
    })
  })
  const orgToken = orgLogin.token
  if (!orgToken) throw new Error('Org login did not return token')
  console.log('PASS /api/auth/login')

  const notifications = await request('/api/workflows/notifications/my?limit=5', {
    headers: { Authorization: `Bearer ${orgToken}` }
  })
  if (!notifications || !notifications.summary) throw new Error('Notification payload missing summary')
  console.log('PASS /api/workflows/notifications/my')

  const saLogin = await request('/api/superadmin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: SA_EMAIL,
      password: SA_PASSWORD
    })
  })
  const saToken = saLogin.token
  if (!saToken) throw new Error('Superadmin login did not return token')
  console.log('PASS /api/superadmin/login')

  const hardening = await request('/api/superadmin/orgs/1/hardening', {
    headers: { Authorization: `Bearer ${saToken}` }
  })
  if (!hardening || !hardening.policy) throw new Error('Hardening payload missing policy')
  console.log('PASS /api/superadmin/orgs/:id/hardening')

  console.log('One-shot smoke checks completed.')
}

run().catch(error => {
  console.error('Smoke check failed:', error.message)
  process.exit(1)
})
