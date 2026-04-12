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

  const raw = await response.text()
  const data = raw ? JSON.parse(raw) : {}

  if (!response.ok) {
    throw new Error(`${method} ${path} failed: ${response.status} ${data.error || raw}`)
  }

  return data
}

async function main() {
  const stamp = Date.now()

  console.log('[sprint2-smoke] health')
  await request('/api/health')

  console.log('[sprint2-smoke] internal login')
  const internal = await request('/api/auth/login', {
    method: 'POST',
    body: {
      email: process.env.SMOKE_SUPERADMIN_EMAIL || 'superadmin.ieg@pharaxis.one',
      password: process.env.SMOKE_SUPERADMIN_PASSWORD || 'Admin@123'
    }
  })
  const internalToken = internal.token

  console.log('[sprint2-smoke] external eap physician register + submit eap')
  const eapExternal = await request('/api/auth/external/register', {
    method: 'POST',
    body: {
      email: `eap-${stamp}@example.com`,
      password: 'Ext@12345',
      displayName: 'Dr Sprint Two',
      userType: 'eap_physician'
    }
  })

  const eapExternalToken = eapExternal.token
  const eapSubmit = await request('/api/external/eap/submit', {
    method: 'POST',
    token: eapExternalToken,
    body: {
      physicianName: 'Dr Sprint Two',
      physicianEmail: `dr-${stamp}@hospital.org`,
      requestedDrug: 'Investigational-X',
      conditionCategory: 'oncology',
      urgencyLevel: 'emergency',
      emergencyFlag: true,
      payload: { note: 'sprint2 smoke' }
    }
  })

  const eapId = Number(eapSubmit.request.id)

  console.log('[sprint2-smoke] internal eap lifecycle')
  await request(`/api/eap/requests/${eapId}/intake-review`, {
    method: 'POST',
    token: internalToken,
    body: { decision: 'eligible', comments: 'intake pass' }
  })

  await request(`/api/eap/requests/${eapId}/regulatory-pathway`, {
    method: 'POST',
    token: internalToken,
    body: { pathway: 'individual_patient_ind', comments: 'pathway selected' }
  })

  await request(`/api/eap/requests/${eapId}/emergency-activate`, {
    method: 'POST',
    token: internalToken,
    body: { targetHours: 4, notes: 'emergency escalation' }
  })

  await request(`/api/eap/requests/${eapId}/supply-event`, {
    method: 'POST',
    token: internalToken,
    body: { supplyState: 'delivered', notes: 'drug delivered' }
  })

  const safetyEvent = await request(`/api/eap/requests/${eapId}/safety-event`, {
    method: 'POST',
    token: internalToken,
    body: {
      eventType: 'sae',
      seriousness: 'serious',
      description: 'adverse event captured'
    }
  })

  await request(`/api/eap/safety-events/${safetyEvent.safetyEvent.id}/report`, {
    method: 'POST',
    token: internalToken,
    body: { payload: { source: 'smoke' } }
  })

  await request(`/api/eap/requests/${eapId}/timeline`, { token: internalToken })
  await request(`/api/eap/requests/${eapId}/audit`, { token: internalToken })

  console.log('[sprint2-smoke] create IIT for integration + platform conversion')
  const institutionUser = await request('/api/auth/external/register', {
    method: 'POST',
    body: {
      email: `institution-${stamp}@example.com`,
      password: 'Ext@12345',
      displayName: 'Institution User',
      userType: 'institution'
    }
  })

  const institutionToken = institutionUser.token
  const iitSubmit = await request('/api/external/iit/submit', {
    method: 'POST',
    token: institutionToken,
    body: {
      investigatorName: 'Dr IIT Sprint2',
      supportType: 'funding',
      requestedAmount: 240000,
      payload: {
        piCvDocument: 'cv.pdf',
        protocolSynopsis: 'protocol',
        budgetSummary: 'budget'
      }
    }
  })

  const iitId = Number(iitSubmit.proposal.id)

  await request('/api/integrations/clinicaltrials/link', {
    method: 'POST',
    token: internalToken,
    body: {
      iitProposalId: iitId,
      nctId: `NCT${String(stamp).slice(-8)}`
    }
  })

  await request(`/api/integrations/clinicaltrials/${iitId}`, { token: internalToken })

  const conversion = await request('/api/platform/convert/iit-to-grant', {
    method: 'POST',
    token: internalToken,
    body: {
      iitProposalId: iitId,
      reason: 'Re-route to grant pipeline'
    }
  })

  const grantId = Number(conversion.targetGrant.id)

  console.log('[sprint2-smoke] ai, integrations, overlay, analytics, policy')
  await request('/api/platform/ai/summary', {
    method: 'POST',
    token: internalToken,
    body: {
      moduleKey: 'grants',
      entityType: 'grant_application',
      entityId: String(grantId)
    }
  })

  await request('/api/platform/ai/score', {
    method: 'POST',
    token: internalToken,
    body: {
      moduleKey: 'grants',
      entityType: 'grant_application',
      entityId: String(grantId)
    }
  })

  await request('/api/integrations/dms/sync-jobs', {
    method: 'POST',
    token: internalToken,
    body: {
      provider: 'veeva',
      moduleKey: 'grants',
      entityType: 'grant_application',
      entityId: String(grantId),
      direction: 'export',
      mappingPayload: { smoke: true }
    }
  })

  await request('/api/integrations/erp/exports', {
    method: 'POST',
    token: internalToken,
    body: {
      clientCode: 'CLIENT_US_01',
      exportFormat: 'csv',
      moduleKey: 'grants'
    }
  })

  await request('/api/platform/compliance-overlay/rules', {
    method: 'POST',
    token: internalToken,
    body: {
      jurisdiction: 'US',
      moduleKey: 'grants',
      ruleKey: `sprint2_overlay_${stamp}`,
      severity: 'high',
      threshold: { maxAmountUSD: 100000 },
      message: 'Overlay threshold breached'
    }
  })

  await request('/api/platform/compliance-overlay/evaluate', {
    method: 'POST',
    token: internalToken,
    body: {
      jurisdiction: 'US',
      moduleKey: 'grants',
      requestedAmount: 240000
    }
  })

  await request('/api/platform/analytics/portfolio', { token: internalToken })
  await request('/api/platform/analytics/snapshot', {
    method: 'POST',
    token: internalToken,
    body: { snapshotType: 'portfolio' }
  })

  await request('/api/platform/policies/rules', {
    method: 'POST',
    token: internalToken,
    body: {
      moduleKey: 'grants',
      policyType: 'termination',
      policyKey: 'high_risk_termination',
      configPayload: { threshold: 85 },
      actions: [
        { actionType: 'notify', payload: { to: 'committee' } }
      ]
    }
  })

  await request('/api/platform/policies/evaluate', {
    method: 'POST',
    token: internalToken,
    body: {
      moduleKey: 'grants',
      entityType: 'grant_application',
      entityId: String(grantId),
      policyType: 'termination',
      signalValue: 90
    }
  })

  console.log('[sprint2-smoke] all sprint2 checks passed')
}

main().catch((error) => {
  console.error('[sprint2-smoke] failed', error)
  process.exit(1)
})
