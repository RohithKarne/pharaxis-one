'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../database/db');
const JWT_SECRET = require('../utils/jwtSecret');

const DEFAULT_FRONTEND_BASE_URL = process.env.MIMS_FRONTEND_BASE_URL || 'http://localhost:5173/mims';
const DEFAULT_BACKEND_BASE_URL = process.env.MIMS_BACKEND_BASE_URL || 'http://localhost:3000';
const DEFAULT_ALLOWED_FRONTEND_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];
const PROVIDER_LABELS = {
  google: 'Google',
  microsoft: 'Microsoft',
};
const MICROSOFT_DEFAULT_TENANT = 'common';

let josePromise = null;
let nodeFetchPromise = null;

async function loadJose() {
  if (!josePromise) josePromise = import('jose');
  return josePromise;
}

async function fetchUrl(url, options) {
  if (typeof globalThis.fetch === 'function') return globalThis.fetch(url, options);
  if (!nodeFetchPromise) nodeFetchPromise = import('node-fetch');
  const mod = await nodeFetchPromise;
  return (mod.default || mod)(url, options);
}

function normalizeProviderKey(providerKey) {
  const key = String(providerKey || '').trim().toLowerCase();
  if (key === 'google') return 'google';
  if (key === 'microsoft') return 'microsoft';
  return null;
}

function normalizeLoginMode(value) {
  const key = String(value || '').trim().toLowerCase();
  if (['local_only', 'local', 'password'].includes(key)) return 'local_only';
  if (['sso_only', 'sso'].includes(key)) return 'sso_only';
  if (['local_and_sso', 'mixed', 'hybrid'].includes(key)) return 'local_and_sso';
  return 'local_only';
}

function parseAllowedDomains(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))];
  }
  try {
    const parsed = JSON.parse(value);
    return parseAllowedDomains(parsed);
  } catch (_) {
    return String(value || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }
}

function getAllowedFrontendOrigins() {
  const extra = String(process.env.MIMS_ALLOWED_FRONTEND_ORIGINS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_FRONTEND_ORIGINS, ...extra]);
}

function sanitizeReturnTo(rawValue, fallbackPath = '/auth/sso-complete') {
  const fallbackUrl = new URL(fallbackPath, `${DEFAULT_FRONTEND_BASE_URL.replace(/\/+$/, '')}/`);
  if (!rawValue) return fallbackUrl.toString();

  const value = String(rawValue || '').trim();
  try {
    const parsed = new URL(value);
    if (!getAllowedFrontendOrigins().has(parsed.origin)) return fallbackUrl.toString();
    if (!parsed.pathname.startsWith('/mims')) return fallbackUrl.toString();
    return parsed.toString();
  } catch (_) {
    if (!value.startsWith('/mims')) return fallbackUrl.toString();
    return new URL(value, DEFAULT_FRONTEND_BASE_URL).toString();
  }
}

function buildBackendCallbackUrl(providerKey) {
  return `${DEFAULT_BACKEND_BASE_URL.replace(/\/+$/, '')}/api/auth/sso/${providerKey}/callback`;
}

// Resolve the dedicated SSO config encryption key. Fail closed in production if
// it is missing — no fallback to JWT_SECRET or a hardcoded constant. The shipped
// .env sets SSO_CONFIG_ENCRYPTION_KEY, so this only bites a misconfigured deploy.
function getSsoEncryptionKeyMaterial() {
  const configured = String(process.env.SSO_CONFIG_ENCRYPTION_KEY || '').trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SSO_CONFIG_ENCRYPTION_KEY must be set in production to encrypt/decrypt SSO client secrets.'
    );
  }
  // Dev/test only: without a dedicated key, refuse to encrypt/decrypt rather than
  // silently deriving from JWT_SECRET or a constant. Surface a clear error.
  throw new Error(
    'SSO_CONFIG_ENCRYPTION_KEY is not set. Add it to your environment (.env) to manage SSO secrets.'
  );
}

function deriveEncryptionKey() {
  return crypto.createHash('sha256').update(getSsoEncryptionKeyMaterial()).digest();
}

// Read-compatibility only: keys previously used to encrypt SSO secrets before a
// dedicated key was introduced. Used solely to decrypt legacy DB rows; new writes
// always use deriveEncryptionKey(). Never includes the removed 'mims-sso' constant.
function legacyDecryptionKeys() {
  const keys = [];
  const seen = new Set();
  const push = (material) => {
    const base = String(material || '').trim();
    if (!base || seen.has(base)) return;
    seen.add(base);
    keys.push(crypto.createHash('sha256').update(base).digest());
  };
  push(process.env.JWT_SECRET);
  push(JWT_SECRET);
  return keys;
}

