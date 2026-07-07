'use strict';

const crypto = require('crypto');
const pool = require('../database/db');

/**
 * M-02: Legacy API-key auth. Keys are now stored and looked up as a SHA-256
 * hash (org_integrations.api_key_hash) rather than plaintext, closing the
 * at-rest exposure (F13). The hashed replacement lives in
 * services/api-platform/apiKeyAuth.js and should be used for all new
 * integrations.
 *
 * SECURITY: never log the raw API key or the X-Api-Key header. Do not add the
 * apiKey value to logger/console output, error messages, or telemetry payloads.
 */
function hashApiKey(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function timingSafeEqualHex(a, b) {
  const aa = Buffer.from(String(a), 'hex');
  const bb = Buffer.from(String(b), 'hex');
  if (aa.length === 0 || aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    // Look up by SHA-256 hash of the presented key — plaintext is never stored
    // or compared. The hash is bound as a query parameter, never logged.
    const apiKeyHash = hashApiKey(apiKey);
    const [rows] = await pool.query(
      'SELECT id, org_id, integration_type, enabled, api_key_hash FROM org_integrations WHERE api_key_hash = ? LIMIT 1',
      [apiKeyHash]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const integration = rows[0];

    // Constant-time confirmation of the hash returned by the DB.
    if (!timingSafeEqualHex(apiKeyHash, integration.api_key_hash)) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    if (integration.enabled === 0) {
      return res.status(403).json({ error: 'Integration disabled' });
    }

    req.integration = {
      id: integration.id,
      org_id: integration.org_id,
      integration_type: integration.integration_type
    };

    return next();
  } catch (error) {
    return res.status(500).json({ error: 'Auth error' });
  }
}

module.exports = { authenticateApiKey };
