const express = require('express')
const router = express.Router()
const { internalAuth } = require('../../middleware/internalAuth')
const { encrypt } = require('../../middleware/keyResolver')
const { pool } = require('../../database/db')
const { getAdapter } = require('../../adapters/index')

const PROVIDER_MAP = {
  openai: 'openai',
  claude: 'claude',
  gemini: 'gemini'
}
const PROVIDER_TEST_TIMEOUT_MS = 10000

function normalizeProvider(provider) {
  if (typeof provider !== 'string') return null
  const normalized = provider.trim().toLowerCase()
  return PROVIDER_MAP[normalized] || null
}

function isInvalidApiKeyError(err) {
  const status = Number(err?.status || err?.statusCode || err?.response?.status)
  const message = String(err?.message || '').toLowerCase()

  if (status === 401 || status === 403) return true

  const invalidKeySignals = [
    'invalid api key',
    'incorrect api key',
    'api key not valid',
    'authentication',
    'unauthorized',
    'forbidden',
    'x-api-key'
  ]

  return invalidKeySignals.some(signal => message.includes(signal))
}

function isProviderUnavailableError(err) {
  const status = Number(err?.status || err?.statusCode || err?.response?.status)
  const code = String(err?.code || '').toLowerCase()
  const message = String(err?.message || '').toLowerCase()

  if ([408, 429, 500, 502, 503, 504].includes(status)) return true

  const networkCodes = ['econnrefused', 'econnreset', 'enotfound', 'etimedout', 'eai_again']
  if (networkCodes.includes(code)) return true

  const unavailableSignals = [
    'provider_timeout',
    'timeout',
    'timed out',
    'network',
    'fetch failed',
    'unreachable',
    'service unavailable',
    'gateway'
  ]

  return unavailableSignals.some(signal => message.includes(signal))
}

async function testProviderKey(provider, apiKey) {
  const adapter = getAdapter(provider)

  await Promise.race([
    adapter.query({ apiKey, prompt: 'ping', context: {} }),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('PROVIDER_TIMEOUT')), PROVIDER_TEST_TIMEOUT_MS)
    })
  ])
}

// GET /api/v1/agent/internal/keys — get current key config for org (masked)
router.get('/keys', internalAuth, async (req, res) => {
  try {
    const [[config]] = await pool.execute(
      'SELECT provider, is_active, updated_at FROM ai_agent_org_config WHERE org_id = ?',
      [req.user.orgId]
    )
    if (!config) {
      return res.json({
        configured: false,
        provider: null,
        is_active: false,
        api_key_masked: null,
        updated_at: null
      })
    }

    res.json({
      configured: true,
      provider: config.provider,
      is_active: config.is_active === 1,
      api_key_masked: '••••••••••••••••',
      updated_at: config.updated_at
    })
  } catch {
    res.status(500).json({ error: 'Failed to retrieve configuration' })
  }
})

// POST /api/v1/agent/internal/keys — save or update API key
router.post('/keys', internalAuth, async (req, res) => {
  try {
    const { provider, api_key } = req.body
    if (!provider || !api_key) {
      return res.status(400).json({ error: 'provider and api_key are required' })
    }

    const normalizedProvider = normalizeProvider(provider)
    if (!normalizedProvider) {
      return res.status(400).json({ error: 'Invalid provider. Must be one of: OpenAI, Claude, Gemini' })
    }

    try {
      await testProviderKey(normalizedProvider, api_key)
    } catch (err) {
      if (isProviderUnavailableError(err)) {
        return res.status(503).json({ error: 'Provider unreachable — please retry' })
      }
      if (isInvalidApiKeyError(err)) {
        return res.status(422).json({ error: 'Invalid API key — validation failed' })
      }
      return res.status(422).json({ error: 'Invalid API key — validation failed' })
    }

    const encrypted = encrypt(api_key)

    await pool.execute(
      `INSERT INTO ai_agent_org_config (org_id, provider, api_key_encrypted, is_active)
       VALUES (?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE provider = VALUES(provider), api_key_encrypted = VALUES(api_key_encrypted), updated_at = NOW()`,
      [req.user.orgId, normalizedProvider, encrypted]
    )

    res.json({ success: true, message: 'API key saved successfully' })
  } catch {
    res.status(500).json({ error: 'Failed to save API key configuration' })
  }
})

// DELETE /api/v1/agent/internal/keys — remove key config
router.delete('/keys', internalAuth, async (req, res) => {
  try {
    await pool.execute('DELETE FROM ai_agent_org_config WHERE org_id = ?', [req.user.orgId])
    res.json({ success: true, message: 'API key configuration removed' })
  } catch {
    res.status(500).json({ error: 'Failed to delete API key configuration' })
  }
})

// PATCH /api/v1/agent/internal/provider/toggle — enable or disable AI for org
router.patch('/provider/toggle', internalAuth, async (req, res) => {
  try {
    const { is_active } = req.body
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'is_active must be a boolean' })
    }

    const [[config]] = await pool.execute(
      'SELECT id FROM ai_agent_org_config WHERE org_id = ?',
      [req.user.orgId]
    )
    if (!config) {
      return res.status(404).json({ error: 'No AI configuration found. Add an API key first.' })
    }

    await pool.execute(
      'UPDATE ai_agent_org_config SET is_active = ?, updated_at = NOW() WHERE org_id = ?',
      [is_active ? 1 : 0, req.user.orgId]
    )

    res.json({ success: true, is_active })
  } catch {
    res.status(500).json({ error: 'Failed to update provider configuration' })
  }
})

module.exports = router
