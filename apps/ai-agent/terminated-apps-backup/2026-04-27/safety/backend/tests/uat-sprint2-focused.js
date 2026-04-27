/* eslint-disable no-console */
const mysql = require('mysql2/promise')
const { ensureBackendServer } = require('./helpers/serverHarness')

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5200'
const SUPERADMIN_ORG = process.env.SUPERADMIN_ORG || 'pharaxis-platform'
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || 'safety.superadmin@pharaxis.one'
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD || 'SafetyAdmin@123'

const checklist = []

function assert(condition, message) {
  if (!condition) throw new Error(message)
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

  const response = await fetch(`${BASE_URL}${path}`, { method, headers })
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
           s.revoke_reason = 'sprint2_uat_reset'
       WHERE o.org_slug = ?
         AND u.email = ?
         AND s.status = 'active'`,
      [SUPERADMIN_ORG, SUPERADMIN_EMAIL]
    )
  } finally {
    await connection.end()
  }
}

async function runStep(id, area, browserStep, fn) {
  const started = Date.now()
  try {
    const evidence = await fn()
    checklist.push({
      id,
      area,
      browserStep,
      status: 'Passed',
      evidence: evidence || '-',
      durationMs: Date.now() - started
    })
    console.log(`${id}) PASS - ${browserStep}`)
  } catch (error) {
    checklist.push({
      id,
      area,
      browserStep,
      status: 'Failed',
      evidence: error.message,
      durationMs: Date.now() - started
    })
    throw error
  }
}

async function run() {
  console.log('Sprint2 focused UAT started')
  const server = await ensureBackendServer({ baseUrl: BASE_URL })

  try {
    await resetSeedUserSessions()
    const nowTag = Date.now()
    const state = {}

    await runStep('UAT-01', 'Access', 'Login as Super Admin from Login screen', async () => {
      const login = await request('/api/auth/login', {
        method: 'POST',
        body: {
          orgSlug: SUPERADMIN_ORG,
          email: SUPERADMIN_EMAIL,
          password: SUPERADMIN_PASSWORD
        }
      })
      assert(Boolean(login.token), 'Super Admin login token missing')
      state.token = login.token
      return `token issued for ${SUPERADMIN_EMAIL}`
    })

    await runStep('UAT-02', 'Setup', 'Create CRO org, client, and product from Admin screens', async () => {
      const org = await request('/api/orgs', {
        method: 'POST',
        token: state.token,
        body: {
          orgName: `S2 UAT Org ${nowTag}`,
          orgSlug: `s2-uat-org-${nowTag}`,
          orgType: 'CRO'
        }
      })
      const client = await request('/api/clients', {
        method: 'POST',
        token: state.token,
        body: {
          parentOrgId: org.org_id,
          clientName: `S2 UAT Client ${nowTag}`,
          clientCode: `S2U-${String(nowTag).slice(-6)}`
        }
      })
      const product = await request('/api/products', {
        method: 'POST',
        token: state.token,
        body: {
          orgId: org.org_id,
          clientId: client.client_id,
          productName: 'S2 UAT Product',
          productCode: `S2UP-${String(nowTag).slice(-5)}`
        }
      })
      state.org = org
      state.client = client
      state.product = product
      return `org=${org.org_slug}, client=${client.client_code}, product=${product.product_code}`
    })

    await runStep('UAT-03', 'Case Intake', 'Save intake draft from Case Management intake card', async () => {
      const draftKey = `uat-draft-${nowTag}`
      state.draftKey = draftKey
      await request(`/api/cases/drafts/${encodeURIComponent(draftKey)}`, {
        method: 'PUT',
        token: state.token,
        body: {
          orgId: state.org.org_id,
          clientId: state.client.client_id,
          draftPayload: {
            reporterName: 'UAT Reporter',
            reporterEmail: `uat-reporter-${nowTag}@example.com`,
            reporterCountry: 'IN',
            patientReference: `UAT-PT-${String(nowTag).slice(-6)}`,
            aeDescription: 'Headache with hospitalization and dizziness',
            suspectProductId: state.product.product_id,
            seriousness: 'non_serious',
            causality: 'unknown',
            priority: 'medium',
            regulatoryClockDays: 15,
            timezone: 'Asia/Kolkata'
          }
        }
      })
      const drafts = await request(`/api/cases/drafts?orgId=${state.org.org_id}`, { token: state.token })
      assert(drafts.some((row) => row.draft_key === draftKey), 'Draft not listed after save')
      return `draftKey=${draftKey}`
    })

    await runStep('UAT-04', 'Case Intake', 'Run duplicate precheck from intake form', async () => {
      const precheck = await request('/api/cases/precheck/duplicates', {
        method: 'POST',
        token: state.token,
        body: {
          orgId: state.org.org_id,
          clientId: state.client.client_id,
          patientReference: `UAT-PT-${String(nowTag).slice(-6)}`,
          patientSex: 'female',
          patientAgeYears: 37,
          patientWeightKg: 58,
          aeDescription: 'Headache with hospitalization and dizziness',
          aeOnsetDate: new Date().toISOString().slice(0, 10),
          suspectProductId: state.product.product_id
        }
      })
      assert(typeof precheck.duplicateCount === 'number', 'duplicateCount missing in precheck')
      return `duplicateCount=${precheck.duplicateCount}`
    })

    await runStep('UAT-05', 'Case Intake', 'Submit new case from intake form with attachments', async () => {
      const createdCase = await request('/api/cases', {
        method: 'POST',
        token: state.token,
        body: {
          orgId: state.org.org_id,
          clientId: state.client.client_id,
          reporterName: 'UAT Reporter',
          reporterEmail: `uat-reporter-${nowTag}@example.com`,
          reporterCountry: 'IN',
          reporterQualification: 'Physician',
          patientReference: `UAT-PT-${String(nowTag).slice(-6)}`,
          patientAgeYears: 37,
          patientSex: 'female',
          patientWeightKg: 58,
          aeDescription: 'Headache with hospitalization and dizziness',
          aeOnsetDate: new Date().toISOString().slice(0, 10),
          suspectProductId: state.product.product_id,
          dose: '250 mg',
          route: 'oral',
          seriousness: 'non_serious',
          causality: 'related',
          priority: 'low',
          receivedAt: new Date().toISOString(),
          regulatoryClockDays: 15,
          timezone: 'Asia/Kolkata',
          attachments: [
            { name: 'source.pdf', url: `https://example.com/source-${nowTag}.pdf`, type: 'pdf', sizeKb: 90 }
          ],
          draftKey: state.draftKey
        }
      })
      state.casePkId = createdCase.case_pk_id
      state.caseNumber = createdCase.case_number
      assert(Boolean(state.casePkId), 'Case id missing after create')
      return `case=${state.caseNumber}`
    })

    await runStep('UAT-06', 'Cases Grid', 'Update intake and add follow-up attachment from case action row', async () => {
      await request(`/api/cases/${state.casePkId}/intake`, {
        method: 'PATCH',
        token: state.token,
        body: {
          reporterName: 'UAT Reporter Updated',
          aeDescription: 'Headache with hospitalization, dizziness and fatigue'
        }
      })
      await request(`/api/cases/${state.casePkId}/attachments`, {
        method: 'POST',
        token: state.token,
        body: {
          attachments: [{ name: 'followup.txt', url: `https://example.com/followup-${nowTag}.txt`, type: 'txt', sizeKb: 6 }]
        }
      })
      const current = await request(`/api/cases/${state.casePkId}`, { token: state.token })
      assert((current.attachments_json || []).length >= 2, 'Attachment add did not reflect on case')
      return `attachments=${(current.attachments_json || []).length}`
    })

    await runStep('UAT-07', 'Cases Grid', 'Assign Medical Reviewer from reviewer dropdown action', async () => {
      const invited = await request('/api/users/invite', {
        method: 'POST',
        token: state.token,
        body: {
          orgId: state.org.org_id,
          clientId: state.client.client_id,
          fullName: 'Sprint2 UAT Medical Reviewer',
          email: `s2-uat-reviewer-${nowTag}@example.com`,
          role: 'MEDICAL_REVIEWER'
        }
      })
      await request('/api/auth/activate-invite', {
        method: 'POST',
        body: {
          token: invited.activationToken,
          password: 'UatReviewer@123'
        }
      })
      await request(`/api/cases/${state.casePkId}/assign-reviewer`, {
        method: 'PATCH',
        token: state.token,
        body: { reviewerUserId: invited.user_id }
      })
      const current = await request(`/api/cases/${state.casePkId}`, { token: state.token })
      assert(Number(current.assigned_medical_reviewer_id) === Number(invited.user_id), 'Reviewer assignment not applied')
      return `reviewerUserId=${invited.user_id}`
    })

    await runStep('UAT-08', 'Cases Grid', 'Run triage then status transition and exception flow', async () => {
      const triaged = await request(`/api/cases/${state.casePkId}/triage`, {
        method: 'PATCH',
        token: state.token,
        body: {
          seriousness: 'serious',
          causality: 'related',
          priority: 'high'
        }
      })
      assert(['triaged', 'in_review'].includes(triaged.status), 'Triage status update missing')

      const inReview = await request(`/api/cases/${state.casePkId}/status`, {
        method: 'POST',
        token: state.token,
        body: {
          status: 'in_review',
          note: 'uat_progress_to_review'
        }
      })
      assert(inReview.status === 'in_review', 'Status did not move to in_review')

      const exception = await request(`/api/cases/${state.casePkId}/exception`, {
        method: 'POST',
        token: state.token,
        body: { reason: 'UAT exception queue validation' }
      })
      assert(exception.status === 'exception', 'Exception status not set')

      const restored = await request(`/api/cases/${state.casePkId}/status`, {
        method: 'POST',
        token: state.token,
        body: {
          status: 'in_review',
          note: 'uat_exception_resolved'
        }
      })
      assert(restored.status === 'in_review', 'Case not restored from exception')
      return `status=${restored.status}`
    })

    await runStep('UAT-09', 'Regulatory', 'Use regulatory clock edit and pause/resume actions', async () => {
      await request(`/api/cases/${state.casePkId}/regulatory-clock`, {
        method: 'PATCH',
        token: state.token,
        body: { clockDays: 10, timezone: 'Asia/Kolkata' }
      })
      await request(`/api/cases/${state.casePkId}/regulatory-clock/action`, {
        method: 'POST',
        token: state.token,
        body: { action: 'pause' }
      })
      await sleep(1100)
      const resumed = await request(`/api/cases/${state.casePkId}/regulatory-clock/action`, {
        method: 'POST',
        token: state.token,
        body: { action: 'resume' }
      })
      assert(resumed.regulatory_clock_status === 'running', 'Clock did not resume to running')
      assert(Number(resumed.regulatory_total_paused_minutes) >= 0, 'Paused minutes tracking invalid')
      return `clockStatus=${resumed.regulatory_clock_status}`
    })

    await runStep('UAT-10', 'Dashboard', 'Load dashboard summary and run regulatory alert evaluation', async () => {
      const summary = await request(`/api/cases/dashboard/summary?orgId=${state.org.org_id}&clientId=${state.client.client_id}`, { token: state.token })
      assert(summary.totalCases >= 1, 'Dashboard summary totalCases is invalid')

      await request('/api/cases/regulatory/alerts/run', {
        method: 'POST',
        token: state.token,
        body: {
          orgId: state.org.org_id,
          clientId: state.client.client_id
        }
      })
      const alerts = await request(`/api/cases/regulatory/alerts?orgId=${state.org.org_id}&clientId=${state.client.client_id}&limit=20`, { token: state.token })
      assert(Array.isArray(alerts), 'Alerts list did not return array')
      return `totalCases=${summary.totalCases}, alerts=${alerts.length}`
    })

    await runStep('UAT-11', 'Dashboard Filters', 'Save and apply a dashboard filter from filter controls', async () => {
      await request('/api/cases/dashboard/filters', {
        method: 'POST',
        token: state.token,
        body: {
          orgId: state.org.org_id,
          filterName: `uat-filter-${nowTag}`,
          filterPayload: {
            status: 'in_review'
          }
        }
      })

      const filters = await request(`/api/cases/dashboard/filters?orgId=${state.org.org_id}`, { token: state.token })
      const saved = filters.find((row) => row.filter_name === `uat-filter-${nowTag}`)
      assert(Boolean(saved), 'Saved filter not found')

      const rows = await request(`/api/cases?orgId=${state.org.org_id}&savedFilterId=${saved.filter_id}`, { token: state.token })
      assert(rows.some((row) => Number(row.case_pk_id) === Number(state.casePkId)), 'Saved filter did not return target case')
      return `savedFilterId=${saved.filter_id}, rows=${rows.length}`
    })

    await runStep('UAT-12', 'Deep View', 'Open selected case deep view and validate workflow/duplicates/audit/SLA panels', async () => {
      const workflow = await request(`/api/cases/${state.casePkId}/workflow`, { token: state.token })
      const duplicates = await request(`/api/cases/${state.casePkId}/duplicates`, { token: state.token })
      const auditRows = await request(`/api/cases/${state.casePkId}/audit`, { token: state.token })
      const sla = await request(`/api/cases/${state.casePkId}/sla-checkpoints`, { token: state.token })
      assert(workflow.length >= 1, 'Workflow panel data missing')
      assert(Array.isArray(duplicates), 'Duplicate panel response invalid')
      assert(auditRows.length >= 1, 'Case audit panel data missing')
      assert(Array.isArray(sla.checkpoints) && sla.checkpoints.length >= 3, 'SLA checkpoints missing')
      return `workflow=${workflow.length}, audit=${auditRows.length}`
    })

    await runStep('UAT-13', 'Narrative', 'Generate, edit, and approve case narrative in deep view', async () => {
      const generated = await request(`/api/cases/${state.casePkId}/narrative/generate`, {
        method: 'POST',
        token: state.token
      })
      assert(Boolean(generated.narrative_id), 'Narrative generation failed')

      await request(`/api/cases/${state.casePkId}/narrative/${generated.narrative_id}`, {
        method: 'PATCH',
        token: state.token,
        body: { narrativeText: `${generated.narrative_text} UAT edit.` }
      })
      await request(`/api/cases/${state.casePkId}/narrative/${generated.narrative_id}`, {
        method: 'PATCH',
        token: state.token,
        body: { approve: true }
      })

      const narratives = await request(`/api/cases/${state.casePkId}/narrative`, { token: state.token })
      assert(narratives.length >= 1, 'Narrative list did not return generated entry')
      return `narratives=${narratives.length}`
    })

    await runStep('UAT-14', 'Listedness', 'Submit listedness/expectedness assessment in deep view', async () => {
      const inserted = await request(`/api/cases/${state.casePkId}/listedness`, {
        method: 'POST',
        token: state.token,
        body: {
          sourceReference: 'SmPC Sec 4.8 - UAT',
          listedness: 'listed',
          expectedness: 'expected',
          rationale: 'Assessed by safety scientist against UAT reference.'
        }
      })
      assert(Boolean(inserted.assessment_id), 'Listedness insert failed')
      const rows = await request(`/api/cases/${state.casePkId}/listedness`, { token: state.token })
      assert(rows.length >= 1, 'Listedness list missing row')
      return `assessmentId=${inserted.assessment_id}`
    })

    await runStep('UAT-15', 'Case Audit', 'View org-wide case audit feed and export CSV', async () => {
      const auditRows = await request(`/api/cases/audit?orgId=${state.org.org_id}&clientId=${state.client.client_id}&limit=200`, { token: state.token })
      assert(auditRows.length >= 1, 'Org-level case audit returned no rows')
      const csv = await requestText(`/api/cases/audit/export?orgId=${state.org.org_id}&clientId=${state.client.client_id}`, { token: state.token })
      assert(csv.includes('audit_id,case_number,action_type'), 'Case audit CSV header missing')
      return `auditRows=${auditRows.length}`
    })

    await runStep('UAT-16', 'Cleanup', 'Delete intake draft from draft list action', async () => {
      await request(`/api/cases/drafts/${encodeURIComponent(state.draftKey)}?orgId=${state.org.org_id}`, {
        method: 'DELETE',
        token: state.token
      })
      const drafts = await request(`/api/cases/drafts?orgId=${state.org.org_id}`, { token: state.token })
      assert(!drafts.some((row) => row.draft_key === state.draftKey), 'Draft was not deleted')
      return `draftDeleted=${state.draftKey}`
    })

    console.log('Sprint2 focused UAT passed')
    console.log('--- Sprint2 Focused UAT Checklist ---')
    for (const row of checklist) {
      console.log(`${row.id} | ${row.status} | ${row.browserStep} | ${row.evidence}`)
    }
  } finally {
    await server.stop()
  }
}

run().catch((error) => {
  console.error('Sprint2 focused UAT failed:', error.message)
  process.exit(1)
})
