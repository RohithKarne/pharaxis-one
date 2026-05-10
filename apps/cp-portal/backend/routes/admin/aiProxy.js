const express = require('express')
const router = express.Router({ mergeParams: true })
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth')

const AI_AGENT_BASE = (process.env.AI_AGENT_URL || 'http://localhost:6000') + '/api/v1/agent/internal'
const AI_AGENT_TOKEN = String(process.env.AI_AGENT_INTERNAL_TOKEN || '').trim()

if (!AI_AGENT_TOKEN) {
  throw new Error('AI_AGENT_INTERNAL_TOKEN is required.')
}

function agentHeaders(orgId) {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + AI_AGENT_TOKEN,
    'X-Org-Id': String(orgId),
  }
}

async function proxyRequest(method, path, orgId, body) {
  const opts = { method, headers: agentHeaders(orgId) }
  if (body !== undefined) opts.body = JSON.stringify(body)
  return fetch(AI_AGENT_BASE + path, opts)
}

// GET /api/admin/clients/:clientId/ai-config/keys
router.get('/keys', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const upstream = await proxyRequest('GET', '/keys', req.params.clientId)
    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch {
    res.status(502).json({ error: 'AI-Agent service unavailable' })
  }
})

// POST /api/admin/clients/:clientId/ai-config/keys
router.post('/keys', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const upstream = await proxyRequest('POST', '/keys', req.params.clientId, req.body)
    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch {
    res.status(502).json({ error: 'AI-Agent service unavailable' })
  }
})

// DELETE /api/admin/clients/:clientId/ai-config/keys
router.delete('/keys', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const upstream = await proxyRequest('DELETE', '/keys', req.params.clientId)
    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch {
    res.status(502).json({ error: 'AI-Agent service unavailable' })
  }
})

// PATCH /api/admin/clients/:clientId/ai-config/provider/toggle
router.patch('/provider/toggle', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const upstream = await proxyRequest('PATCH', '/provider/toggle', req.params.clientId, req.body)
    const data = await upstream.json()
    res.status(upstream.status).json(data)
  } catch {
    res.status(502).json({ error: 'AI-Agent service unavailable' })
  }
})

module.exports = router
