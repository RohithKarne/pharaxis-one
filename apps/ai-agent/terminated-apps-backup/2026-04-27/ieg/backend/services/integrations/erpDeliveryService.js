const { requestJson, toBool } = require('./httpClient')

async function deliverErpExport({ clientCode, exportFormat, moduleKey, records }) {
  const enabled = toBool(process.env.ERP_EXPORT_DELIVERY_ENABLED, false)
  if (!enabled) {
    return {
      mode: 'stub',
      delivered: false,
      providerResponse: {
        reason: 'ERP_EXPORT_DELIVERY_ENABLED is false',
        recordCount: records.length
      }
    }
  }

  const endpoint = process.env.ERP_EXPORT_ENDPOINT_URL
  if (!endpoint) {
    throw new Error('Missing required environment variable: ERP_EXPORT_ENDPOINT_URL')
  }

  const token = process.env.ERP_EXPORT_AUTH_TOKEN || ''
  const response = await requestJson(endpoint, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json'
    },
    body: {
      clientCode,
      exportFormat,
      moduleKey,
      generatedAt: new Date().toISOString(),
      recordCount: records.length,
      records
    },
    allowHttp: toBool(process.env.ERP_EXPORT_ALLOW_HTTP, false)
  })

  return {
    mode: 'live',
    delivered: true,
    providerResponse: response.data,
    externalReference: String(response.data?.id || response.data?.batchId || '')
  }
}

module.exports = {
  deliverErpExport
}
