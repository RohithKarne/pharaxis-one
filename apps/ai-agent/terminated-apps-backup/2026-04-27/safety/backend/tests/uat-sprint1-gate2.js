/* eslint-disable no-console */
const mysql = require('mysql2/promise')

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5200'
const SUPERADMIN_ORG = process.env.SUPERADMIN_ORG || 'pharaxis-platform'
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'safety.superadmin@pharaxis.one'
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'SafetyAdmin@123'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

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
    await connection.execute(
      `UPDATE user_sessions s
       INNER JOIN users u ON u.user_id = s.user_id
       INNER JOIN organisations o ON o.org_id = u.org_id
       SET s.status = 'revoked',
           s.revoked_at = NOW(),
           s.revoke_reason = 'uat_reset'
       WHERE o.org_slug = ?
         AND u.email = ?
         AND s.status = 'active'`,
      [SUPERADMIN_ORG, SUPERADMIN_EMAIL]
    )
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
    const [okInsert] = await connection.execute(
      `INSERT INTO case_tenant_scope (org_id, client_id, source_type, source_ref)
       VALUES (?, ?, 'api', ?)`,
      [croOrgId, croClientId, `uat-valid-${Date.now()}`]
    )
    await connection.execute('DELETE FROM case_tenant_scope WHERE scope_id = ?', [okInsert.insertId])

    let croViolationBlocked = false
    try {
      await connection.execute(
        `INSERT INTO case_tenant_scope (org_id, client_id, source_type, source_ref)
         VALUES (?, NULL, 'api', ?)`,
        [croOrgId, `uat-invalid-cro-${Date.now()}`]
      )
    } catch {
      croViolationBlocked = true
    }
    assert(croViolationBlocked, 'DB trigger failed: CRO row without client_id was accepted')

    let directViolationBlocked = false
    try {
      await connection.execute(
        `INSERT INTO case_tenant_scope (org_id, client_id, source_type, source_ref)
         VALUES (?, ?, 'api', ?)`,
        [directOrgId, croClientId, `uat-invalid-direct-${Date.now()}`]
      )
    } catch {
      directViolationBlocked = true
    }
    assert(directViolationBlocked, 'DB trigger failed: pharma_direct row with client_id was accepted')
  } finally {
    await connection.end()
  }
}

