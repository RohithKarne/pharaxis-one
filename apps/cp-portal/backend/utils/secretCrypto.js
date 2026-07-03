/**
 * utils/secretCrypto.js — At-rest encryption for sensitive config secrets.
 *
 * Encrypts values with AES-256-GCM before they are stored in MySQL
 * (SMTP passwords, integration API keys/secrets, chatbox API keys).
 *
 * Backward-compatible by design:
 *   - encryptSecret() is a no-op for null/empty and for already-encrypted values.
 *   - decryptSecret() returns legacy plaintext values UNCHANGED (they lack the
 *     `enc:v1:` prefix), so existing un-migrated rows keep working with no data
 *     migration required. New writes are encrypted; reads decrypt transparently.
 *
 * Key resolution (CP_SECRET_ENCRYPTION_KEY):
 *   - 64-hex or 32-byte base64 → used directly as the 256-bit key
 *   - any other non-empty string → SHA-256 derived into a 256-bit key
 *   - unset in production → throws (fail closed)
 *   - unset in development/test → deterministic local key + one-time warning
 *     (mirrors the JWT-secret fallback already used in middleware/auth.js)
 */

const crypto = require('crypto')

const PREFIX = 'enc:v1:'
const ALGO = 'aes-256-gcm'

let cachedKey = null
let warned = false

function resolveKey() {
  if (cachedKey) return cachedKey

  const raw = String(process.env.CP_SECRET_ENCRYPTION_KEY || '').trim()
  if (raw) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      cachedKey = Buffer.from(raw, 'hex')
    } else {
      const b64 = Buffer.from(raw, 'base64')
      cachedKey = b64.length === 32 ? b64 : crypto.createHash('sha256').update(raw).digest()
    }
    return cachedKey
  }

  const env = process.env.NODE_ENV || 'development'
  if (env === 'production') {
    throw new Error('CP_SECRET_ENCRYPTION_KEY must be set in production to encrypt stored secrets.')
  }
  if (!warned) {
    console.warn('[secretCrypto] CP_SECRET_ENCRYPTION_KEY not set; using a deterministic local dev key. DO NOT use this in production.')
    warned = true
  }
  cachedKey = crypto.createHash('sha256').update('cp-portal-local-dev-secret-encryption-key').digest()
  return cachedKey
}

/**
 * Encrypt a secret for storage. Returns the value unchanged when it is
 * null/empty or already encrypted, so it is safe to call unconditionally.
 */
function encryptSecret(plain) {
  if (plain === null || plain === undefined || plain === '') return plain
  const s = String(plain)
  if (s.startsWith(PREFIX)) return s // already encrypted — do not double-encrypt

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, resolveKey(), iv)
  const ct = Buffer.concat([cipher.update(s, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return PREFIX + iv.toString('base64') + ':' + tag.toString('base64') + ':' + ct.toString('base64')
}

/**
 * Decrypt a stored secret. Legacy plaintext (no `enc:v1:` prefix) is returned
 * unchanged. On any decryption failure the raw value is returned rather than
 * throwing, so a key/data mismatch degrades the feature instead of crashing.
 */
function decryptSecret(value) {
  if (value === null || value === undefined || value === '') return value
  const s = String(value)
  if (!s.startsWith(PREFIX)) return value // legacy plaintext passthrough

  try {
    const parts = s.slice(PREFIX.length).split(':')
    if (parts.length !== 3) return value
    const iv = Buffer.from(parts[0], 'base64')
    const tag = Buffer.from(parts[1], 'base64')
    const ct = Buffer.from(parts[2], 'base64')
    const decipher = crypto.createDecipheriv(ALGO, resolveKey(), iv)
    decipher.setAuthTag(tag)
    const pt = Buffer.concat([decipher.update(ct), decipher.final()])
    return pt.toString('utf8')
  } catch {
    return value
  }
}

module.exports = { encryptSecret, decryptSecret }
