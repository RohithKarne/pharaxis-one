const crypto = require('crypto')
const { pool } = require('../database/db')

const AUTH_POLICY_CONFIG_KEY = 'auth_policy_v1'

const DEFAULT_AUTH_POLICY = {
  mfa_mode: 'off',
  session_hours: 8,
  sso_enabled: false,
  sso_provider: '',
  sso_entrypoint: '',
  sso_entity_id: ''
}

function normalizeMfaMode(value) {
  const mode = String(value || '').toLowerCase()
  if (['off', 'optional', 'required'].includes(mode)) return mode
  return DEFAULT_AUTH_POLICY.mfa_mode
}

function clampSessionHours(value) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed)) return DEFAULT_AUTH_POLICY.session_hours
  return Math.min(24, Math.max(1, parsed))
}

function sanitizeAuthPolicy(payload) {
  return {
    mfa_mode: normalizeMfaMode(payload?.mfa_mode),
    session_hours: clampSessionHours(payload?.session_hours),
    sso_enabled: Boolean(payload?.sso_enabled),
    sso_provider: String(payload?.sso_provider || '').trim().slice(0, 100),
    sso_entrypoint: String(payload?.sso_entrypoint || '').trim().slice(0, 500),
    sso_entity_id: String(payload?.sso_entity_id || '').trim().slice(0, 500)
  }
}

async function getOrgAuthPolicy(orgId) {
  const [[row]] = await pool.execute(
    `SELECT config_value
     FROM org_config
     WHERE org_id = ? AND config_key = ?
     LIMIT 1`,
    [orgId, AUTH_POLICY_CONFIG_KEY]
  )

  if (!row?.config_value) return { ...DEFAULT_AUTH_POLICY }
  try {
    const parsed = JSON.parse(row.config_value)
    return sanitizeAuthPolicy(parsed)
  } catch {
    return { ...DEFAULT_AUTH_POLICY }
  }
}

async function setOrgAuthPolicy(orgId, payload) {
  const policy = sanitizeAuthPolicy(payload)
  await pool.execute(
    `INSERT INTO org_config (org_id, config_key, config_value)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
    [orgId, AUTH_POLICY_CONFIG_KEY, JSON.stringify(policy)]
  )
  return policy
}

async function createMfaChallenge({ orgId, userId, userType, ipAddress }) {
  const ttlMinutes = Math.min(30, Math.max(3, Number.parseInt(process.env.MFA_CHALLENGE_TTL_MINUTES || '10', 10)))
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000)
  const challengeToken = `mfa_${crypto.randomBytes(20).toString('hex')}`
  const oneTimeCode = `${Math.floor(100000 + Math.random() * 900000)}`

  await pool.execute(
    `INSERT INTO auth_mfa_challenges
       (org_id, user_id, user_type, challenge_token, one_time_code, expires_at, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [orgId ?? null, userId, userType, challengeToken, oneTimeCode, expiresAt, ipAddress || null]
  )

  return {
    challengeToken,
    expiresInSeconds: ttlMinutes * 60,
    devCode: process.env.NODE_ENV === 'production' ? undefined : oneTimeCode
  }
}

async function verifyMfaChallenge({ orgId, userId, userType, challengeToken, code }) {
  const [[row]] = await pool.execute(
    `SELECT id, one_time_code, expires_at, consumed_at
     FROM auth_mfa_challenges
     WHERE org_id <=> ?
       AND user_id = ?
       AND user_type = ?
       AND challenge_token = ?
     ORDER BY id DESC
     LIMIT 1`,
    [orgId ?? null, userId, userType, challengeToken]
  )

  if (!row) return { ok: false, error: 'MFA challenge not found' }
  if (row.consumed_at) return { ok: false, error: 'MFA challenge already used' }

  const now = Date.now()
  const expiresAt = new Date(row.expires_at).getTime()
  if (!Number.isFinite(expiresAt) || expiresAt < now) {
    return { ok: false, error: 'MFA challenge expired' }
  }
  if (String(code || '').trim() !== String(row.one_time_code || '').trim()) {
    return { ok: false, error: 'Invalid MFA code' }
  }

  await pool.execute(
    `UPDATE auth_mfa_challenges
     SET consumed_at = NOW()
     WHERE id = ?`,
    [row.id]
  )
  return { ok: true }
}

module.exports = {
  AUTH_POLICY_CONFIG_KEY,
  DEFAULT_AUTH_POLICY,
  sanitizeAuthPolicy,
  getOrgAuthPolicy,
  setOrgAuthPolicy,
  createMfaChallenge,
  verifyMfaChallenge
}