async function run() {
  console.log('Sprint1 Gate2 UAT started')
  await resetSeedUserSessions()

  const health = await request('/api/health')
  assert(health.status === 'ok', 'Health check failed')
  console.log('1) health check passed')

  const superLogin = await request('/api/auth/login', {
    method: 'POST',
    body: {
      orgSlug: SUPERADMIN_ORG,
      email: SUPERADMIN_EMAIL,
      password: SUPERADMIN_PASSWORD
    }
  })
  assert(Boolean(superLogin.token), 'Super Admin login token missing')
  const superToken = superLogin.token
  console.log('2) super admin login passed')

  const me = await request('/api/auth/me', { token: superToken })
  assert(me.role === 'SUPER_ADMIN', 'Super Admin role check failed')
  assert(me.modules.includes('System Config'), 'Super Admin should have System Config module')
  console.log('3) RBAC profile checks passed')

  const nowTag = Date.now()
  const croOrg = await request('/api/orgs', {
    method: 'POST',
    token: superToken,
    body: {
      orgName: `UAT CRO Org ${nowTag}`,
      orgSlug: `uat-cro-org-${nowTag}`,
      orgType: 'CRO'
    }
  })
  const directOrg = await request('/api/orgs', {
    method: 'POST',
    token: superToken,
    body: {
      orgName: `UAT Direct Org ${nowTag}`,
      orgSlug: `uat-direct-org-${nowTag}`,
      orgType: 'pharma_direct'
    }
  })
  console.log('4) org creation passed')

  const settingsBefore = await request(`/api/orgs/${croOrg.org_id}/settings`, { token: superToken })
  assert(settingsBefore.settings.caseIntakeMode === 'manual', 'Default org settings missing')
  const settingsAfter = await request(`/api/orgs/${croOrg.org_id}/settings`, {
    method: 'PATCH',
    token: superToken,
    body: {
      settings: {
        caseIntakeMode: 'api',
        defaultTriagePriority: 'critical',
        timezone: 'Asia/Kolkata',
        dashboardAccent: 'emerald',
        requireStudyCode: true
      }
    }
  })
  assert(settingsAfter.settings.caseIntakeMode === 'api', 'Org settings update failed')
  console.log('5) org settings CRUD passed')

  const client = await request('/api/clients', {
    method: 'POST',
    token: superToken,
    body: {
      parentOrgId: croOrg.org_id,
      clientName: `UAT Client ${nowTag}`,
      clientCode: `UC-${String(nowTag).slice(-6)}`
    }
  })
  console.log('6) client hierarchy creation passed')

  const invitedCroAdmin = await request('/api/users/invite', {
    method: 'POST',
    token: superToken,
    body: {
      orgId: croOrg.org_id,
      fullName: 'UAT CRO Admin',
      email: `uat-croadmin-${nowTag}@example.com`,
      role: 'CRO_ADMIN'
    }
  })
  assert(Boolean(invitedCroAdmin.user_id), 'CRO Admin invite failed')

  await request('/api/auth/activate-invite', {
    method: 'POST',
    body: {
      token: invitedCroAdmin.activationToken,
      password: 'UatCroAdmin@123'
    }
  })

  await requestExpectStatus('/api/users/invite', {
    method: 'POST',
    token: superToken,
    body: {
      orgId: croOrg.org_id,
      fullName: 'UAT Scientist No Client',
      email: `uat-noclient-${nowTag}@example.com`,
      role: 'SAFETY_SCIENTIST'
    },
    expectedStatus: 400
  })
  console.log('7) user invite validation passed')

  const invitedScientist = await request('/api/users/invite', {
    method: 'POST',
    token: superToken,
    body: {
      orgId: croOrg.org_id,
      clientId: client.client_id,
      fullName: 'UAT Scientist',
      email: `uat-scientist-${nowTag}@example.com`,
      role: 'SAFETY_SCIENTIST'
    }
  })
  await request('/api/auth/activate-invite', {
    method: 'POST',
    body: {
      token: invitedScientist.activationToken,
      password: 'UatScientist@123'
    }
  })
  const scientistLogin = await request('/api/auth/login', {
    method: 'POST',
    body: {
      orgSlug: croOrg.org_slug,
      email: `uat-scientist-${nowTag}@example.com`,
      password: 'UatScientist@123'
    }
  })
  assert(Boolean(scientistLogin.token), 'Scientist login failed after activation')
  console.log('8) invite activation final-password flow passed')

  await requestExpectStatus('/api/orgs', {
    method: 'GET',
    token: scientistLogin.token,
    expectedStatus: 403
  })
  console.log('9) scientist RBAC access denial passed')

  await requestExpectStatus('/api/products', {
    method: 'POST',
    token: superToken,
    body: {
      orgId: croOrg.org_id,
      productName: 'UAT Invalid CRO Product',
      productCode: `UIC-${String(nowTag).slice(-5)}`
    },
    expectedStatus: 400
  })

  const croProduct = await request('/api/products', {
    method: 'POST',
    token: superToken,
    body: {
      orgId: croOrg.org_id,
      clientId: client.client_id,
      productName: 'UAT CRO Product',
      productCode: `UCP-${String(nowTag).slice(-5)}`
    }
  })
  assert(Boolean(croProduct.product_id), 'CRO product create failed')

  await requestExpectStatus('/api/products', {
    method: 'POST',
    token: superToken,
    body: {
      orgId: directOrg.org_id,
      clientId: client.client_id,
      productName: 'UAT Invalid Direct Product',
      productCode: `UDP-${String(nowTag).slice(-5)}`
    },
    expectedStatus: 400
  })

  const directProduct = await request('/api/products', {
    method: 'POST',
    token: superToken,
    body: {
      orgId: directOrg.org_id,
      productName: 'UAT Direct Product',
      productCode: `UDP-${String(nowTag).slice(-4)}`
    }
  })
  assert(Boolean(directProduct.product_id), 'Direct product create failed')
  console.log('10) product scope isolation checks passed')

  const caseConfig = await request('/api/case-config', {
    method: 'PUT',
    token: superToken,
    body: {
      orgId: croOrg.org_id,
      casePrefix: 'UAT',
      sequencePadding: 5,
      isActive: true
    }
  })
  assert(caseConfig.config.case_prefix === 'UAT', 'Case config update failed')

  const generatedCase = await request('/api/case-config/generate', {
    method: 'POST',
    token: superToken,
    body: { orgId: croOrg.org_id }
  })
  assert(generatedCase.caseId.startsWith('UAT-'), 'Case id generation failed')
  console.log('11) case-id configuration passed')

  const systemConfigBefore = await request(`/api/system-config?orgId=${croOrg.org_id}`, { token: superToken })
  assert(Boolean(systemConfigBefore.session_timeout_minutes), 'System config fetch failed')
  const systemConfigAfter = await request('/api/system-config', {
    method: 'PUT',
    token: superToken,
    body: {
      orgId: croOrg.org_id,
      config: {
        session_timeout_minutes: '300',
        max_concurrent_sessions: '3',
        audit_retention_days: '3650'
      }
    }
  })
  assert(systemConfigAfter.config.session_timeout_minutes === '300', 'System config update failed')

  const testEmail = await request('/api/system-config/test-email', {
    method: 'POST',
    token: superToken,
    body: {
      orgId: croOrg.org_id,
      toEmail: `uat-mail-${nowTag}@example.com`
    }
  })
  assert(testEmail.message === 'Test email sent', 'Test email endpoint failed')
  console.log('12) system configuration passed')

  const activeSessions = await request(`/api/sessions/active?orgId=${croOrg.org_id}`, { token: superToken })
  const scientistSession = activeSessions.find((row) => Number(row.user_id) === Number(invitedScientist.user_id))
  assert(Boolean(scientistSession), 'Scientist active session not found')

  await request(`/api/sessions/${scientistSession.session_id}/revoke`, {
    method: 'POST',
    token: superToken,
    body: { reason: 'uat_revoke' }
  })

  await requestExpectStatus('/api/auth/me', {
    method: 'GET',
    token: scientistLogin.token,
    expectedStatus: 401
  })
  console.log('13) session revoke behavior passed')

  await request(`/api/users/${invitedScientist.user_id}/status`, {
    method: 'PATCH',
    token: superToken,
    body: { status: 'inactive' }
  })
  await requestExpectStatus('/api/auth/login', {
    method: 'POST',
    body: {
      orgSlug: croOrg.org_slug,
      email: `uat-scientist-${nowTag}@example.com`,
      password: 'UatScientist@123'
    },
    expectedStatus: 403
  })
  console.log('14) user deactivate login block passed')

  const auditRows = await request(`/api/audit?orgId=${croOrg.org_id}&limit=200`, { token: superToken })
  assert(auditRows.some((row) => row.action_type === 'organisation_settings_updated'), 'Audit missing organisation_settings_updated')
  assert(auditRows.some((row) => row.action_type === 'session_revoked'), 'Audit missing session_revoked')
  assert(auditRows.some((row) => row.action_type === 'system_config_updated'), 'Audit missing system_config_updated')
  console.log('15) audit trail checks passed')

  await verifyCaseTenantIsolation({
    croOrgId: croOrg.org_id,
    croClientId: client.client_id,
    directOrgId: directOrg.org_id
  })
  console.log('16) DB isolation trigger checks passed')

  console.log('Sprint1 Gate2 UAT passed')
}

run().catch((error) => {
  console.error('Sprint1 Gate2 UAT failed:', error.message)
  process.exit(1)
})
