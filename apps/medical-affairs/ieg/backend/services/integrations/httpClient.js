const DEFAULT_TIMEOUT_MS = Number(process.env.INTEGRATION_HTTP_TIMEOUT_MS || 15000)

function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function withTimeout(ms = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ms)
  return { controller, timeoutId }
}

function safeParseJson(value) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch (_error) {
    return null
  }
}

async function requestJson(url, {
  method = 'GET',
  headers = {},
  body,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  allowHttp = false
} = {}) {
  if (!allowHttp && String(url).startsWith('http://')) {
    throw new Error('Plain HTTP endpoints are blocked for integrations. Use HTTPS URL.')
  }

  const { controller, timeoutId } = withTimeout(timeoutMs)
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    })

    const text = await response.text()
    const json = safeParseJson(text)

    if (!response.ok) {
      const message = json?.error?.message || json?.error || text || `${response.status} ${response.statusText}`
      const error = new Error(`HTTP ${response.status} for ${url}: ${message}`)
      error.status = response.status
      error.payload = json || text
      throw error
    }

    return {
      status: response.status,
      data: json || { raw: text }
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

module.exports = {
  toBool,
  requestJson
}
