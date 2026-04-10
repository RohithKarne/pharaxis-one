/* eslint-disable no-console */
const assert = require('assert')
const bcrypt = require('bcrypt')
const mysql = require('mysql2/promise')

const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${process.env.PORT || 5100}`

const ADMIN_CREDS = {
  orgSlug: process.env.SMOKE_ORG_SLUG || 'novartis',
  email: process.env.SMOKE_ADMIN_EMAIL || 'admin@novartis.local',
  password: process.env.SMOKE_ADMIN_PASSWORD || 'Admin@123'
}

const AUTHOR_CREDS = {
  orgSlug: process.env.SMOKE_ORG_SLUG || 'novartis',
  email: process.env.SMOKE_AUTHOR_EMAIL || 'author@novartis.local',
  password: process.env.SMOKE_AUTHOR_PASSWORD || 'Author@123'
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
  const { status, payload } = await requestJson('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
  })
  return { status, payload }
}

async function ensureInactiveOrgScenario() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'devuser',
    password: process.env.MYSQL_PASSWORD || 'devpass',
    database: process.env.MYSQL_DATABASE || 'pharaxis_vault_dev'
  })

  const slug = `inactive-smoke-${Date.now()}`
  const [orgInsert] = await connection.execute(
    `INSERT INTO orgs (name, slug, status, doc_number_prefix, storage_quota_mb, created_by)
     VALUES (?, ?, 'inactive', ?, 10240, NULL)`,
    [`Inactive Smoke ${Date.now()}`, slug, 'ISM']
  )

  const hash = await bcrypt.hash('Inactive@123', 10)
  await connection.execute(
    `INSERT INTO users (org_id, name, email, password_hash, role, is_active)
     VALUES (?, 'Inactive User', ?, ?, 'admin', 1)`,
    [orgInsert.insertId, `${slug}@pharaxis.local`, hash]
  )

  await connection.end()

  return {
    orgSlug: slug,
    email: `${slug}@pharaxis.local`,
    password: 'Inactive@123'
  }
}

async function ensureTypeExists(adminToken) {
  const typeList = await requestJson('/api/taxonomy/types', {
    headers: bearer(adminToken)
  })
  assert.strictEqual(typeList.status, 200, 'GET /api/taxonomy/types should return 200')

  if (Array.isArray(typeList.payload) && typeList.payload.length > 0) {
    return Number(typeList.payload[0].id)
  }

  const code = `SMK${String(Date.now()).slice(-3)}`
  const createType = await requestJson('/api/taxonomy/types', {
    method: 'POST',
    headers: { ...bearer(adminToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: `Smoke Type ${code}`,
      code
    })
  })
  assert.strictEqual(createType.status, 201, 'POST /api/taxonomy/types should create a type when missing')
  return Number(createType.payload.id)
}

async function uploadSmokeDocument(authorToken, typeId) {
  const form = new FormData()
  form.append('title', `Smoke Sprint1 ${Date.now()}`)
  form.append('content_type_id', String(typeId))
  form.append('file', new Blob(['%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'], { type: 'application/pdf' }), 'smoke.pdf')

  const response = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    headers: bearer(authorToken),
    body: form
  })
  const payload = await response.json()
  assert.strictEqual(response.status, 201, 'POST /api/upload should return 201')
  assert.ok(payload.content_id, 'Upload response must contain content_id')
  return Number(payload.content_id)
}

async function run() {
  console.log(`Running Vault Sprint 1 smoke tests against ${BASE_URL}`)

  const validAdminLogin = await login(ADMIN_CREDS)
  assert.strictEqual(validAdminLogin.status, 200, 'Valid admin login should return 200')
  assert.ok(validAdminLogin.payload.token, 'Valid admin login should return token')
  const adminToken = validAdminLogin.payload.token

  const validAuthorLogin = await login(AUTHOR_CREDS)
  assert.strictEqual(validAuthorLogin.status, 200, 'Valid author login should return 200')
  assert.ok(validAuthorLogin.payload.token, 'Valid author login should return token')
  const authorToken = validAuthorLogin.payload.token

  const invalidLogin = await login({
    orgSlug: ADMIN_CREDS.orgSlug,
    email: ADMIN_CREDS.email,
    password: 'wrong-password'
  })
  assert.strictEqual(invalidLogin.status, 401, 'Invalid login should return 401')

  const inactiveCreds = await ensureInactiveOrgScenario()
  const inactiveLogin = await login(inactiveCreds)
  assert.strictEqual(inactiveLogin.status, 401, 'Inactive org login should return 401')

  const me = await requestJson('/api/auth/me', { headers: bearer(adminToken) })
  assert.strictEqual(me.status, 200, 'GET /api/auth/me should return 200')
  assert.ok(me.payload.id, 'GET /api/auth/me should return user object')

  const usersAdmin = await requestJson('/api/users', { headers: bearer(adminToken) })
  assert.strictEqual(usersAdmin.status, 200, 'GET /api/users with admin should return 200')
  assert.ok(Array.isArray(usersAdmin.payload), 'GET /api/users should return array')

  const usersAuthorCreate = await requestJson('/api/users', {
    method: 'POST',
    headers: { ...bearer(authorToken), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'No Access',
      email: `no-access-${Date.now()}@novartis.local`,
      role: 'viewer',
      password: 'Temp@123'
    })
  })
  assert.strictEqual(usersAuthorCreate.status, 403, 'POST /api/users with non-admin should return 403')

  const taxonomyTypes = await requestJson('/api/taxonomy/types', { headers: bearer(adminToken) })
  assert.strictEqual(taxonomyTypes.status, 200, 'GET /api/taxonomy/types should return 200')

  const folders = await requestJson('/api/folders', { headers: bearer(adminToken) })
  assert.strictEqual(folders.status, 200, 'GET /api/folders should return 200')
  assert.ok(Array.isArray(folders.payload), 'GET /api/folders should return array')

  const search = await requestJson('/api/search?q=test', { headers: bearer(adminToken) })
  assert.strictEqual(search.status, 200, 'GET /api/search should return 200')
  assert.ok(Array.isArray(search.payload.results), 'GET /api/search should include results')
  assert.ok(typeof search.payload.total === 'number', 'GET /api/search should include total')

  const expiry = await requestJson('/api/content/expiry-dashboard', { headers: bearer(adminToken) })
  assert.strictEqual(expiry.status, 200, 'GET /api/content/expiry-dashboard should return 200')
  assert.ok(Array.isArray(expiry.payload.expiring_30), 'expiry-dashboard should include expiring_30')
  assert.ok(Array.isArray(expiry.payload.expiring_60), 'expiry-dashboard should include expiring_60')
  assert.ok(Array.isArray(expiry.payload.expiring_90), 'expiry-dashboard should include expiring_90')
  assert.ok(Array.isArray(expiry.payload.expired), 'expiry-dashboard should include expired')

  const auditAdmin = await requestJson('/api/audit', { headers: bearer(adminToken) })
  assert.strictEqual(auditAdmin.status, 200, 'GET /api/audit as admin should return 200')

  const auditAuthor = await requestJson('/api/audit', { headers: bearer(authorToken) })
  assert.strictEqual(auditAuthor.status, 403, 'GET /api/audit as non-admin should return 403')

  const typeId = await ensureTypeExists(adminToken)
  const contentId = await uploadSmokeDocument(authorToken, typeId)

  const checkout = await requestJson(`/api/content/${contentId}/checkout`, {
    method: 'POST',
    headers: bearer(authorToken)
  })
  assert.strictEqual(checkout.status, 200, 'Checkout by author should return 200')

  const secondCheckout = await requestJson(`/api/content/${contentId}/checkout`, {
    method: 'POST',
    headers: bearer(adminToken)
  })
  assert.strictEqual(secondCheckout.status, 423, 'Second checkout by different user should return 423')

  const checkin = await requestJson(`/api/content/${contentId}/checkin`, {
    method: 'POST',
    headers: bearer(authorToken)
  })
  assert.strictEqual(checkin.status, 200, 'Check in should return 200')

  console.log('Vault Sprint 1 smoke tests passed')
}

run().catch(error => {
  console.error('Smoke test failed:', error.message)
  process.exit(1)
})
