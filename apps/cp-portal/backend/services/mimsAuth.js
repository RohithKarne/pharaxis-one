/**
 * MIMS Auth — builds outbound auth headers for an integration config.
 *
 * NEW-D: MIMS bearer tokens expire hourly, so a statically stored token silently
 * kills the integration within the hour (found in browser E2E — CP-000078 failed
 * with HTTP 401 two days after provisioning). For auth_type 'oauth' the config
 * stores the API *client credentials* (api_key = client_id, api_secret =
 * client_secret) and this service exchanges them for a short-lived access token
 * via POST {api_base_url}/oauth/token, cached in-process until just before expiry.
 *
 * Legacy auth types keep their old behaviour:
 *   'bearer' — api_key IS the (static) bearer token
 *   'apikey' — api_key sent as X-API-Key
 */

const { decryptSecret } = require('../utils/secretCrypto');
const { assertSafeOutboundUrl, safeFetch } = require('../utils/networkGuard');
const { pool } = require('../database/db');

// In-process memory fallback
const memoryTokenCache = new Map();

// Refresh 2 minutes before the server-side expiry so in-flight calls never race it.
const EXPIRY_SAFETY_MS = 2 * 60 * 1000;

async function fetchOauthToken(integration) {
  const clientId = decryptSecret(integration.api_key);
  const clientSecret = decryptSecret(integration.api_secret);
  if (!clientId || !clientSecret) throw new Error('OAuth integration is missing client_id/client_secret.');

  const safeBaseUrl = await assertSafeOutboundUrl(integration.api_base_url);
  const r = await safeFetch(new URL('/oauth/token', safeBaseUrl).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  });
  if (!r.ok) throw new Error(`Token request failed (HTTP ${r.status}).`);
  const data = await r.json().catch(() => ({}));
  if (!data.access_token) throw new Error('Token response missing access_token.');

  const ttlMs = Math.max((Number(data.expires_in) || 3600) * 1000 - EXPIRY_SAFETY_MS, 30 * 1000);
  const expiresAt = new Date(Date.now() + ttlMs);

  // Update DB cache
  try {
    await pool.execute(
      `INSERT INTO cp_mims_token_cache (integration_id, access_token, expires_at)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE access_token = VALUES(access_token), expires_at = VALUES(expires_at)`,
      [integration.id, data.access_token, expiresAt]
    );
  } catch (err) {
    // Fallback to process memory if DB update fails transiently
    memoryTokenCache.set(integration.id, { token: data.access_token, expiresAt: expiresAt.getTime() });
  }

  return data.access_token;
}

/**
 * Returns the auth header(s) for this integration, minting/refreshing an OAuth
 * token when needed. Throws on token-fetch failure so callers record failed_sync.
 */
async function getAuthHeaders(integration) {
  if (integration.auth_type === 'oauth') {
    let token = null;

    // Check DB cache first
    try {
      const [[dbToken]] = await pool.execute(
        `SELECT access_token, expires_at FROM cp_mims_token_cache WHERE integration_id = ? AND expires_at > NOW() LIMIT 1`,
        [integration.id]
      );
      if (dbToken?.access_token) {
        token = dbToken.access_token;
      }
    } catch (err) {
      // Memory fallback check
      const cached = memoryTokenCache.get(integration.id);
      if (cached && cached.expiresAt > Date.now()) {
        token = cached.token;
      }
    }

    if (!token) {
      token = await fetchOauthToken(integration);
    }
    return { Authorization: `Bearer ${token}` };
  }
  const apiKey = decryptSecret(integration.api_key);
  if (integration.auth_type === 'bearer' && apiKey) return { Authorization: `Bearer ${apiKey}` };
  if (integration.auth_type === 'apikey' && apiKey) return { 'X-API-Key': apiKey };
  return {};
}

/** Drop a cached token (e.g. after a 401) so the next call mints a fresh one. */
async function invalidateAuth(integrationId) {
  memoryTokenCache.delete(integrationId);
  try {
    await pool.execute(`DELETE FROM cp_mims_token_cache WHERE integration_id = ?`, [integrationId]);
  } catch (err) {
    // Ignore db deletion errors
  }
}

module.exports = { getAuthHeaders, invalidateAuth };
