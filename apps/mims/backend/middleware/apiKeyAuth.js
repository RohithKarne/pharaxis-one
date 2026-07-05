'use strict';

const pool = require('../database/db');

/**
 * M-02: DEPRECATED legacy API-key auth. Keys are stored/looked up in plaintext
 * (SQL equality on org_integrations.api_key), which is unsafe at rest. The
 * hashed replacement lives in services/api-platform/apiKeyAuth.js and should be
 * used for all new integrations; the full hash migration is tracked separately.
 *
 * SECURITY: never log the raw API key or the X-Api-Key header. Do not add the
 * apiKey value to logger/console output, error messages, or telemetry payloads.
 */
async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    // Parameterised query — the key is bound, never interpolated or logged.
    const [rows] = await pool.query(
      'SELECT id, org_id, integration_type, enabled FROM org_integrations WHERE api_key = ? LIMIT 1',
      [apiKey]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    const integration = rows[0];

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
