const { requestJson, toBool } = require('./httpClient')

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

async function resolveVeevaToken() {
  if (process.env.VEEVA_ACCESS_TOKEN) return process.env.VEEVA_ACCESS_TOKEN

  const tokenUrl = required('VEEVA_TOKEN_URL')
  const clientId = required('VEEVA_CLIENT_ID')
  const clientSecret = required('VEEVA_CLIENT_SECRET')

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: process.env.VEEVA_GRANT_TYPE || 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      ...(process.env.VEEVA_SCOPE ? { scope: process.env.VEEVA_SCOPE } : {})
    })
  })

  const text = await response.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch (_error) {
    data = null
  }

  if (!response.ok) {
    throw new Error(`Veeva token request failed (${response.status}): ${text}`)
  }

  if (!data?.access_token) {
    throw new Error('Veeva token response missing access_token')
  }

  return data.access_token
}

function buildDmsPayload(job) {
  return {
    syncJobId: job.id,
    moduleKey: job.module_key,
    entityType: job.entity_type,
    entityId: job.entity_id,
    direction: job.direction,
    mappingPayload: job.mapping_payload || {}
  }
}

async function syncToVeeva(job) {
  const baseUrl = required('VEEVA_BASE_URL').replace(/\/$/, '')
  const syncPath = process.env.VEEVA_SYNC_PATH || '/api/v1/ieg/sync'
  const token = await resolveVeevaToken()

  const response = await requestJson(`${baseUrl}${syncPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: buildDmsPayload(job)
  })

  return {
    mode: 'live',
    provider: 'veeva',
    externalReference: String(response.data?.id || response.data?.documentId || response.data?.jobId || ''),
    payload: response.data
  }
}

async function resolveMicrosoftToken() {
  const tenantId = required('MS_TENANT_ID')
  const clientId = required('MS_CLIENT_ID')
  const clientSecret = required('MS_CLIENT_SECRET')

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: process.env.MS_SCOPE || 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    })
  })

  const text = await response.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch (_error) {
    data = null
  }

  if (!response.ok) {
    throw new Error(`Microsoft token request failed (${response.status}): ${text}`)
  }
  if (!data?.access_token) {
    throw new Error('Microsoft token response missing access_token')
  }

  return data.access_token
}

async function syncToSharePoint(job) {
  const siteId = required('SHAREPOINT_SITE_ID')
  const driveId = required('SHAREPOINT_DRIVE_ID')
  const folderPath = process.env.SHAREPOINT_FOLDER_PATH || 'IEG-Sync'
  const graphBase = (process.env.MS_GRAPH_BASE_URL || 'https://graph.microsoft.com/v1.0').replace(/\/$/, '')
  const token = await resolveMicrosoftToken()

  const fileName = `${job.module_key}-${job.entity_type}-${job.entity_id}-sync-${job.id}.json`
  const uploadUrl = `${graphBase}/sites/${siteId}/drives/${driveId}/root:/${folderPath}/${fileName}:/content`
  const content = JSON.stringify(buildDmsPayload(job), null, 2)

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: content
  })

  const text = await response.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch (_error) {
    data = null
  }

  if (!response.ok) {
    throw new Error(`SharePoint upload failed (${response.status}): ${text}`)
  }

  return {
    mode: 'live',
    provider: 'sharepoint',
    externalReference: String(data?.id || data?.webUrl || ''),
    payload: data || { raw: text }
  }
}

function stubResult(job, provider, reason) {
  return {
    mode: 'stub',
    provider,
    externalReference: '',
    payload: {
      reason,
      syncJobId: job.id,
      moduleKey: job.module_key,
      entityType: job.entity_type,
      entityId: job.entity_id
    }
  }
}

async function runDmsSync(job) {
  if (job.provider === 'veeva') {
    if (!toBool(process.env.VEEVA_INTEGRATION_ENABLED, false)) {
      return stubResult(job, 'veeva', 'VEEVA_INTEGRATION_ENABLED is false')
    }
    return syncToVeeva(job)
  }

  if (job.provider === 'sharepoint') {
    if (!toBool(process.env.SHAREPOINT_INTEGRATION_ENABLED, false)) {
      return stubResult(job, 'sharepoint', 'SHAREPOINT_INTEGRATION_ENABLED is false')
    }
    return syncToSharePoint(job)
  }

  throw new Error(`Unsupported DMS provider: ${job.provider}`)
}

module.exports = {
  runDmsSync
}
