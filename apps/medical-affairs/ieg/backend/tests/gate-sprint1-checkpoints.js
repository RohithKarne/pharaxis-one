/* eslint-disable no-console */
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5300'

async function request(path, { method = 'GET', token, body, isForm = false, expectStatus } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (!isForm) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined
  })

  const contentType = response.headers.get('content-type') || ''
  const raw = await response.text()

  if (expectStatus) {
    if (response.status !== expectStatus) {
      throw new Error(`${method} ${path} expected ${expectStatus}, got ${response.status}. Body: ${raw}`)
    }
    return { response, raw, data: parseBody(raw, contentType) }
  }

  if (!response.ok) {
    throw new Error(`${method} ${path} failed ${response.status}: ${raw}`)
  }

  return { response, raw, data: parseBody(raw, contentType) }
}

function parseBody(raw, contentType) {
  if (!raw) return {}
  if (contentType.includes('application/json')) {
    return JSON.parse(raw)
  }
  return raw
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function createInternalUser(superToken, { email, fullName, password, role, modules }) {
  const created = await request('/api/users', {
    method: 'POST',
    token: superToken,
    body: { email, fullName, password, role, modules }
  })
  return created.data.user
}

async function loginInternal(email, password) {
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password }
  })
  return login.data
}

async function loginExternal(email, password) {
  const login = await request('/api/auth/external/login', {
    method: 'POST',
    body: { email, password }
  })
  return login.data
}

