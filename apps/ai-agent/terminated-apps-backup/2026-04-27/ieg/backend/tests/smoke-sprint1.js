/* eslint-disable no-console */
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5300'

async function request(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })

  const text = await response.text()
  const data = text ? JSON.parse(text) : {}

  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${data.error || ''}`)
  }
  return data
}

async function main() {
  console.log('[smoke] checking health')
  await request('/api/health')

  console.log('[smoke] internal login')
  const internal = await request('/api/auth/login', {
    method: 'POST',
    body: {
      email: process.env.SMOKE_SUPERADMIN_EMAIL || 'superadmin.ieg@pharaxis.one',
      password: process.env.SMOKE_SUPERADMIN_PASSWORD || 'Admin@123'
    }
  })

  const internalToken = internal.token

  console.log('[smoke] verify module switch + task queue')
  await request('/api/modules/accessible', { token: internalToken })
  await request('/api/tasks?moduleKey=grants', { token: internalToken })

  console.log('[smoke] external register')
  const stamp = Date.now()
  const external = await request('/api/auth/external/register', {
    method: 'POST',
    body: {
      email: `smoke-${stamp}@example.com`,
      password: 'Smoke@123',
      displayName: 'Smoke Investigator',
      userType: 'institution'
    }
  })

  const externalToken = external.token

  console.log('[smoke] external grant + iit submissions')
  const grantSubmit = await request('/api/external/grants/submit', {
    method: 'POST',
    token: externalToken,
    body: {
      applicantType: 'hcp',
      applicantName: 'Smoke HCP',
      requestedAmount: 130000,
      payload: {
        documents: ['grant-proposal.pdf']
      }
    }
  })

  const iitSubmit = await request('/api/external/iit/submit', {
    method: 'POST',
    token: externalToken,
    body: {
      investigatorName: 'Smoke PI',
      supportType: 'funding',
      requestedAmount: 210000,
      payload: {
        piCvDocument: 'pi-cv.pdf',
        protocolSynopsis: 'Observational concept',
        budgetSummary: 'High level budget'
      }
    }
  })

  console.log('[smoke] internal grant + iit stage operations')
  await request(`/api/grants/applications/${grantSubmit.application.id}/completeness-check`, {
    method: 'POST',
    token: internalToken,
    body: { isComplete: true, comments: 'Smoke complete' }
  })

  await request(`/api/grants/applications/${grantSubmit.application.id}/compliance-screen`, {
    method: 'POST',
    token: internalToken,
    body: { coiDeclared: true }
  })

  await request(`/api/iit/proposals/${iitSubmit.proposal.id}/triage`, {
    method: 'POST',
    token: internalToken,
    body: { triageDecision: 'proceed', comments: 'Smoke triage pass' }
  })

  await request(`/api/iit/proposals/${iitSubmit.proposal.id}/fmv-review`, {
    method: 'POST',
    token: internalToken,
    body: { fmvReferenceValue: 100000 }
  })

  console.log('[smoke] all sprint1 checks passed')
}

main().catch((error) => {
  console.error('[smoke] failed', error)
  process.exit(1)
})
