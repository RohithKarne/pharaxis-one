/* eslint-disable no-console */
const mysql = require('mysql2/promise')
const { ensureBackendServer } = require('./helpers/serverHarness')

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5200'
const SUPERADMIN_ORG = process.env.SUPERADMIN_ORG || 'pharaxis-platform'
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'safety.superadmin@pharaxis.one'
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'SafetyAdmin@123'

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })

  const text = await response.text()
  let payload
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = { raw: text }
  }

  if (!response.ok) {
    throw new Error(`Request ${method} ${path} failed with ${response.status}: ${JSON.stringify(payload)}`)
  }

  return payload
}

async function requestExpectStatus(path, { method = 'GET', token, body, expectedStatus }) {
  try {
    await request(path, { method, token, body })
  } catch (error) {
    if (error.message.includes(`with ${expectedStatus}:`)) {
      return
    }
    throw error
  }

  throw new Error(`Expected ${expectedStatus} for ${method} ${path}, but request succeeded`)
}

async function resetSeedUserSessions() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'devuser',
    password: process.env.MYSQL_PASSWORD || 'devpass',
    database: process.env.MYSQL_DATABASE || 'pharaxis_safety_dev'
  })

  try {
    const [result] = await connection.execute(
      `UPDATE user_sessions s
       INNER JOIN users u ON u.user_id = s.user_id
       INNER JOIN organisations o ON o.org_id = u.org_id
       SET s.status = 'revoked',
           s.revoked_at = NOW(),
           s.revoke_reason = 'smoke_reset'
       WHERE o.org_slug = ?
         AND u.email = ?
         AND s.status = 'active'`,
      [SUPERADMIN_ORG, SUPERADMIN_EMAIL]
    )
    console.log('revoked stale seed sessions:', result.affectedRows)
  } finally {
    await connection.end()
  }
}

async function verifyCaseTenantIsolation({ croOrgId, croClientId, directOrgId }) {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'devuser',
    password: process.env.MYSQL_PASSWORD || 'devpass',
    database: process.env.MYSQL_DATABASE || 'pharaxis_safety_dev'
  })

  try {
    const [validInsert] = await connection.execute(
      `INSERT INTO case_tenant_scope (org_id, client_id, source_type, source_ref)
       VALUES (?, ?, 'api', ?)`,
      [croOrgId, croClientId, `smoke-valid-${Date.now()}`]
    )
    await connection.execute(
      'DELETE FROM case_tenant_scope WHERE scope_id = ?',
      [validInsert.insertId]
    )

    let croWithoutClientRejected = false
    try {
      await connection.execute(
        `INSERT INTO case_tenant_scope (org_id, client_id, source_type, source_ref)
         VALUES (?, NULL, 'api', ?)`,
        [croOrgId, `smoke-invalid-cro-${Date.now()}`]
      )
    } catch {
      croWithoutClientRejected = true
    }

    if (!croWithoutClientRejected) {
      throw new Error('DB isolation failed: CRO case record accepted without client_id')
    }

    let directWithClientRejected = false
    try {
      await connection.execute(
        `INSERT INTO case_tenant_scope (org_id, client_id, source_type, source_ref)
         VALUES (?, ?, 'api', ?)`,
        [directOrgId, croClientId, `smoke-invalid-direct-${Date.now()}`]
      )
    } catch {
      directWithClientRejected = true
    }

    if (!directWithClientRejected) {
      throw new Error('DB isolation failed: pharma_direct record accepted with client_id')
    }
  } finally {
    await connection.end()
  }
}