function encryptSecret(value) {
  const plain = String(value || '').trim();
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

function decryptWithKey(key, ivB64, tagB64, encryptedB64) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function decryptSecret(value) {
  const payload = String(value || '').trim();
  if (!payload) return null;
  const [ivB64, tagB64, encryptedB64] = payload.split('.');
  if (!ivB64 || !tagB64 || !encryptedB64) return null;

  // Prefer the dedicated key. Fall back to legacy JWT_SECRET-derived keys only to
  // read rows encrypted before the dedicated key existed (GCM auth tag guards
  // against a wrong key producing garbage — a mismatch throws instead).
  try {
    return decryptWithKey(deriveEncryptionKey(), ivB64, tagB64, encryptedB64);
  } catch (primaryErr) {
    for (const key of legacyDecryptionKeys()) {
      try {
        return decryptWithKey(key, ivB64, tagB64, encryptedB64);
      } catch (_) {
        // try next legacy key
      }
    }
    throw primaryErr;
  }
}

function maskSecret(value) {
  const plain = String(value || '').trim();
  if (!plain) return null;
  if (plain.length <= 8) return 'Configured';
  return `${plain.slice(0, 4)}••••${plain.slice(-4)}`;
}

async function getOrgIdentityConfig(orgId) {
  if (!orgId) return null;
  const [[org]] = await pool.execute(
    `SELECT id, name, is_active, login_mode
       FROM organisations
      WHERE id = ?
      LIMIT 1`,
    [orgId]
  );
  if (!org) return null;

  const [providerRows] = await pool.execute(
    `SELECT *
       FROM access_sso_provider_configs
      WHERE org_id = ?
      ORDER BY provider_key ASC`,
    [orgId]
  );

  return {
    org: {
      ...org,
      login_mode: normalizeLoginMode(org.login_mode),
    },
    providers: providerRows.map((row) => ({
      id: row.id,
      org_id: row.org_id,
      provider_key: normalizeProviderKey(row.provider_key),
      provider_type: row.provider_type || 'oidc',
      client_id: row.client_id || '',
      client_secret_encrypted: row.client_secret_encrypted || null,
      tenant_id: row.tenant_id || null,
      allowed_domains: parseAllowedDomains(row.allowed_domains),
      is_active: !!row.is_active,
      updated_by: row.updated_by || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    })).filter((row) => row.provider_key),
  };
}

function makeProviderEndpoints(providerKey, tenantId) {
  if (providerKey === 'google') {
    return {
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    };
  }
  const effectiveTenant = String(tenantId || MICROSOFT_DEFAULT_TENANT).trim() || MICROSOFT_DEFAULT_TENANT;
  return {
    authorizationEndpoint: `https://login.microsoftonline.com/${effectiveTenant}/oauth2/v2.0/authorize`,
    tokenEndpoint: `https://login.microsoftonline.com/${effectiveTenant}/oauth2/v2.0/token`,
    jwksUri: `https://login.microsoftonline.com/${effectiveTenant}/discovery/v2.0/keys`,
  };
}

function mapProviderSummary(row, orgId, includeSecretStatus = false) {
  const providerKey = normalizeProviderKey(row.provider_key);
  const configured = !!(row.client_id && row.client_secret_encrypted);
  const summary = {
    key: providerKey,
    label: PROVIDER_LABELS[providerKey] || providerKey,
    provider_type: row.provider_type || 'oidc',
    client_id: row.client_id || '',
    tenant_id: providerKey === 'microsoft' ? (row.tenant_id || MICROSOFT_DEFAULT_TENANT) : '',
    allowed_domains: parseAllowedDomains(row.allowed_domains),
    is_active: !!row.is_active,
    configured,
    loginPath: `/api/auth/sso/${providerKey}/start?org_id=${encodeURIComponent(String(orgId))}`,
    linkPath: `/api/auth/sso/${providerKey}/link/start`,
    microsoftClientId: providerKey === 'microsoft' ? (row.client_id || '') : null,
    updated_at: row.updated_at || null,
  };
  if (includeSecretStatus) {
    summary.client_secret_masked = configured ? maskSecret(decryptSecret(row.client_secret_encrypted)) : null;
    summary.client_secret_configured = !!row.client_secret_encrypted;
  }
  return summary;
}

async function getOrgSsoPolicy(orgId) {
  const config = await getOrgIdentityConfig(orgId);
  if (!config) return null;
  return {
    org: {
      ...config.org,
      local_login_allowed: normalizeLoginMode(config.org.login_mode) !== 'sso_only',
      sso_login_allowed: normalizeLoginMode(config.org.login_mode) !== 'local_only',
    },
    providers: config.providers.map((row) => mapProviderSummary(row, orgId, true)),
  };
}

async function saveOrgSsoPolicy(orgId, payload = {}, actorId = null) {
  const loginMode = normalizeLoginMode(payload.login_mode);
  await pool.execute(
    'UPDATE organisations SET login_mode = ?, updated_at = NOW() WHERE id = ?',
    [loginMode, orgId]
  );

  const providers = Array.isArray(payload.providers) ? payload.providers : [];
  for (const item of providers) {
    const providerKey = normalizeProviderKey(item.provider_key);
    if (!providerKey) continue;

    const [[existing]] = await pool.execute(
      'SELECT id, client_secret_encrypted FROM access_sso_provider_configs WHERE org_id = ? AND provider_key = ? LIMIT 1',
      [orgId, providerKey]
    );

    const nextSecret = String(item.client_secret || '').trim()
      ? encryptSecret(item.client_secret)
      : (existing?.client_secret_encrypted || null);

    await pool.execute(
      `INSERT INTO access_sso_provider_configs
         (org_id, provider_key, provider_type, client_id, client_secret_encrypted, tenant_id, allowed_domains, is_active, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         provider_type = VALUES(provider_type),
         client_id = VALUES(client_id),
         client_secret_encrypted = VALUES(client_secret_encrypted),
         tenant_id = VALUES(tenant_id),
         allowed_domains = VALUES(allowed_domains),
         is_active = VALUES(is_active),
         updated_by = VALUES(updated_by),
         updated_at = NOW()`,
      [
        orgId,
        providerKey,
        item.provider_type || 'oidc',
        String(item.client_id || '').trim() || null,
        nextSecret,
        providerKey === 'microsoft'
          ? (String(item.tenant_id || MICROSOFT_DEFAULT_TENANT).trim() || MICROSOFT_DEFAULT_TENANT)
          : null,
        JSON.stringify(parseAllowedDomains(item.allowed_domains)),
        item.is_active ? 1 : 0,
        actorId,
      ]
    );
  }

  return getOrgSsoPolicy(orgId);
}

async function getPublicLoginOrgs() {
  const [rows] = await pool.execute(
    `SELECT id, name, login_mode
       FROM organisations
      WHERE is_active = 1
      ORDER BY name ASC`
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    login_mode: normalizeLoginMode(row.login_mode),
  }));
}

