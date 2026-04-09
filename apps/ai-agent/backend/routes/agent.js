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
const TIMEOUT_MS = 30000

// POST /api/v1/agent/query
router.post('/query', authenticate, resolveKey, async (req, res) => {
  const { org_id, app_source, query_type, payload } = req.body

  // Validate required fields
  for (const field of REQUIRED_FIELDS) {
    if (!req.body[field]) {
      return res.status(400).json(formatError(`Missing required field: ${field}`, 400))
    }
  }
  if (!VALID_APP_SOURCES.includes(app_source)) {
    return res.status(400).json(formatError(`Invalid app_source: ${app_source}`, 400))
  }
  if (!VALID_QUERY_TYPES.includes(query_type)) {
    return res.status(400).json(formatError(`Unsupported query_type: ${query_type}`, 400))
  }

  const startTime = Date.now()
  let tokensIn = 0
  let tokensOut = 0
  let status = 'success'

  try {
    // Route with timeout
    const result = await Promise.race([
      routeRequest({
        provider: req.agentProvider,
        apiKey: req.agentKey,
        queryType: query_type,
        payload
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
      )
    ])

    tokensIn = result.tokens_used?.in || 0
    tokensOut = result.tokens_used?.out || 0

    await logUsage({ org_id, app_source, query_type, tokensIn, tokensOut, provider: req.agentProvider, latency: Date.now() - startTime, status })

    return res.json(result)

  } catch (err) {
    status = err.message === 'TIMEOUT' ? 'timeout' : 'failed'
    await logUsage({ org_id, app_source, query_type, tokensIn: 0, tokensOut: 0, provider: req.agentProvider, latency: Date.now() - startTime, status })

    if (err.message === 'TIMEOUT') {
      return res.status(504).json(formatError('AI request timed out. Please retry.', 504))
    }
    return res.status(500).json(formatError('AI request failed. Please try again.', 500))
  }
})

async function logUsage({ org_id, app_source, query_type, tokensIn, tokensOut, provider, latency, status }) {
  try {
    await pool.execute(
      `INSERT INTO ai_agent_usage_log (org_id, app_source, query_type, tokens_in, tokens_out, provider, response_latency_ms, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [org_id, app_source, query_type, tokensIn, tokensOut, provider, latency, status]
    )
  } catch {
    // Non-blocking — usage log failure must not break the response
  }
}

module.exports = router
