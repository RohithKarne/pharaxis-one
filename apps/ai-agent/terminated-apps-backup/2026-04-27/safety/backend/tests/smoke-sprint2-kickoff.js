/* eslint-disable no-console */
const mysql = require('mysql2/promise')
const { ensureBackendServer } = require('./helpers/serverHarness')

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5200'
const SUPERADMIN_ORG = process.env.SUPERADMIN_ORG || 'pharaxis-platform'
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'safety.superadmin@pharaxis.one'
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'SafetyAdmin@123'

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  })

  const text = await response.text()
  let payload = null
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

async function requestText(path, { method = 'GET', token } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Request ${method} ${path} failed with ${response.status}: ${text}`)
  }
  return text
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
           s.revoke_reason = 'sprint2_smoke_reset'
       WHERE o.org_slug = ?
         AND u.email = ?
         AND s.status = 'active'`,
      [SUPERADMIN_ORG, SUPERADMIN_EMAIL]
    )
  } finally {
    await connection.end()
  }
}

async function run() {
  console.log('Sprint2 full smoke started')
  const server = await ensureBackendServer({ baseUrl: BASE_URL })

  try {
    await resetSeedUserSessions()
    const nowTag = Date.now()

    const login = await request('/api/auth/login', {
      method: 'POST',
      body: {
        orgSlug: SUPERADMIN_ORG,
        email: SUPERADMIN_EMAIL,
        password: SUPERADMIN_PASSWORD
      }
    })
    const token = login.token
    assert(token, 'Login token missing')

    const org = await request('/api/orgs', {
      method: 'POST',
      token,
      body: {
        orgName: `S2 Org ${nowTag}`,
        orgSlug: `s2-org-${nowTag}`,
        orgType: 'CRO'
      }
    })
    const client = await request('/api/clients', {
      method: 'POST',
      token,
      body: {
        parentOrgId: org.org_id,
        clientName: `S2 Client ${nowTag}`,
        clientCode: `S2C-${String(nowTag).slice(-6)}`
      }
    })
    const product = await request('/api/products', {
      method: 'POST',
      token,
      body: {
        orgId: org.org_id,
        clientId: client.client_id,
        productName: 'S2 Smoke Product',
        productCode: `S2P-${String(nowTag).slice(-5)}`
      }
    })

    await request(`/api/cases/drafts/smoke-${nowTag}`, {
      method: 'PUT',
      token,
      body: {
        orgId: org.org_id,
        clientId: client.client_id,
        draftPayload: {
          reporterName: 'Sprint2 Reporter',
          reporterEmail: `s2-${nowTag}@example.com`,
          reporterCountry: 'IN',
          patientReference: `PT-${String(nowTag).slice(-6)}`,
          aeDescription: 'Headache with hospitalization after dose.',
          suspectProductId: product.product_id,
          seriousness: 'non_serious',
          causality: 'unknown',
          priority: 'medium',
          regulatoryClockDays: 15,
          timezone: 'Asia/Kolkata'
        }
      }
    })

    const drafts = await request(`/api/cases/drafts?orgId=${org.org_id}`, { token })
    assert(drafts.length > 0, 'Draft save/list validation failed')

    const precheckBefore = await request('/api/cases/precheck/duplicates', {
      method: 'POST',
      token,
      body: {
        orgId: org.org_id,
        clientId: client.client_id,
        patientReference: `PT-${String(nowTag).slice(-6)}`,
        patientSex: 'female',
        patientAgeYears: 41,
        patientWeightKg: 62,
        aeDescription: 'Headache with hospitalization after dose.',
        aeOnsetDate: new Date().toISOString().slice(0, 10),
        suspectProductId: product.product_id
      }
    })
    assert(typeof precheckBefore.duplicateCount === 'number', 'Duplicate precheck did not return duplicateCount')

    const createdCase = await request('/api/cases', {
      method: 'POST',
      token,
      body: {
        orgId: org.org_id,
        clientId: client.client_id,
        reporterName: 'Sprint2 Reporter',
        reporterEmail: `s2-${nowTag}@example.com`,
        reporterCountry: 'IN',
        reporterQualification: 'Physician',
        patientReference: `PT-${String(nowTag).slice(-6)}`,
        patientAgeYears: 41,
        patientSex: 'female',
        patientWeightKg: 62,
        aeDescription: 'Headache with hospitalization after dose.',
        aeOnsetDate: new Date().toISOString().slice(0, 10),
        suspectProductId: product.product_id,
        dose: '250 mg',
        route: 'oral',
        seriousness: 'non_serious',
        causality: 'related',
        priority: 'low',
        receivedAt: new Date().toISOString(),
        regulatoryClockDays: 15,
        timezone: 'Asia/Kolkata',
        attachments: [
          { name: 'source-document.pdf', url: `https://example.com/source-${nowTag}.pdf`, type: 'pdf', sizeKb: 120 }
        ],
        draftKey: `smoke-${nowTag}`
      }
    })
    assert(createdCase.case_pk_id, 'Case creation failed')
    console.log('case created:', createdCase.case_number)

    const precheckAfter = await request('/api/cases/precheck/duplicates', {
      method: 'POST',
      token,
      body: {
        orgId: org.org_id,
        clientId: client.client_id,
        patientReference: `PT-${String(nowTag).slice(-6)}`,
        patientSex: 'female',
        patientAgeYears: 41,
        patientWeightKg: 62,
        aeDescription: 'Headache with hospitalization after dose.',
        aeOnsetDate: new Date().toISOString().slice(0, 10),
        suspectProductId: product.product_id
      }
    })
    assert(precheckAfter.duplicateCount >= 1, 'Duplicate precheck did not identify the created case')
    assert((precheckAfter.probableDuplicates || []).length >= 1, 'Duplicate precheck did not flag probable duplicates with full criteria')

    await request(`/api/cases/${createdCase.case_pk_id}/intake`, {
      method: 'PATCH',
      token,
      body: {
        reporterName: 'Sprint2 Reporter Updated',
        aeDescription: 'Headache with hospitalization and dizziness after dose.'
      }
    })
    await request(`/api/cases/${createdCase.case_pk_id}/attachments`, {
      method: 'POST',
      token,
      body: {
        attachments: [{ name: 'followup-note.txt', url: `https://example.com/followup-${nowTag}.txt`, type: 'txt', sizeKb: 8 }]
      }
    })

    const reviewerInvite = await request('/api/users/invite', {
      method: 'POST',
      token,
      body: {
        orgId: org.org_id,
        clientId: client.client_id,
        fullName: 'Sprint2 Medical Reviewer',
        email: `reviewer-${nowTag}@example.com`,
        role: 'MEDICAL_REVIEWER'
      }
    })
    await request('/api/auth/activate-invite', {
      method: 'POST',
      body: {
        token: reviewerInvite.activationToken,
        password: 'ReviewerFinal@123'
      }
    })
    await request(`/api/cases/${createdCase.case_pk_id}/assign-reviewer`, {
      method: 'PATCH',
      token,
      body: { reviewerUserId: reviewerInvite.user_id }
    })

    const triaged = await request(`/api/cases/${createdCase.case_pk_id}/triage`, {
      method: 'PATCH',
      token,
      body: {
        seriousness: 'serious',
        causality: 'related',
        priority: 'high'
      }
    })
    assert(['triaged', 'in_review'].includes(triaged.status), 'Triage did not apply expected status')

    const moved = await request(`/api/cases/${createdCase.case_pk_id}/status`, {
      method: 'POST',
      token,
      body: {
        status: 'in_review',
        note: 'smoke_transition'
      }
    })
    assert(moved.status === 'in_review', 'Case status did not move to in_review')

    const excepted = await request(`/api/cases/${createdCase.case_pk_id}/exception`, {
      method: 'POST',
      token,
      body: { reason: 'Data inconsistency review required' }
    })
    assert(excepted.status === 'exception', 'Case was not moved to exception')

    const restored = await request(`/api/cases/${createdCase.case_pk_id}/status`, {
      method: 'POST',
      token,
      body: {
        status: 'in_review',
        note: 'exception_resolved'
      }
    })
    assert(restored.status === 'in_review', 'Case did not return from exception to in_review')

    const clock = await request(`/api/cases/${createdCase.case_pk_id}/regulatory-clock`, {
      method: 'PATCH',
      token,
      body: { clockDays: 10, timezone: 'Asia/Kolkata' }
    })
    assert(Number(clock.regulatory_clock_days) === 10, 'Regulatory clock day update failed')

    await request(`/api/cases/${createdCase.case_pk_id}/regulatory-clock/action`, {
      method: 'POST',
      token,
      body: { action: 'pause' }
    })
    await sleep(1100)
    const resumed = await request(`/api/cases/${createdCase.case_pk_id}/regulatory-clock/action`, {
      method: 'POST',
      token,
      body: { action: 'resume' }
    })
    assert(resumed.regulatory_clock_status === 'running', 'Regulatory clock did not resume')

    await request('/api/cases/regulatory/alerts/run', {
      method: 'POST',
      token,
      body: { orgId: org.org_id, clientId: client.client_id }
    })
    const alerts = await request(`/api/cases/regulatory/alerts?orgId=${org.org_id}&clientId=${client.client_id}&limit=20`, { token })
    assert(Array.isArray(alerts), 'Alerts response is invalid')

    const filterPriority = restored.priority || moved.priority || triaged.priority || 'high'
    await request('/api/cases/dashboard/filters', {
      method: 'POST',
      token,
      body: {
        orgId: org.org_id,
        filterName: `high-open-${nowTag}`,
        filterPayload: {
          status: 'in_review',
          priority: filterPriority
        }
      }
    })
    const filters = await request(`/api/cases/dashboard/filters?orgId=${org.org_id}`, { token })
    assert(filters.length > 0, 'Dashboard filter save/list failed')

    const filteredCases = await request(`/api/cases?orgId=${org.org_id}&savedFilterId=${filters[0].filter_id}`, { token })
    assert(filteredCases.some((row) => row.case_pk_id === createdCase.case_pk_id), 'Saved filter query did not return created case')

    const narrative = await request(`/api/cases/${createdCase.case_pk_id}/narrative/generate`, {
      method: 'POST',
      token
    })
    assert(narrative.narrative_id, 'Narrative generation failed')

    await request(`/api/cases/${createdCase.case_pk_id}/narrative/${narrative.narrative_id}`, {
      method: 'PATCH',
      token,
      body: { narrativeText: `${narrative.narrative_text} Follow-up narrative edit.` }
    })
    await request(`/api/cases/${createdCase.case_pk_id}/narrative/${narrative.narrative_id}`, {
      method: 'PATCH',
      token,
      body: { approve: true }
    })
    const narratives = await request(`/api/cases/${createdCase.case_pk_id}/narrative`, { token })
    assert(narratives.length >= 1, 'Narrative list is empty')

    const listedness = await request(`/api/cases/${createdCase.case_pk_id}/listedness`, {
      method: 'POST',
      token,
      body: {
        sourceReference: 'SmPC 8.4 / IB v3',
        listedness: 'listed',
        expectedness: 'expected',
        rationale: 'Scientist-reviewed against reference safety information.'
      }
    })
    assert(listedness.assessment_id, 'Listedness assessment failed')
    const listednessRows = await request(`/api/cases/${createdCase.case_pk_id}/listedness`, { token })
    assert(listednessRows.length >= 1, 'Listedness fetch returned no rows')

    const summary = await request(`/api/cases/dashboard/summary?orgId=${org.org_id}&clientId=${client.client_id}`, { token })
    assert(summary.totalCases >= 1, 'Dashboard summary totalCases invalid')

    const caseAuditRows = await request(`/api/cases/${createdCase.case_pk_id}/audit`, { token })
    const workflowRows = await request(`/api/cases/${createdCase.case_pk_id}/workflow`, { token })
    const duplicateRows = await request(`/api/cases/${createdCase.case_pk_id}/duplicates`, { token })
    const slaRows = await request(`/api/cases/${createdCase.case_pk_id}/sla-checkpoints`, { token })
    assert(Array.isArray(caseAuditRows) && caseAuditRows.length >= 1, 'Case audit unavailable')
    assert(Array.isArray(workflowRows) && workflowRows.length >= 1, 'Workflow history unavailable')
    assert(Array.isArray(duplicateRows), 'Duplicate endpoint invalid')
    assert(Array.isArray(slaRows.checkpoints), 'SLA checkpoints invalid')

    const orgAuditRows = await request(`/api/cases/audit?orgId=${org.org_id}&clientId=${client.client_id}&limit=50`, { token })
    assert(orgAuditRows.length >= 1, 'Org case audit endpoint returned no rows')

    const exportCsv = await requestText(`/api/cases/audit/export?orgId=${org.org_id}&clientId=${client.client_id}`, { token })
    assert(exportCsv.includes('audit_id,case_number,action_type'), 'Case audit CSV export header missing')

    await request(`/api/cases/drafts/smoke-${nowTag}?orgId=${org.org_id}`, {
      method: 'DELETE',
      token
    })
    const finalDrafts = await request(`/api/cases/drafts?orgId=${org.org_id}`, { token })
    assert(!finalDrafts.find((row) => row.draft_key === `smoke-${nowTag}`), 'Draft delete validation failed')

    console.log('Sprint2 full smoke passed')
  } finally {
    await server.stop()
  }
}

run().catch((error) => {
  console.error('Sprint2 full smoke failed:', error.message)
  process.exit(1)
})
