'use strict';

const pool = require('../database/db');

async function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
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