async function getPublicLoginOptions(orgId) {
  const policy = await getOrgSsoPolicy(orgId);
  if (!policy?.org || !policy.org.is_active) return null;
  const providers = policy.providers.filter((provider) => provider.is_active && provider.configured);
  const loginMode = normalizeLoginMode(policy.org.login_mode);
  return {
    org: {
      id: policy.org.id,
      name: policy.org.name,
      login_mode: loginMode,
    },
    local_login_allowed: loginMode !== 'sso_only',
    sso_login_allowed: loginMode !== 'local_only',
    providers,
  };
}

async function listEnabledProviders(orgId) {
  const options = await getPublicLoginOptions(orgId);
  return options?.providers || [];
}

async function getProviderConfig(orgId, providerKey) {
  const normalized = normalizeProviderKey(providerKey);
  if (!normalized || !orgId) return null;
  const config = await getOrgIdentityConfig(orgId);
  const row = config?.providers?.find((item) => item.provider_key === normalized) || null;
  if (!row) return null;

  const clientSecret = decryptSecret(row.client_secret_encrypted);
  const endpoints = makeProviderEndpoints(normalized, row.tenant_id);
  return {
    key: normalized,
    label: PROVIDER_LABELS[normalized] || normalized,
    providerType: row.provider_type || 'oidc',
    clientId: row.client_id || '',
    clientSecret: clientSecret || '',
    tenantId: normalized === 'microsoft' ? (row.tenant_id || MICROSOFT_DEFAULT_TENANT) : null,
    allowedDomains: parseAllowedDomains(row.allowed_domains),
    enabled: !!row.is_active && !!row.client_id && !!clientSecret,
    callbackUrl: buildBackendCallbackUrl(normalized),
    scopes: ['openid', 'email', 'profile'],
    ...endpoints,
  };
}

