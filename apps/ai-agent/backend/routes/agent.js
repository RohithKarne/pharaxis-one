const express = require('express')
const router = express.Router()
const { authenticate } = require('../middleware/auth')
const { resolveKey } = require('../middleware/keyResolver')
const { routeRequest } = require('../core/requestRouter')
const { formatError } = require('../core/responseFormatter')
const { pool } = require('../database/db')

const REQUIRED_FIELDS = ['org_id', 'app_source', 'query_type', 'payload']
const VALID_APP_SOURCES = ['cp_portal', 'mims', 'vault', 'qms', 'safety', 'external']
const VALID_QUERY_TYPES = ['document_search', 'faq_draft', 'content_expiry_suggestion']
const VALID_PROVIDERS = ['openai', 'claude', 'gemini']
const ADAPTER_ERROR_CODES = new Set(['TIMEOUT', 'AUTH_ERROR', 'RATE_LIMIT', 'BAD_REQUEST', 'PROVIDER_ERROR'])
const TIMEOUT_MS = 30000

function hasRequiredField(body, field) {
  if (!Object.prototype.hasOwnProperty.call(body, field)) return false
  const value = body[field]

  if (value === null || value === undefined) return false
  if (typeof value === 'string' && value.trim() === '') return false

  return true
}

function normalizeProviderForLog(provider) {
  return VALID_PROVIDERS.includes(provider) ? provider : 'openai'
}

function normalizeAppSourceForLog(appSource) {
  return VALID_APP_SOURCES.includes(appSource) ? appSource : 'external'
}

function normalizeQueryTypeForLog(queryType) {
  if (typeof queryType === 'string' && queryType.trim()) {
    return queryType.trim()
  }

  return 'unknown'
}

function isProviderFailure(error) {
  if (!error || typeof error !== 'object') return false
  if (ADAPTER_ERROR_CODES.has(error.code)) return true
  return Boolean(error.provider) && typeof error.code === 'string'
}

async function withTimeout(promise, timeoutMs) {
  let timeoutId

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const timeoutError = new Error('AI request timed out')
      timeoutError.code = 'TIMEOUT'
      reject(timeoutError)
    }, timeoutMs)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timeoutId)
  }
}

async function logUsage({ org_id, app_source, query_type, tokensIn, tokensOut, provider, latency, status }) {
  try {
    await pool.execute(
      `INSERT INTO ai_agent_usage_log (org_id, app_source, query_type, tokens_in, tokens_out, provider, response_latency_ms, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(org_id),
        normalizeAppSourceForLog(app_source),
        normalizeQueryTypeForLog(query_type),
        Number(tokensIn) || 0,
        Number(tokensOut) || 0,
        normalizeProviderForLog(provider),
        Number(latency) || 0,
        status
      ]
    )
  } catch {
    // Usage logging must never block the API response.
  }
}

router.post('/query', authenticate, resolveKey, async (req, res) => {
  const startTime = Date.now()
  const requestBody = req.body || {}
  const { org_id, app_source, query_type, payload } = requestBody

  const writeFailure = async ({ httpStatus, message, code, status = 'failed' }) => {
    await logUsage({
      org_id: org_id || req.user?.orgId,
      app_source,
      query_type,
      tokensIn: 0,
      tokensOut: 0,
      provider: req.agentProvider,
      latency: Date.now() - startTime,
      status
    })

    return res.status(httpStatus).json(formatError(message, code))
  }

  for (const field of REQUIRED_FIELDS) {
    if (!hasRequiredField(requestBody, field)) {
      return writeFailure({
        httpStatus: 400,
        message: `Missing required field: ${field}`,
        code: 400
      })
    }
  }

  if (!VALID_APP_SOURCES.includes(app_source)) {
    return writeFailure({
      httpStatus: 400,
      message: `Invalid app_source: ${app_source}`,
      code: 400
    })
  }

  if (!VALID_QUERY_TYPES.includes(query_type)) {
    return writeFailure({
      httpStatus: 400,
      message: `Unsupported query_type: ${query_type}`,
      code: 400
    })
  }

  try {
    const result = await withTimeout(
      routeRequest({
        provider: req.agentProvider,
        apiKey: req.agentKey,
        queryType: query_type,
        payload
      }),
      TIMEOUT_MS
    )

    const tokensIn = Number(result?.tokens_used?.in) || 0
    const tokensOut = Number(result?.tokens_used?.out) || 0

    await logUsage({
      org_id,
      app_source,
      query_type,
      tokensIn,
      tokensOut,
      provider: req.agentProvider,
      latency: Date.now() - startTime,
      status: 'success'
    })

    return res.json(result)
  } catch (error) {
    if (error?.code === 'TIMEOUT') {
      return writeFailure({
        httpStatus: 504,
        message: 'AI request timed out. Please retry.',
        code: 504,
        status: 'timeout'
      })
    }

    if (isProviderFailure(error)) {
      return writeFailure({
        httpStatus: 502,
        message: 'AI provider request failed. Please retry.',
        code: 'PROVIDER_FAILURE'
      })
    }

    return writeFailure({
      httpStatus: 500,
      message: 'AI request failed. Please try again.',
      code: 500
    })
  }
})

module.exports = router
