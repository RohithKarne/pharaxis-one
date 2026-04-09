const crypto = require('crypto')
const { pool } = require('../database/db')

const ALGORITHM = 'aes-256-cbc'
const KEY = Buffer.from(process.env.AI_AGENT_ENCRYPTION_KEY || '0'.repeat(64), 'hex')
const VALID_APP_SOURCES = ['cp_portal', 'mims', 'vault', 'qms', 'safety', 'external']
const VALID_PROVIDERS = ['openai', 'claude', 'gemini']

function encrypt(plaintext) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`
}

function decrypt(ciphertext) {
  const [ivHex, encryptedHex] = String(ciphertext || '').split(':')
  if (!ivHex || !encryptedHex) {
    throw new Error('Invalid encrypted API key format')
  }

  const iv = Buffer.from(ivHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

function normalizeProvider(provider) {
  return VALID_PROVIDERS.includes(provider) ? provider : 'openai'
}

function normalizeAppSource(appSource) {
  return VALID_APP_SOURCES.includes(appSource) ? appSource : 'external'
}

function normalizeQueryType(queryType) {
  if (typeof queryType === 'string' && queryType.trim()) {
    return queryType.trim()
  }
  return 'unknown'
}

async function logFailure({ orgId, appSource, queryType, provider, status = 'failed' }) {
  try {
    if (!orgId) return

    await pool.execute(
      `INSERT INTO ai_agent_usage_log (org_id, app_source, query_type, tokens_in, tokens_out, provider, response_latency_ms, status)
       VALUES (?, ?, ?, 0, 0, ?, 0, ?)`,
      [
        Number(orgId),
        normalizeAppSource(appSource),
        normalizeQueryType(queryType),
        normalizeProvider(provider),
        status
      ]
    )
  } catch {
    // Usage logging must not break middleware flow.
  }
}

async function resolveKey(req, res, next) {
  try {
    const orgId = req.body?.org_id
    if (!orgId) {
      await logFailure({
        orgId: req.user?.orgId,
        appSource: req.body?.app_source,
        queryType: req.body?.query_type
      })
      return res.status(400).json({ message: 'org_id is required' })
    }

    const [rows] = await pool.execute(
      'SELECT provider, api_key_encrypted, is_active FROM ai_agent_org_config WHERE org_id = ? LIMIT 1',
      [orgId]
    )

    const config = rows[0]
    if (!config) {
      await logFailure({
        orgId,
        appSource: req.body?.app_source,
        queryType: req.body?.query_type
      })
      return res.status(404).json({ message: 'AI not configured for this organisation' })
    }

    if (Number(config.is_active) === 0) {
      await logFailure({
        orgId,
        appSource: req.body?.app_source,
        queryType: req.body?.query_type,
        provider: config.provider
      })
      return res.status(403).json({ message: 'AI features are currently disabled for this organisation' })
    }

    req.agentKey = decrypt(config.api_key_encrypted)
    req.agentProvider = config.provider
    return next()
  } catch {
    await logFailure({
      orgId: req.body?.org_id || req.user?.orgId,
      appSource: req.body?.app_source,
      queryType: req.body?.query_type
    })
    return res.status(500).json({ message: 'Failed to resolve agent configuration' })
  }
}

module.exports = { resolveKey, encrypt, decrypt }