async function main() {
  console.log('[gate] health check')
  await request('/api/health')

  console.log('[gate] superadmin login')
  const superLogin = await loginInternal(
    process.env.SMOKE_SUPERADMIN_EMAIL || 'superadmin.ieg@pharaxis.one',
    process.env.SMOKE_SUPERADMIN_PASSWORD || 'Admin@123'
  )
  const superToken = superLogin.token

  const stamp = Date.now()

  console.log('[gate] creating internal users for module/role checks')
  const grantsOnly = await createInternalUser(superToken, {
    email: `grants-only-${stamp}@pharaxis.one`,
    fullName: 'Grants Only User',
    password: 'Dev@12345',
    role: 'intake_coordinator',
    modules: ['grants']
  })

  const multiModule = await createInternalUser(superToken, {
    email: `multi-${stamp}@pharaxis.one`,
    fullName: 'Multi Module User',
    password: 'Dev@12345',
    role: 'admin',
    modules: ['grants', 'iit']
  })

  const medReviewer = await createInternalUser(superToken, {
    email: `med-reviewer-${stamp}@pharaxis.one`,
    fullName: 'Medical Reviewer',
    password: 'Dev@12345',
    role: 'medical_reviewer',
    modules: ['grants', 'iit']
  })

  const complianceReviewer = await createInternalUser(superToken, {
    email: `comp-reviewer-${stamp}@pharaxis.one`,
    fullName: 'Compliance Reviewer',
    password: 'Dev@12345',
    role: 'compliance_reviewer',
    modules: ['grants', 'iit']
  })

  const committeeMember = await createInternalUser(superToken, {
    email: `committee-${stamp}@pharaxis.one`,
    fullName: 'Committee Member',
    password: 'Dev@12345',
    role: 'committee_member',
    modules: ['grants', 'iit']
  })

  const grantsOnlyLogin = await loginInternal(grantsOnly.email, 'Dev@12345')
  const grantsOnlyToken = grantsOnlyLogin.token

  const accessible = await request('/api/modules/accessible', { token: grantsOnlyToken })
  assert(accessible.data.modules.length === 1 && accessible.data.modules[0] === 'grants', 'grants-only user should see grants only')

  await request('/api/iit/proposals', { token: grantsOnlyToken, expectStatus: 403 })

  const multiLogin = await loginInternal(multiModule.email, 'Dev@12345')
  const multiToken = multiLogin.token
  await request('/api/modules/switch/grants', { token: multiToken })
  await request('/api/modules/switch/iit', { token: multiToken })

  console.log('[gate] external registration and submissions')
  const externalEmail = `external-${stamp}@example.com`
  const externalReg = await request('/api/auth/external/register', {
    method: 'POST',
    body: {
      email: externalEmail,
      password: 'Ext@12345',
      displayName: 'External Applicant',
      userType: 'institution'
    }
  })
  const externalToken = externalReg.data.token

  const grantSubmit = await request('/api/external/grants/submit', {
    method: 'POST',
    token: externalToken,
    body: {
      applicantType: 'institution',
      applicantName: 'Research Hospital',
      requestedAmount: 320000,
      payload: {
        documents: ['proposal.pdf', 'budget.xlsx']
      }
    }
  })
  const grantId = Number(grantSubmit.data.application.id)

  const iitSubmit = await request('/api/external/iit/submit', {
    method: 'POST',
    token: externalToken,
    body: {
      investigatorName: 'Dr External',
      supportType: 'both',
      requestedAmount: 410000,
      payload: {
        piCvDocument: 'pi-cv.pdf',
        protocolSynopsis: 'Protocol synopsis text',
        budgetSummary: 'Budget summary text'
      }
    }
  })
  const iitId = Number(iitSubmit.data.proposal.id)

  console.log('[gate] external notifications fired')
  const externalNotifs = await request('/api/notifications', { token: externalToken })
  assert(externalNotifs.data.notifications.length >= 2, 'external should receive submission notifications')

  console.log('[gate] document upload/version/retrieve metadata')
  const formV1 = new FormData()
  formV1.set('moduleKey', 'grants')
  formV1.set('entityType', 'grant_application')
  formV1.set('entityId', String(grantId))
  formV1.set('visibility', 'mixed')
  formV1.set('file', new Blob(['grant doc version one'], { type: 'text/plain' }), 'grant-v1.txt')

  const docV1 = await request('/api/documents/upload', {
    method: 'POST',
    token: superToken,
    body: formV1,
    isForm: true
  })

  const documentId = Number(docV1.data.documentId)

  const formV2 = new FormData()
  formV2.set('moduleKey', 'grants')
  formV2.set('entityType', 'grant_application')
  formV2.set('entityId', String(grantId))
  formV2.set('visibility', 'mixed')
  formV2.set('file', new Blob(['grant doc version two'], { type: 'text/plain' }), 'grant-v2.txt')

  await request('/api/documents/upload', {
    method: 'POST',
    token: superToken,
    body: formV2,
    isForm: true
  })

  await request('/api/documents/sign', {
    method: 'POST',
    token: superToken,
    body: {
      documentId,
      versionNo: 2
    }
  })

  const docs = await request(`/api/documents?moduleKey=grants&entityType=grant_application&entityId=${grantId}`, { token: superToken })
  assert((docs.data.documents || []).length >= 1, 'document metadata list should return at least one document')

  const versions = await request(`/api/documents/${documentId}/versions`, { token: superToken })
  assert((versions.data.versions || []).length === 2, 'two document versions expected')

  const tokenResp = await request('/api/documents/download-token', {
    method: 'POST',
    token: superToken,
    body: { documentVersionId: versions.data.versions[0].id }
  })
  await request(`/api/documents/download/${tokenResp.data.token}`)

  console.log('[gate] workflow warning + acknowledgement enforcement')
  await request('/api/workflows/transition', {
    method: 'POST',
    token: superToken,
    body: {
      moduleKey: 'grants',
      entityType: 'grant_application',
      entityId: String(grantId),
      toState: 'warning_ack_pending',
      warningRequired: true,
      note: 'dummy warning',
      notifyUserIds: [superLogin.user.id]
    }
  })
  await request('/api/workflows/ack-warning', {
    method: 'POST',
    token: superToken,
    body: {
      moduleKey: 'grants',
      entityType: 'grant_application',
      entityId: String(grantId),
      ruleKey: 'dummy_rule',
      message: 'dummy message',
      notes: 'acknowledged for gate test'
    }
  })

  const superNotifs = await request('/api/notifications', { token: superToken })
  assert(
    (superNotifs.data.notifications || []).some((item) => item.template_key === 'workflow_transition'),
    'workflow transition notification should fire in-app'
  )

  console.log('[gate] approval matrix create + resolve')
  await request('/api/approvals', {
    method: 'POST',
    token: superToken,
    body: {
      moduleKey: 'grants',
      requestType: `test_grant_${stamp}`,
      geography: 'US',
      minValue: 100000,
      maxValue: 500000,
      approverChain: [{ role: 'medical_reviewer' }, { role: 'committee_member' }]
    }
  })

  const resolved = await request('/api/approvals/resolve', {
    method: 'POST',
    token: superToken,
    body: {
      moduleKey: 'grants',
      requestType: `test_grant_${stamp}`,
      geography: 'US',
      amount: 350000
    }
  })
  assert(resolved.data.matrix && resolved.data.matrix.id, 'approval matrix resolve should return a matrix')

  console.log('[gate] grants full lifecycle including warning block')
  await request(`/api/grants/applications/${grantId}/completeness-check`, {
    method: 'POST',
    token: superToken,
    body: { isComplete: false, comments: 'Need correction first' }
  })

  const extAfterReturn = await request('/api/notifications', { token: externalToken })
  assert(
    (extAfterReturn.data.notifications || []).some((item) => item.template_key === 'grant_returned_for_correction'),
    'external user should receive return-for-correction email notification'
  )

  await request(`/api/grants/applications/${grantId}/completeness-check`, {
    method: 'POST',
    token: superToken,
    body: { isComplete: true, comments: 'now complete' }
  })

  const compliance = await request(`/api/grants/applications/${grantId}/compliance-screen`, {
    method: 'POST',
    token: superToken,
    body: { coiDeclared: true }
  })
  assert(compliance.data.warningRequired === true, 'grant COI should trigger warning')

  await request(`/api/grants/applications/${grantId}/review`, {
    method: 'POST',
    token: superToken,
    body: { scientificScore: 8.1, strategicScore: 8.4, comments: 'should be blocked' },
    expectStatus: 409
  })

  const warning = compliance.data.warnings[0]
  await request(`/api/grants/applications/${grantId}/ack-warning`, {
    method: 'POST',
    token: superToken,
    body: {
      ruleKey: warning.ruleKey,
      message: warning.message,
      notes: 'ack from gate test'
    }
  })

  await request(`/api/grants/applications/${grantId}/review`, {
    method: 'POST',
    token: superToken,
    body: { scientificScore: 8.1, strategicScore: 8.4, comments: 'scientific review done' }
  })

  await request(`/api/grants/applications/${grantId}/decision`, {
    method: 'POST',
    token: superToken,
    body: {
      decision: 'partially_funded',
      approvedAmount: 210000,
      rationale: 'Partial fit with strategy',
      signDecision: true
    }
  })

  await request(`/api/grants/applications/${grantId}/contract`, {
    method: 'POST',
    token: superToken,
    body: {
      milestones: [
        { title: 'Initial kickoff', dueDate: '2026-05-10', deliverable: 'Kickoff report' },
        { title: 'Interim data', dueDate: '2026-08-10', deliverable: 'Interim analysis' }
      ],
      deliverables: ['Kickoff report', 'Interim analysis']
    }
  })

  await request(`/api/grants/applications/${grantId}/disbursement`, {
    method: 'POST',
    token: superToken,
    body: {
      milestoneName: 'Initial kickoff',
      amount: 75000,
      currency: 'USD'
    }
  })

  const exportCsv = await request('/api/disbursements/open-payments-export?format=csv', { token: superToken })
  assert(typeof exportCsv.data === 'string' && exportCsv.data.includes('applicationCode'), 'CSV export should include headers')

  const exportXml = await request('/api/disbursements/open-payments-export?format=xml', { token: superToken })
  assert(typeof exportXml.data === 'string' && exportXml.data.includes('<openPaymentsExport'), 'XML export should render root node')

  const grantAudit = await request(`/api/grants/applications/${grantId}/audit`, { token: superToken })
  assert((grantAudit.data.audit || []).length > 0, 'grant audit should not be empty')

  console.log('[gate] iit full lifecycle with warning block and committee summary')
  await request(`/api/iit/proposals/${iitId}/triage`, {
    method: 'POST',
    token: superToken,
    body: {
      triageDecision: 'proceed',
      scientificScore: 8.9,
      strategicScore: 8.2,
      comments: 'Proceed to FMV'
    }
  })

  const fmv = await request(`/api/iit/proposals/${iitId}/fmv-review`, {
    method: 'POST',
    token: superToken,
    body: {
      fmvReferenceValue: 200000,
      fmvSource: 'fmv_test_feed',
      fmvReferenceId: `fmv-${stamp}`
    }
  })
  assert(fmv.data.warningRequired === true, 'IIT FMV should trigger warning')

  await request(`/api/iit/proposals/${iitId}/committee-vote`, {
    method: 'POST',
    token: superToken,
    body: {
      functionRole: 'medical_reviewer',
      vote: 'approve',
      comments: 'Blocked vote should fail until ack'
    },
    expectStatus: 409
  })

  const fmvWarning = fmv.data.warnings[0]
  await request(`/api/iit/proposals/${iitId}/ack-warning`, {
    method: 'POST',
    token: superToken,
    body: {
      ruleKey: fmvWarning.ruleKey,
      message: fmvWarning.message,
      notes: 'FMV warning acknowledged'
    }
  })

  const medLogin = await loginInternal(medReviewer.email, 'Dev@12345')
  const compLogin = await loginInternal(complianceReviewer.email, 'Dev@12345')
  const committeeLogin = await loginInternal(committeeMember.email, 'Dev@12345')

  await request(`/api/iit/proposals/${iitId}/committee-vote`, {
    method: 'POST',
    token: medLogin.token,
    body: { functionRole: 'medical_reviewer', vote: 'approve', comments: 'medical ok' }
  })

  await request(`/api/iit/proposals/${iitId}/committee-vote`, {
    method: 'POST',
    token: compLogin.token,
    body: { functionRole: 'compliance_reviewer', vote: 'approve', comments: 'compliance ok' }
  })

  await request(`/api/iit/proposals/${iitId}/committee-vote`, {
    method: 'POST',
    token: committeeLogin.token,
    body: { functionRole: 'committee_member', vote: 'conditional_approve', comments: 'conditional pending IRB' }
  })

  const summary = await request(`/api/iit/proposals/${iitId}/committee-summary`, { token: superToken })
  assert(Array.isArray(summary.data.pendingRoles) && summary.data.pendingRoles.length === 0, 'all committee roles should be covered')

  await request(`/api/iit/proposals/${iitId}/approve`, {
    method: 'POST',
    token: superToken,
    body: {
      decision: 'conditional_approval',
      pendingRequirements: ['IRB approval letter'],
      publicationRights: 'Sponsor review before publication',
      dataRights: 'Shared data rights with sponsor',
      signContract: true
    }
  })

  await request(`/api/iit/proposals/${iitId}/milestones`, {
    method: 'POST',
    token: superToken,
    body: {
      milestones: [
        {
          title: 'Protocol initiation',
          progressReportUrl: 'https://example.com/progress-1',
          protocolDeviationNotes: 'No major deviation',
          budgetUtilization: 120000,
          status: 'in_progress'
        }
      ]
    }
  })

  await request(`/api/iit/proposals/${iitId}/publications`, {
    method: 'POST',
    token: superToken,
    body: {
      title: 'IIT Outcomes Draft',
      milestoneStatus: 'submitted'
    }
  })

  const fmvReference = await request(`/api/iit/proposals/${iitId}/fmv-reference`, { token: superToken })
  assert(fmvReference.data.fmvReference && fmvReference.data.fmvReference.source === 'fmv_test_feed', 'FMV reference metadata should be exposed')

  const iitAudit = await request(`/api/iit/proposals/${iitId}/audit`, { token: superToken })
  assert((iitAudit.data.audit || []).length > 0, 'iit audit should not be empty')

  console.log('[gate] negative path checks')
  await request('/api/external/grants/submit', {
    method: 'POST',
    token: externalToken,
    body: {
      applicantType: 'institution',
      applicantName: 'Invalid Missing docs',
      requestedAmount: 10000,
      payload: {}
    },
    expectStatus: 400
  })

  await request('/api/external/iit/submit', {
    method: 'POST',
    token: externalToken,
    body: {
      investigatorName: 'Invalid Missing payload',
      supportType: 'funding',
      requestedAmount: 10000,
      payload: { protocolSynopsis: 'missing fields' }
    },
    expectStatus: 400
  })

  await request('/api/users', { token: externalToken, expectStatus: 403 })

  console.log('[gate] checkpoint suite passed')
}

main().catch((error) => {
  console.error('[gate] failed', error)
  process.exit(1)
})