async function run() {
  console.log('Safety Sprint1 smoke test started')
  const server = await ensureBackendServer({ baseUrl: BASE_URL })

  try {
    await resetSeedUserSessions()

    const health = await request('/api/health')
    console.log('health:', health.status)

    const login = await request('/api/auth/login', {
      method: 'POST',
      body: {
        orgSlug: SUPERADMIN_ORG,
        email: SUPERADMIN_EMAIL,
        password: SUPERADMIN_PASSWORD
      }
    })

    if (!login.token) {
      throw new Error('Login did not return token')
    }

    const token = login.token
    const profile = await request('/api/auth/me', { token })
    console.log('logged in as role:', profile.role)

    const orgs = await request('/api/orgs', { token })
    console.log('org count:', orgs.length)

    const nowTag = Date.now()
    const newOrg = await request('/api/orgs', {
      method: 'POST',
      token,
      body: {
        orgName: `Smoke Org ${nowTag}`,
        orgSlug: `smoke-org-${nowTag}`,
        orgType: 'CRO'
      }
    })
    console.log('created org:', newOrg.org_slug)

    const directOrg = await request('/api/orgs', {
      method: 'POST',
      token,
      body: {
        orgName: `Direct Org ${nowTag}`,
        orgSlug: `direct-org-${nowTag}`,
        orgType: 'pharma_direct'
      }
    })
    console.log('created direct org:', directOrg.org_slug)

    const initialSettings = await request(`/api/orgs/${newOrg.org_id}/settings`, { token })
    if (!initialSettings.settings || initialSettings.settings.caseIntakeMode !== 'manual') {
      throw new Error('Default org settings not returned as expected')
    }
    console.log('org settings fetched')

    const updatedSettings = await request(`/api/orgs/${newOrg.org_id}/settings`, {
      method: 'PATCH',
      token,
      body: {
        settings: {
          caseIntakeMode: 'email',
          defaultTriagePriority: 'high',
          requireStudyCode: true,
          dashboardAccent: 'emerald',
          timezone: 'Asia/Kolkata'
        }
      }
    })
    if (updatedSettings.settings.caseIntakeMode !== 'email') {
      throw new Error('Org settings update failed')
    }
    console.log('org settings updated')

    const newClient = await request('/api/clients', {
      method: 'POST',
      token,
      body: {
        parentOrgId: newOrg.org_id,
        clientName: `Smoke Client ${nowTag}`,
        clientCode: `SC-${String(nowTag).slice(-6)}`
      }
    })
    console.log('created client:', newClient.client_code)

    await requestExpectStatus('/api/users/invite', {
      method: 'POST',
      token,
      body: {
        orgId: newOrg.org_id,
        fullName: 'No Client Safety Scientist',
        email: `noclient-${nowTag}@example.com`,
        role: 'SAFETY_SCIENTIST'
      },
      expectedStatus: 400
    })
    console.log('cro invite without client correctly blocked')

    const invited = await request('/api/users/invite', {
      method: 'POST',
      token,
      body: {
        orgId: newOrg.org_id,
        clientId: newClient.client_id,
        fullName: 'Smoke Safety Scientist',
        email: `smoke-${nowTag}@example.com`,
        role: 'SAFETY_SCIENTIST'
      }
    })
    console.log('invitation created:', invited.invitation_id)

    await request('/api/auth/activate-invite', {
      method: 'POST',
      body: {
        token: invited.activationToken,
        password: 'InviteFinal@123'
      }
    })
    console.log('invite activation completed')

    const inviteUserLogin = await request('/api/auth/login', {
      method: 'POST',
      body: {
        orgSlug: newOrg.org_slug,
        email: `smoke-${nowTag}@example.com`,
        password: 'InviteFinal@123'
      }
    })
    if (!inviteUserLogin.token) {
      throw new Error('Invited user login failed after activation')
    }
    console.log('invite user login passed without extra reset')

    await requestExpectStatus('/api/products', {
      method: 'POST',
      token,
      body: {
        orgId: newOrg.org_id,
        productName: 'Invalid CRO Product',
        productCode: `ICP-${String(nowTag).slice(-5)}`
      },
      expectedStatus: 400
    })
    console.log('cro product without client correctly blocked')

    const createdProduct = await request('/api/products', {
      method: 'POST',
      token,
      body: {
        orgId: newOrg.org_id,
        clientId: newClient.client_id,
        productName: 'Smoke Product',
        productCode: `SP-${String(nowTag).slice(-5)}`
      }
    })
    console.log('product created:', createdProduct.product_code)

    const caseConfig = await request('/api/case-config', {
      method: 'PUT',
      token,
      body: {
        orgId: newOrg.org_id,
        casePrefix: 'SMK',
        sequencePadding: 5,
        isActive: true
      }
    })
    console.log('case config updated:', caseConfig.config.case_prefix)

    const generated = await request('/api/case-config/generate', {
      method: 'POST',
      token,
      body: { orgId: newOrg.org_id }
    })
    console.log('generated case id:', generated.caseId)

    const auditRows = await request(`/api/audit?orgId=${newOrg.org_id}&limit=20`, { token })
    console.log('audit entries in new org:', auditRows.length)

    await verifyCaseTenantIsolation({
      croOrgId: newOrg.org_id,
      croClientId: newClient.client_id,
      directOrgId: directOrg.org_id
    })
    console.log('db tenant isolation checks passed')

    console.log('Safety Sprint1 smoke test passed')
  } finally {
    await server.stop()
  }
}

run().catch((error) => {
  console.error('Safety Sprint1 smoke test failed:', error.message)
  process.exit(1)
})
