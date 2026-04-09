const crypto = require('crypto')
const { pool } = require('../database/db')

const ALGORITHM = 'aes-256-cbc'
const KEY = Buffer.from(process.env.AI_AGENT_ENCRYPTION_KEY || '0'.repeat(64), 'hex') // 32 bytes hex

function encrypt(plaintext) {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

function decrypt(ciphertext) {
  const [ivHex, encHex] = ciphertext.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const encrypted = Buffer.from(encHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

// Middleware: resolves and decrypts the org API key into req.agentKey
// Decrypted key lives in memory only — never passed to logger or response
async function resolveKey(req, res, next) {
  try {
    const orgId = req.body.org_id || req.user?.orgId
    if (!orgId) return res.status(400).json({ error: 'org_id is required' })

    const [[config]] = await pool.execute(
      'SELECT provider, api_key_encrypted, is_active FROM ai_agent_org_config WHERE org_id = ?',
      [orgId]
    )

    if (!config) {
      return res.status(404).json({ error: 'AI not configured for this organisation' })
    }
    if (!config.is_active) {
      return res.status(403).json({ error: 'AI features are currently disabled for this organisation' })
    }

    // Decrypt in memory — not logged, not returned
    req.agentKey = decrypt(config.api_key_encrypted)
    req.agentProvider = config.provider
    next()
  } catch (err) {
    return res.status(500).json({ error: 'Failed to resolve agent configuration' })
  }
}

module.exports = { resolveKey, encrypt, decrypt }
