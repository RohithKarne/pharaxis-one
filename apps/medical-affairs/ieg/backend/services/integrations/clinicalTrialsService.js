const { requestJson, toBool } = require('./httpClient')

function normalizeNctId(nctId) {
  return String(nctId || '').trim().toUpperCase()
}

function extractStatus(snapshot) {
  return (
    snapshot?.protocolSection?.statusModule?.overallStatus ||
    snapshot?.overallStatus ||
    'linked'
  )
}

function buildStubSnapshot(nctId, reason) {
  return {
    source: 'clinicaltrials_stub',
    nctId,
    reason,
    fetchedAt: new Date().toISOString(),
    overallStatus: 'unknown'
  }
}

async function fetchClinicalTrialSnapshot(nctIdInput) {
  const nctId = normalizeNctId(nctIdInput)
  if (!nctId.startsWith('NCT')) {
    throw new Error('nctId must start with NCT')
  }

  const liveEnabled = toBool(process.env.CTG_LIVE_FETCH_ENABLED, false)
  if (!liveEnabled) {
    return {
      mode: 'stub',
      status: 'linked',
      registryUrl: `https://clinicaltrials.gov/study/${nctId}`,
      snapshotPayload: buildStubSnapshot(nctId, 'CTG_LIVE_FETCH_ENABLED is false')
    }
  }

  const baseUrl = (process.env.CTG_API_BASE_URL || 'https://clinicaltrials.gov/api/v2/studies').replace(/\/$/, '')
  const response = await requestJson(`${baseUrl}/${encodeURIComponent(nctId)}`, {
    method: 'GET'
  })

  const status = extractStatus(response.data)

  return {
    mode: 'live',
    status,
    registryUrl: `https://clinicaltrials.gov/study/${nctId}`,
    snapshotPayload: {
      source: 'clinicaltrials_live',
      nctId,
      fetchedAt: new Date().toISOString(),
      study: response.data
    }
  }
}

module.exports = {
  fetchClinicalTrialSnapshot
}
