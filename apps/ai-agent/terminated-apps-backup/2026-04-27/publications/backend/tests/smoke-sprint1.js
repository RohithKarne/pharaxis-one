/* eslint-disable no-console */
const crypto = require('crypto')

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5310'
const adminEmail = process.env.SMOKE_ADMIN_EMAIL || 'superadmin.publications@pharaxis.one'
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || 'Admin@123'

async function request(path, { method = 'GET', token, body, isForm = false } = {}) {
  const headers = {}
  if (!isForm) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body
      ? (isForm ? body : JSON.stringify(body))
      : undefined
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : {}

  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${data?.error || text}`)
  }

  return data
}

async function requestExpectFailure(path, { method = 'GET', token, body, isForm = false, expectedStatus } = {}) {
  const headers = {}
  if (!isForm) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body
      ? (isForm ? body : JSON.stringify(body))
      : undefined
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : {}

  if (response.ok) {
    throw new Error(`${method} ${path} unexpectedly succeeded`)
  }

  if (Number.isFinite(Number(expectedStatus)) && response.status !== Number(expectedStatus)) {
    throw new Error(`${method} ${path} expected ${expectedStatus}, got ${response.status}`)
  }

  return { status: response.status, data }
}

async function run() {
  const health = await request('/api/health')
  if (health.database !== 'mysql') {
    throw new Error('Backend is not running in mysql mode')
  }

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: adminEmail, password: adminPassword }
  })

  const token = login.token
  if (!token) throw new Error('Login token missing')

  const slug = `smoke-${Date.now()}`
  const tenant = await request('/api/admin/tenants', {
    method: 'POST',
    token,
    body: { name: `Smoke Tenant ${Date.now()}`, slug }
  })

  const tenantId = tenant.tenant.id

  const manager = await request('/api/admin/users', {
    method: 'POST',
    token,
    body: {
      tenantId,
      fullName: 'Smoke Manager',
      email: `smoke.manager.${Date.now()}@pharaxis.one`,
      role: 'publications_manager',
      password: 'SmokePass@123'
    }
  })

  const reviewer = await request('/api/admin/users', {
    method: 'POST',
    token,
    body: {
      tenantId,
      fullName: 'Smoke Reviewer',
      email: `smoke.reviewer.${Date.now()}@pharaxis.one`,
      role: 'reviewer',
      password: 'SmokePass@123'
    }
  })

  const publication = await request('/api/publications', {
    method: 'POST',
    token,
    body: {
      tenantId,
      title: `Smoke Publication ${Date.now()}`,
      publicationType: 'journal_article',
      drugName: 'Compound-X',
      therapeuticArea: 'Oncology',
      targetVenue: 'Demo Journal'
    }
  })

  const publicationId = publication.publication.id

  const createdAuthor = await request(`/api/publications/${publicationId}/authors`, {
    method: 'POST',
    token,
    body: {
      fullName: 'Dr. Smoke Author',
      email: `smoke.author.${Date.now()}@pharaxis.one`,
      affiliation: 'Pharaxis Labs',
      disclosureStatus: 'incomplete',
      icmjeCategories: ['Drafting', 'Final Approval']
    }
  })
  const authorId = createdAuthor.linkedAuthor?.authorId
  if (!authorId) {
    throw new Error('Author creation failed')
  }

  await request(`/api/publications/${publicationId}/milestones`, {
    method: 'POST',
    token,
    body: {
      milestoneName: 'First Draft Due',
      dueDate: '2026-12-31'
    }
  })

  await request(`/api/publications/${publicationId}/status`, {
    method: 'PATCH',
    token,
    body: { status: 'planning' }
  })

  await request(`/api/publications/${publicationId}/status`, {
    method: 'PATCH',
    token,
    body: { status: 'writing' }
  })

  await request(`/api/publications/${publicationId}/status`, {
    method: 'PATCH',
    token,
    body: { status: 'internal_review' }
  })

  const blockedTransition = await requestExpectFailure(`/api/publications/${publicationId}/status`, {
    method: 'PATCH',
    token,
    body: { status: 'journal_submission' },
    expectedStatus: 400
  })

  if (!blockedTransition.data?.missingRequiredGppItems?.length || !blockedTransition.data?.pendingDisclosures?.length) {
    throw new Error('Expected transition block details for missing GPP and disclosures')
  }

  await request(`/api/publications/${publicationId}/reviews/assign`, {
    method: 'POST',
    token,
    body: { reviewerUserIds: [reviewer.user.id] }
  })

  const requiredItemKeys = ['gpp_1', 'gpp_2', 'gpp_3', 'gpp_4', 'gpp_5', 'gpp_7', 'gpp_10', 'gpp_13']
  for (const itemKey of requiredItemKeys) {
    await request(`/api/publications/${publicationId}/gpp/${itemKey}`, {
      method: 'PATCH',
      token,
      body: { isChecked: true }
    })
  }

  await request(`/api/publications/${publicationId}/disclosures/request`, {
    method: 'POST',
    token,
    body: {
      authorId,
      requestNote: 'Smoke request'
    }
  })

  await request(`/api/publications/${publicationId}/disclosures/${authorId}`, {
    method: 'PATCH',
    token,
    body: {
      signoffStatus: 'signed',
      financialInterests: 'None declared',
      companyRelationships: 'Consulting: none',
      coiDeclaration: 'No conflict'
    }
  })

  const details = await request(`/api/publications/${publicationId}`, {
    token
  })

  const reviewId = details.reviews?.[0]?.id
  if (!reviewId) {
    throw new Error('Review assignment missing in publication details')
  }

  await request(`/api/publications/${publicationId}/reviews/${reviewId}/decision`, {
    method: 'POST',
    token,
    body: {
      decision: 'approved'
    }
  })

  const postReview = await request(`/api/publications/${publicationId}`, { token })
  if (postReview.publication.status !== 'journal_submission') {
    throw new Error(`Expected journal_submission after approval, got ${postReview.publication.status}`)
  }

  const createdSubmission = await request(`/api/publications/${publicationId}/submissions`, {
    method: 'POST',
    token,
    body: {
      submissionType: 'journal',
      venueName: 'Demo Journal',
      referenceId: `MS-${Date.now()}`,
      submissionDate: '2026-12-20',
      peerReviewStatus: 'under_review',
      revisionRound: 0,
      notes: 'Smoke submission'
    }
  })

  const submissionId = createdSubmission.submission?.id
  if (!submissionId) {
    throw new Error('Submission creation failed')
  }

  await request(`/api/publications/${publicationId}/submissions/${submissionId}`, {
    method: 'PATCH',
    token,
    body: {
      peerReviewStatus: 'revision_requested',
      revisionRound: 1,
      notes: 'Revision round 1'
    }
  })

  const afterSubmission = await request(`/api/publications/${publicationId}`, { token })
  if (!afterSubmission.submissionHistory?.length) {
    throw new Error('Expected submission history after create/update')
  }

  const audit = await request(`/api/audit?tenantId=${tenantId}&publicationId=${publicationId}`, { token })
  if (!audit.entries?.length) {
    throw new Error('Expected audit entries but none found')
  }

  const summary = await request(`/api/dashboard/summary?tenantId=${tenantId}`, { token })
  if (!summary.byStatus?.length) {
    throw new Error('Expected dashboard status summary')
  }

  console.log('[smoke-sprint1] PASS')
  console.log(JSON.stringify({
    tenantId,
    managerUserId: manager.user.id,
    reviewerUserId: reviewer.user.id,
    authorId,
    submissionId,
    publicationId,
    status: postReview.publication.status,
    traceId: crypto.randomUUID()
  }, null, 2))
}

run().catch((error) => {
  console.error('[smoke-sprint1] failed', error)
  process.exit(1)
})
