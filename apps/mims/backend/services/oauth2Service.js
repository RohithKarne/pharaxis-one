'use strict';

const pool = require('../database/db');

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

function parseConfig(rawConfig) {
  if (!rawConfig) return null;
  if (typeof rawConfig === 'string') {
    try {
      return JSON.parse(rawConfig);
    } catch (_error) {
      return null;
    }
  }
  if (typeof rawConfig === 'object') {
    return rawConfig;
  }
  return null;
}

async function storeToken(orgId, integrationType, { accessToken, refreshToken, expiresInSeconds }) {
  try {
    const ttl = Number(expiresInSeconds) > 0 ? Number(expiresInSeconds) : 3600;

    await pool.query(
      `INSERT INTO oauth2_tokens (org_id, integration_type, access_token, refresh_token, expires_at)
       VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))
       ON DUPLICATE KEY UPDATE
         access_token = VALUES(access_token),
         refresh_token = VALUES(refresh_token),
         expires_at = VALUES(expires_at),
         updated_at = NOW()`,
      [orgId, integrationType, accessToken, refreshToken || null, ttl]
    );
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function refreshToken(orgId, integrationType) {
  try {
    const [integrationRows] = await pool.query(
      'SELECT config FROM org_integrations WHERE org_id = ? AND integration_type = ? LIMIT 1',
      [orgId, integrationType]
    );

    if (!integrationRows || integrationRows.length === 0) {
      throw new Error(`[oauth2Service] No integration config found for org ${orgId} type ${integrationType}`);
    }

    const config = parseConfig(integrationRows[0].config);
    if (!config) {
      throw new Error(`[oauth2Service] No integration config found for org ${orgId} type ${integrationType}`);
    }

    let endpoint;
    let body;
    let accessToken;
    let newRefreshToken = null;
    let expiresInSeconds = 3600;

    if (integrationType === 'salesforce') {
      const [tokenRows] = await pool.query(
        'SELECT refresh_token FROM oauth2_tokens WHERE org_id = ? AND integration_type = ? LIMIT 1',
        [orgId, integrationType]
      );
      const existingRefreshToken = tokenRows && tokenRows.length ? tokenRows[0].refresh_token : null;

      endpoint = `${config.domain}/services/oauth2/token`;
      if (existingRefreshToken) {
        body = new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: String(config.clientId || config.client_id || ''),
          client_secret: String(config.clientSecret || config.client_secret || ''),
          refresh_token: String(existingRefreshToken),
        }).toString();
      } else {
        body = new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: String(config.clientId || config.client_id || ''),
          client_secret: String(config.clientSecret || config.client_secret || ''),
        }).toString();
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      if (!res.ok) {
        throw new Error(`[oauth2Service] ${integrationType} token fetch failed: HTTP ${res.status}`);
      }

      const tokenResponse = await res.json();
      accessToken = tokenResponse.access_token;
      newRefreshToken = tokenResponse.refresh_token || existingRefreshToken || null;
      expiresInSeconds = Number(tokenResponse.expires_in) > 0 ? Number(tokenResponse.expires_in) : 3600;
    } else if (integrationType === 'ms_dynamics') {
      endpoint = `https://login.microsoftonline.com/${config.tenantId || config.tenant_id}/oauth2/v2.0/token`;
      body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: String(config.clientId || config.client_id || ''),
        client_secret: String(config.clientSecret || config.client_secret || ''),
        scope: String(config.scope || ''),
      }).toString();

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      if (!res.ok) {
        throw new Error(`[oauth2Service] ${integrationType} token fetch failed: HTTP ${res.status}`);
      }

      const tokenResponse = await res.json();
      accessToken = tokenResponse.access_token;
      newRefreshToken = null;
      expiresInSeconds = Number(tokenResponse.expires_in) > 0 ? Number(tokenResponse.expires_in) : 3600;
    } else if (integrationType === 'veeva_vault' || integrationType === 'veeva_crm') {
      endpoint = `${config.domain}/api/${config.apiVersion || config.api_version}/auth`;
      body = new URLSearchParams({
        username: String(config.username || ''),
        password: String(config.password || ''),
      }).toString();

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });

      if (!res.ok) {
        throw new Error(`[oauth2Service] ${integrationType} token fetch failed: HTTP ${res.status}`);
      }

      const tokenResponse = await res.json();
      accessToken = tokenResponse.sessionId;
      newRefreshToken = null;
      expiresInSeconds = 3600;
    } else {
      throw new Error(`[oauth2Service] Unsupported integration type ${integrationType}`);
    }

    if (!accessToken) {
      throw new Error(`[oauth2Service] ${integrationType} token fetch failed: Missing access token`);
    }

    await storeToken(orgId, integrationType, {
      accessToken,
      refreshToken: newRefreshToken,
      expiresInSeconds,
    });

    return accessToken;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function getToken(orgId, integrationType) {
  try {
    const [rows] = await pool.query(
      `SELECT access_token
       FROM oauth2_tokens
       WHERE org_id = ? AND integration_type = ? AND expires_at > NOW()
       LIMIT 1`,
      [orgId, integrationType]
    );

    if (rows && rows.length > 0 && rows[0].access_token) {
      return rows[0].access_token;
    }

    return refreshToken(orgId, integrationType);
  } catch (error) {
    console.error(error);
    throw error;
  }
}

async function revokeToken(orgId, integrationType) {
  try {
    await pool.query(
      'DELETE FROM oauth2_tokens WHERE org_id = ? AND integration_type = ?',
      [orgId, integrationType]
    );
  } catch (error) {
    console.error(error);
    throw error;
  }
}

module.exports = {
  getToken,
  refreshToken,
  storeToken,
  revokeToken,
};
