'use strict';

/**
 * services/ssoService.js — OIDC Single Sign-On for the CP Portal.
 *
 * Ported from the MIMS "Signal SSO" service. Supports Microsoft Entra (Azure AD)
 * and Google as OIDC identity providers, configured per client (tenant) in
 * cp_sso_provider_configs. Responsibilities:
 *   - load + decrypt per-client provider config (client secret via secretCrypto)
 *   - build the IdP authorization URL (with nonce + signed state)
 *   - exchange the auth code for tokens at the IdP token endpoint
 *   - verify the returned ID token against the IdP JWKS (jose) and its claims
 *
 * User matching/provisioning and cookie issuance live in routes/portal/auth.js —
 * this service only deals with the OIDC protocol + config, never with sessions.
 *
 * State is a short-lived JWT signed with the portal JWT secret, carrying the
 * clientId/clientCode/provider/nonce/returnTo so the stateless callback can
 * recover its context and pin the nonce.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { pool } = require('../database/db');
const { encryptSecret, decryptSecret } = require('../utils/secretCrypto');
const { PORTAL_SECRET } = require('../middleware/auth');

const FRONTEND_BASE_URL = (process.env.CP_FRONTEND_BASE_URL || 'http://localhost:5174').replace(/\/+$/, '');
const BACKEND_BASE_URL = (process.env.CP_BACKEND_BASE_URL || `http://localhost:${process.env.CP_PORT || 4000}`).replace(/\/+$/, '');

const PROVIDER_LABELS = { google: 'Google', microsoft: 'Microsoft' };
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
    return parseAllowedDomains(JSON.parse(value));
  } catch (_) {
    return String(value || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }
}

function maskSecret(value) {
  const plain = String(value || '').trim();
  if (!plain) return null;
  if (plain.length <= 8) return 'Configured';
  return `${plain.slice(0, 4)}••••${plain.slice(-4)}`;
}

// The IdP redirects here after the user authenticates. Must exactly match the
// redirect URI registered in the client's IdP app. It carries no clientCode —
// the signed state restores that — so a single registered URI serves all clients.
function buildBackendCallbackUrl(providerKey) {
  return `${BACKEND_BASE_URL}/api/portal/auth/sso/${providerKey}/callback`;
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

async function getClientById(clientId) {
  if (!clientId) return null;
  const [[client]] = await pool.execute(
    'SELECT id, name, code, is_active, login_mode FROM cp_clients WHERE id = ? LIMIT 1',
    [clientId]
  );
  return client || null;
}

async function getClientByCode(code) {
  if (!code) return null;
  const [[client]] = await pool.execute(
    'SELECT id, name, code, is_active, login_mode FROM cp_clients WHERE code = ? LIMIT 1',
    [code]
  );
  return client || null;
}

async function getProviderRows(clientId) {
  const [rows] = await pool.execute(
    'SELECT * FROM cp_sso_provider_configs WHERE client_id = ? ORDER BY provider_key ASC',
    [clientId]
  );
  return rows
    .map((row) => ({
      id: row.id,
      client_id: row.client_id,
      provider_key: normalizeProviderKey(row.provider_key),
      provider_type: row.provider_type || 'oidc',
      oidc_client_id: row.oidc_client_id || '',
      client_secret_encrypted: row.client_secret_encrypted || null,
      tenant_id: row.tenant_id || null,
      allowed_domains: parseAllowedDomains(row.allowed_domains),
      is_active: !!row.is_active,
      updated_at: row.updated_at,
    }))
    .filter((row) => row.provider_key);
}

// Public-facing summary (what a login page needs). Never exposes the secret.
function mapProviderSummary(row, clientCode) {
  const providerKey = row.provider_key;
  const configured = !!(row.oidc_client_id && row.client_secret_encrypted);
  return {
    key: providerKey,
    label: PROVIDER_LABELS[providerKey] || providerKey,
    is_active: row.is_active,
    configured,
    startPath: `/api/portal/auth/sso/${providerKey}/start?client_code=${encodeURIComponent(String(clientCode))}`,
  };
}

// Full config incl. decrypted secret + endpoints — server-side use only.
async function getProviderConfig(clientId, providerKey) {
  const normalized = normalizeProviderKey(providerKey);
  if (!normalized || !clientId) return null;
  const rows = await getProviderRows(clientId);
  const row = rows.find((item) => item.provider_key === normalized) || null;
  if (!row) return null;

  const clientSecret = decryptSecret(row.client_secret_encrypted);
  const endpoints = makeProviderEndpoints(normalized, row.tenant_id);
  return {
    key: normalized,
    label: PROVIDER_LABELS[normalized] || normalized,
    providerType: row.provider_type || 'oidc',
    clientId: row.oidc_client_id || '',
    clientSecret: clientSecret || '',
    tenantId: normalized === 'microsoft' ? (row.tenant_id || MICROSOFT_DEFAULT_TENANT) : null,
    allowedDomains: row.allowed_domains || [],
    enabled: !!row.is_active && !!row.oidc_client_id && !!clientSecret,
    callbackUrl: buildBackendCallbackUrl(normalized),
    scopes: ['openid', 'email', 'profile'],
    ...endpoints,
  };
}

// What the login page renders: only active+configured providers, and whether
// local password login is still allowed for this client.
async function getPublicLoginOptions(clientId, clientCode) {
  const client = await getClientById(clientId);
  if (!client || !client.is_active) return null;
  const loginMode = normalizeLoginMode(client.login_mode);
  const rows = await getProviderRows(clientId);
  const providers = rows
    .filter((row) => row.is_active && row.oidc_client_id && row.client_secret_encrypted)
    .map((row) => mapProviderSummary(row, clientCode));
  return {
    client: { id: client.id, name: client.name, code: client.code, login_mode: loginMode },
    local_login_allowed: loginMode !== 'sso_only',
    sso_login_allowed: loginMode !== 'local_only',
    providers,
  };
}

function issueSsoState(payload) {
  return jwt.sign(payload, PORTAL_SECRET, { expiresIn: '10m' });
}

function parseSsoState(token) {
  return jwt.verify(token, PORTAL_SECRET);
}

async function buildAuthorizationUrl(clientId, providerKey, stateToken, nonce, extraScopes = []) {
  const provider = await getProviderConfig(clientId, providerKey);
  if (!provider?.enabled) throw new Error(`SSO provider ${providerKey} is not configured for this portal.`);

  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: provider.callbackUrl,
    response_type: 'code',
    scope: [...provider.scopes, ...extraScopes].join(' '),
    state: stateToken,
    nonce: String(nonce || ''),
  });

  if (provider.key === 'google') {
    params.set('access_type', 'online');
    params.set('include_granted_scopes', 'true');
  } else if (provider.key === 'microsoft') {
    params.set('response_mode', 'query');
    params.set('prompt', 'select_account');
  }

  return `${provider.authorizationEndpoint}?${params.toString()}`;
}

async function exchangeCodeForTokens(clientId, providerKey, code) {
  const provider = await getProviderConfig(clientId, providerKey);
  if (!provider?.enabled) throw new Error(`SSO provider ${providerKey} is not configured for this portal.`);

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

async function verifyIdToken(clientId, providerKey, idToken, nonce) {
  const provider = await getProviderConfig(clientId, providerKey);
  if (!provider?.enabled) throw new Error(`SSO provider ${providerKey} is not configured for this portal.`);

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
    const err = new Error(`Email domain ${emailDomain} is not allowed for this portal.`);
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
    tenantId: payload.tid || null,
    issuer: payload.iss || null,
  };
}

// The frontend URL the callback bounces the browser to once the cookie is set.
function ssoCompleteUrl(clientCode, params = {}) {
  const url = new URL(`${FRONTEND_BASE_URL}/portal/${clientCode}/sso-complete`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  return url.toString();
}

module.exports = {
  // config / discovery
  getClientById,
  getClientByCode,
  getProviderRows,
  getProviderConfig,
  getPublicLoginOptions,
  normalizeLoginMode,
  normalizeProviderKey,
  parseAllowedDomains,
  maskSecret,
  // secret helpers (re-exported for the admin config route)
  encryptSecret,
  decryptSecret,
  // OIDC flow
  issueSsoState,
  parseSsoState,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  verifyIdToken,
  // frontend redirect
  ssoCompleteUrl,
  makeCryptoNonce: () => crypto.randomBytes(16).toString('hex'),
};
