const crypto = require('crypto')
const { query } = require('../database/db')

const SCOPE_KEY = 'global'

const DEFAULT_SETUP = {
  veevaEnabled: 'false',
  veevaBaseUrl: '',
  veevaTokenUrl: '',
  veevaClientId: '',
  veevaClientSecret: '',
  sharePointEnabled: 'false',
  msTenantId: '',
  msClientId: '',
  msClientSecret: '',
  sharePointSiteId: '',
  sharePointDriveId: '',
  ctgLiveEnabled: 'false',
  llmLiveEnabled: 'false',
  openaiModel: 'gpt-4.1-mini',
  openaiApiKey: '',
  erpDeliveryEnabled: 'false',
  erpEndpoint: '',
  erpAuthToken: ''
}

const SECRET_FIELDS = ['veevaClientSecret', 'msClientSecret', 'openaiApiKey', 'erpAuthToken']
const SECRET_MASK = '********'

function normalizeBooleanString(value, fallback = 'false') {
  if (value === true || value === 'true' || value === '1') return 'true'
  if (value === false || value === 'false' || value === '0') return 'false'
  return fallback
}

function sanitizeSettings(input = {}) {
  return {
    veevaEnabled: normalizeBooleanString(input.veevaEnabled, DEFAULT_SETUP.veevaEnabled),
    veevaBaseUrl: String(input.veevaBaseUrl || '').trim(),
    veevaTokenUrl: String(input.veevaTokenUrl || '').trim(),
    veevaClientId: String(input.veevaClientId || '').trim(),
    veevaClientSecret: String(input.veevaClientSecret || ''),
    sharePointEnabled: normalizeBooleanString(input.sharePointEnabled, DEFAULT_SETUP.sharePointEnabled),
    msTenantId: String(input.msTenantId || '').trim(),
    msClientId: String(input.msClientId || '').trim(),
    msClientSecret: String(input.msClientSecret || ''),
    sharePointSiteId: String(input.sharePointSiteId || '').trim(),
    sharePointDriveId: String(input.sharePointDriveId || '').trim(),
    ctgLiveEnabled: normalizeBooleanString(input.ctgLiveEnabled, DEFAULT_SETUP.ctgLiveEnabled),
    llmLiveEnabled: normalizeBooleanString(input.llmLiveEnabled, DEFAULT_SETUP.llmLiveEnabled),
    openaiModel: String(input.openaiModel || DEFAULT_SETUP.openaiModel).trim(),
    openaiApiKey: String(input.openaiApiKey || ''),
    erpDeliveryEnabled: normalizeBooleanString(input.erpDeliveryEnabled, DEFAULT_SETUP.erpDeliveryEnabled),
    erpEndpoint: String(input.erpEndpoint || '').trim(),
    erpAuthToken: String(input.erpAuthToken || '')
  }
}

function splitPublicAndSecret(settings) {
  const publicConfig = {}
  const secretConfig = {}

  for (const [key, value] of Object.entries(settings)) {
    if (SECRET_FIELDS.includes(key)) {
      secretConfig[key] = value
    } else {
      publicConfig[key] = value
    }
  }

  return { publicConfig, secretConfig }
}

function getEncryptionKey() {
  const raw = process.env.INTEGRATION_CONFIG_SECRET_KEY || 'ieg_integration_dev_secret_key_change_me'
  return crypto.createHash('sha256').update(raw).digest()
}

function encryptSecretPayload(secretObj) {
  const payload = JSON.stringify(secretObj || {})
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`
}

function decryptSecretPayload(value) {
  if (!value) return {}

  const [ivB64, tagB64, encryptedB64] = String(value).split('.')
  if (!ivB64 || !tagB64 || !encryptedB64) return {}

  const key = getEncryptionKey()
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const encrypted = Buffer.from(encryptedB64, 'base64')

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
  try {
    return JSON.parse(decrypted)
  } catch (_error) {
    return {}
  }
}

function buildSecretMeta(secretObj) {
  return SECRET_FIELDS.reduce((acc, field) => {
    acc[field] = Boolean(secretObj[field])
    return acc
  }, {})
}

function normalizeIncomingSecretValue(value) {
  if (value === undefined || value === null) return ''
  return String(value)
}

function mergeSecretValues(existingSecrets, incomingSettings) {
  const next = { ...(existingSecrets || {}) }

  for (const field of SECRET_FIELDS) {
    const incoming = normalizeIncomingSecretValue(incomingSettings[field])

    if (incoming === '__CLEAR__') {
      delete next[field]
      continue
    }

    if (!incoming || incoming === SECRET_MASK) {
      continue
    }

    next[field] = incoming
  }

  return next
}

function maskSecretsForClient(settings, secretMeta) {
  const masked = { ...settings }
  for (const field of SECRET_FIELDS) {
    masked[field] = secretMeta[field] ? SECRET_MASK : ''
  }
  return masked
}

async function getExistingRow() {
  const result = await query(`SELECT * FROM ieg_integration_settings WHERE scope_key = $1 LIMIT 1`, [SCOPE_KEY])
  return result.rows[0] || null
}

async function loadIntegrationSetup() {
  const row = await getExistingRow()
  if (!row) {
    const secretMeta = buildSecretMeta({})
    return {
      settings: maskSecretsForClient(DEFAULT_SETUP, secretMeta),
      secretMeta,
      version: 0
    }
  }

  const publicConfig = row.public_config || {}
  const secretConfig = decryptSecretPayload(row.encrypted_secret)
  const secretMeta = buildSecretMeta(secretConfig)

  const merged = {
    ...DEFAULT_SETUP,
    ...publicConfig
  }

  return {
    settings: maskSecretsForClient(merged, secretMeta),
    secretMeta,
    version: Number(row.version || 1)
  }
}

async function saveIntegrationSetup({ settingsInput, updatedBy }) {
  const sanitized = sanitizeSettings(settingsInput)
  const existing = await getExistingRow()
  const existingSecrets = existing ? decryptSecretPayload(existing.encrypted_secret) : {}
  const mergedSecrets = mergeSecretValues(existingSecrets, sanitized)

  const { publicConfig } = splitPublicAndSecret(sanitized)
  const encryptedSecret = encryptSecretPayload(mergedSecrets)

  if (!existing) {
    await query(
      `
        INSERT INTO ieg_integration_settings
        (scope_key, public_config, encrypted_secret, version, updated_by)
        VALUES ($1, $2::jsonb, $3, 1, $4)
      `,
      [SCOPE_KEY, JSON.stringify(publicConfig), encryptedSecret, updatedBy]
    )
  } else {
    await query(
      `
        UPDATE ieg_integration_settings
        SET public_config = $1::jsonb,
            encrypted_secret = $2,
            version = version + 1,
            updated_by = $3
        WHERE id = $4
      `,
      [JSON.stringify(publicConfig), encryptedSecret, updatedBy, existing.id]
    )
  }

  return loadIntegrationSetup()
}

module.exports = {
  loadIntegrationSetup,
  saveIntegrationSetup,
  SECRET_FIELDS,
  SECRET_MASK,
  DEFAULT_SETUP
}