function issueSsoState(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '10m' });
}

function parseSsoState(token) {
  return jwt.verify(token, JWT_SECRET);
}

async function buildAuthorizationUrl(orgId, providerKey, stateToken, returnTo, extraScopes = []) {
  const provider = await getProviderConfig(orgId, providerKey);
  if (!provider?.enabled) throw new Error(`SSO provider ${providerKey} is not configured for this organisation.`);

  const nonce = jwt.decode(stateToken)?.nonce || '';
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: provider.callbackUrl,
    response_type: 'code',
    scope: [...provider.scopes, ...extraScopes].join(' '),
    state: stateToken,
    nonce,
  });

  if (provider.key === 'google') {
    params.set('access_type', 'online');
    params.set('include_granted_scopes', 'true');
    // No `prompt` param: a single, already-consented Google account flows
    // straight through. Google still shows the account chooser automatically
    // when it's genuinely needed (multiple sessions or first-time consent).
  } else if (provider.key === 'microsoft') {
    params.set('response_mode', 'query');
    params.set('prompt', 'select_account');
  }

  return {
    url: `${provider.authorizationEndpoint}?${params.toString()}`,
    returnTo: sanitizeReturnTo(returnTo),
  };
}

async function exchangeCodeForTokens(orgId, providerKey, code) {
  const provider = await getProviderConfig(orgId, providerKey);
  if (!provider?.enabled) throw new Error(`SSO provider ${providerKey} is not configured for this organisation.`);

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(code || ''),
    redirect_uri: provider.callbackUrl,
    client_id: provider.clientId,
    client_secret: provider.clientSecret,
  });

  const res = await fetchUrl(provider.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error_description || payload.error || `Failed to exchange ${providerKey} auth code.`);
  }
  if (!payload.id_token) throw new Error(`${provider.label} did not return an ID token.`);
  return payload;
}

function validateIssuer(providerKey, issuer) {
  const value = String(issuer || '');
  if (providerKey === 'google') {
    return value === 'https://accounts.google.com' || value === 'accounts.google.com';
  }
  return value.startsWith('https://login.microsoftonline.com/') || value.startsWith('https://login.live.com');
}

async function verifyIdToken(orgId, providerKey, idToken, nonce) {
  const provider = await getProviderConfig(orgId, providerKey);
  if (!provider?.enabled) throw new Error(`SSO provider ${providerKey} is not configured for this organisation.`);

  const { createRemoteJWKSet, jwtVerify } = await loadJose();
  const jwks = createRemoteJWKSet(new URL(provider.jwksUri));
  const { payload } = await jwtVerify(idToken, jwks, {
    audience: provider.clientId,
    nonce: String(nonce || ''),
    clockTolerance: 5,
  });

  if (!validateIssuer(providerKey, payload.iss)) {
    throw new Error(`Unexpected ${provider.label} token issuer.`);
  }

  const email = String(payload.email || payload.preferred_username || '').trim().toLowerCase();
  if (!email) throw new Error(`${provider.label} account did not provide an email address.`);

  const allowedDomains = provider.allowedDomains || [];
  const emailDomain = email.includes('@') ? email.split('@')[1].toLowerCase() : '';
  if (allowedDomains.length > 0 && emailDomain && !allowedDomains.includes(emailDomain)) {
    const err = new Error(`Email domain ${emailDomain} is not allowed for this organisation.`);
    err.code = 'DOMAIN_NOT_ALLOWED';
    throw err;
  }

  return {
    providerKey: provider.key,
    providerLabel: provider.label,
    subject: String(payload.sub || ''),
    email,
    emailVerified: payload.email_verified !== false,
    name: String(payload.name || email.split('@')[0] || provider.label).trim(),
    picture: payload.picture || null,
    tenantId: payload.tid || null,
    issuer: payload.iss || null,
    profile: payload,
  };
}

module.exports = {
  buildAuthorizationUrl,
  encryptSecret,
  exchangeCodeForTokens,
  getOrgSsoPolicy,
  getProviderConfig,
  getPublicLoginOptions,
  getPublicLoginOrgs,
  issueSsoState,
  listEnabledProviders,
  normalizeLoginMode,
  normalizeProviderKey,
  parseAllowedDomains,
  parseSsoState,
  sanitizeReturnTo,
  saveOrgSsoPolicy,
  verifyIdToken,
};
