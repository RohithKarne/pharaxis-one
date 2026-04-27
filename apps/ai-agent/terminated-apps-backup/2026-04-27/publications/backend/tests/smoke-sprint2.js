/* eslint-disable no-console */
const crypto = require('crypto')

const baseUrl = process.env.BASE_URL || 'http://127.0.0.1:5310'
const adminEmail = process.env.SMOKE_ADMIN_EMAIL || 'superadmin.publications@pharaxis.one'
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD || 'Admin@123'

async function request(path, { method = 'GET', token, body, isForm = false, headers = {} } = {}) {
  const requestHeaders = {
    ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: requestHeaders,
    body: body
      ? (isForm ? body : JSON.stringify(body))
      : undefined
  })

  const text = await response.text()
  let data = {}
  if (text) {
    try {
      data = JSON.parse(text)
    } catch (_error) {
      data = { raw: text }
    }
  }

  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${data?.error || text}`)
  }

  return data
}

async function run() {
  const health = await request('/api/health')
  if (health.database !== 'mysql') {
    throw new Error('Backend is not in mysql mode')
  }

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: adminEmail, password: adminPassword }
  })
  const token = login.token
  if (!token) throw new Error('Login token missing')

  const seed = Date.now()
  const tenant = await request('/api/admin/tenants', {
    method: 'POST',
    token,
    body: { name: `Sprint2 Smoke ${seed}`, slug: `s2-smoke-${seed}` }
  })
  const tenantId = tenant.tenant.id

  const reviewer = await request('/api/admin/users', {
    method: 'POST',
    token,
    body: {
      tenantId,
      fullName: `Sprint2 Reviewer ${seed}`,
      email: `s2.reviewer.${seed}@pharaxis.one`,
      role: 'reviewer',
      password: 'SmokePass@123'
    }
  })

  const template = await request('/api/sprint2/templates', {
    method: 'POST',
    token,
    body: {
      tenantId,
      templateName: `Oncology Journal Template ${seed}`,
      publicationType: 'journal_article',
      defaultTargetVenue: 'Demo Journal',
      milestones: [
        { milestoneName: 'First Draft Due', dueOffsetDays: 7 },
        { milestoneName: 'Internal Review Deadline', dueOffsetDays: 21 }
      ],
      checklistItems: [
        { itemKey: 'gpp_1', itemText: 'Objective documented', isRequired: true },
        { itemKey: 'gpp_2', itemText: 'Authorship criteria reviewed', isRequired: true }
      ],
      reviewerUserIds: [reviewer.user.id]
    }
  })

  const publication = await request('/api/publications', {
    method: 'POST',
    token,
    body: {
      tenantId,
      title: `Sprint2 Publication ${seed}`,
      publicationType: 'journal_article',
      drugName: 'Compound Z',
      therapeuticArea: 'Oncology',
      targetVenue: '',
      templateId: template.templateId
    }
  })
  const publicationId = Number(publication.publication.id)

  const gantt = await request(`/api/sprint2/gantt?tenantId=${tenantId}`, { token })
  if (!Array.isArray(gantt.items) || gantt.items.length === 0) {
    throw new Error('Gantt data missing')
  }

  const formData1 = new FormData()
  formData1.append('file', new Blob(['%PDF-1.4 fake content A'], { type: 'application/pdf' }), 'version-a.pdf')
  await request(`/api/publications/${publicationId}/documents/upload`, {
    method: 'POST',
    token,
    body: formData1,
    isForm: true
  })

  const formData2 = new FormData()
  formData2.append('file', new Blob(['%PDF-1.4 fake content B'], { type: 'application/pdf' }), 'version-b.pdf')
  await request(`/api/publications/${publicationId}/documents/upload`, {
    method: 'POST',
    token,
    body: formData2,
    isForm: true
  })

  const detailsAfterUpload = await request(`/api/publications/${publicationId}`, { token })
  const versions = detailsAfterUpload.documentVersions || []
  if (versions.length < 2) throw new Error('Expected two uploaded versions')

  const compare = await request(
    `/api/sprint2/publications/${publicationId}/documents/compare?leftVersionId=${versions[0].id}&rightVersionId=${versions[1].id}`,
    { token }
  )
  if (!compare.left || !compare.right) throw new Error('Document comparison missing left/right payload')

  const comment = await request(`/api/sprint2/publications/${publicationId}/comments`, {
    method: 'POST',
    token,
    body: {
      documentVersionId: versions[0].id,
      pageNumber: 1,
      commentText: 'Please update references'
    }
  })
  await request(`/api/sprint2/comments/${comment.commentId}`, {
    method: 'PATCH',
    token,
    body: { status: 'resolved' }
  })

  const conference = await request('/api/sprint2/conferences', {
    method: 'POST',
    token,
    body: {
      tenantId,
      conferenceName: `ASCO ${seed}`,
      therapeuticArea: 'Oncology',
      abstractDeadline: '2026-10-01',
      startDate: '2026-11-01',
      endDate: '2026-11-05'
    }
  })

  await request(`/api/sprint2/publications/${publicationId}/conferences/${conference.conferenceId}/link`, {
    method: 'POST',
    token
  })

  const mimsSearch = await request(`/api/sprint2/mims/search?tenantId=${tenantId}&q=Compound`, { token })
  await request(`/api/sprint2/publications/${publicationId}/mims-link`, {
    method: 'POST',
    token,
    body: {
      mimsDrugId: mimsSearch.results?.[0]?.id || 'fallback-1',
      mimsDrugName: mimsSearch.results?.[0]?.name || 'Compound Z'
    }
  })

  await request(`/api/sprint2/publications/${publicationId}/safety`, {
    method: 'PATCH',
    token,
    body: { safetyRelated: true, safetyCaseReference: `SAFE-${seed}` }
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

  const author = await request(`/api/publications/${publicationId}/authors`, {
    method: 'POST',
    token,
    body: {
      fullName: 'Safety Author',
      email: `safety.author.${seed}@pharaxis.one`,
      affiliation: 'Pharaxis',
      disclosureStatus: 'complete',
      icmjeCategories: ['Drafting']
    }
  })
  const authorId = author.linkedAuthor?.authorId
  await request(`/api/publications/${publicationId}/disclosures/${authorId}`, {
    method: 'PATCH',
    token,
    body: { signoffStatus: 'signed', financialInterests: 'None', companyRelationships: 'None', coiDeclaration: 'None' }
  })
  await request(`/api/publications/${publicationId}/gpp/gpp_1`, { method: 'PATCH', token, body: { isChecked: true } })
  await request(`/api/publications/${publicationId}/gpp/gpp_2`, { method: 'PATCH', token, body: { isChecked: true } })

  await request(`/api/publications/${publicationId}/status`, {
    method: 'PATCH',
    token,
    body: { status: 'internal_review' }
  })

  const assign = await request(`/api/publications/${publicationId}/reviews/assign`, {
    method: 'POST',
    token,
    body: { reviewerUserIds: [reviewer.user.id] }
  })
  const reviewId = assign.reviews?.[0]?.id
  await request(`/api/publications/${publicationId}/reviews/${reviewId}/decision`, {
    method: 'POST',
    token,
    body: { decision: 'approved' }
  })

  await request('/api/sprint2/safety/queue/run', { method: 'POST', token })
  await request('/api/sprint2/automation/run', { method: 'POST', token })

  const portfolio = await request(`/api/sprint2/reports/portfolio?tenantId=${tenantId}`, { token })
  if (!portfolio.byStatus) throw new Error('Portfolio report missing')
  await request(`/api/sprint2/reports/portfolio?tenantId=${tenantId}&format=csv`, { token })

  const workload = await request(`/api/sprint2/reports/workload?tenantId=${tenantId}`, { token })
  if (!Array.isArray(workload.rows)) throw new Error('Workload report missing')
  await request(`/api/sprint2/reports/workload?tenantId=${tenantId}&format=csv`, { token })

  const publication2 = await request('/api/publications', {
    method: 'POST',
    token,
    body: {
      tenantId,
      title: `Bulk Publication ${seed}`,
      publicationType: 'poster',
      drugName: 'Compound Y',
      therapeuticArea: 'Cardio',
      targetVenue: 'ESC'
    }
  })

  await request('/api/sprint2/bulk/status', {
    method: 'POST',
    token,
    body: {
      publicationIds: [publicationId, Number(publication2.publication.id)],
      status: 'planning'
    }
  })

  await request('/api/sprint2/bulk/reviewer-assign', {
    method: 'POST',
    token,
    body: {
      publicationIds: [publicationId, Number(publication2.publication.id)],
      reviewerUserId: reviewer.user.id
    }
  })

  const csvText = [
    'title,publicationType,drugName,therapeuticArea,targetVenue',
    `Imported One ${seed},journal_article,Drug A,Oncology,Journal A`,
    `Imported Two ${seed},poster,Drug B,Cardiology,Congress B`
  ].join('\n')

  const preview = await request('/api/sprint2/import/csv', {
    method: 'POST',
    token,
    body: { tenantId, csvText, dryRun: true }
  })
  if (!preview.validRows) throw new Error('CSV preview failed')

  const imported = await request('/api/sprint2/import/csv', {
    method: 'POST',
    token,
    body: { tenantId, csvText, dryRun: false }
  })
  if (Number(imported.importedCount || 0) < 2) throw new Error('CSV import failed')

  const notifications = await request('/api/notifications/feed', { token })
  if (!Array.isArray(notifications.notifications) || notifications.notifications.length === 0) {
    throw new Error('Expected notification feed entries')
  }
  await request(`/api/notifications/${notifications.notifications[0].id}/read`, { method: 'POST', token })
  await request('/api/notifications/read-all', { method: 'POST', token })

  console.log('[smoke-sprint2] PASS')
  console.log(
    JSON.stringify(
      {
        tenantId,
        publicationId,
        secondPublicationId: Number(publication2.publication.id),
        importedCount: imported.importedCount,
        traceId: crypto.randomUUID()
      },
      null,
      2
    )
  )
}

run().catch((error) => {
  console.error('[smoke-sprint2] failed', error)
  process.exit(1)
})
