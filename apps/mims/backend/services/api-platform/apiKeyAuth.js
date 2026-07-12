'use strict';

const pool = require('../../database/db');
const { hashToken } = require('./tokenIssuer');

async function apiKeyAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Bearer access token required.' });
    const tokenHash = hashToken(auth.slice(7).trim());
    const [[row]] = await pool.execute(
      `SELECT t.id AS token_id, c.*
         FROM api_tokens t JOIN api_clients c ON c.id = t.client_id
        WHERE t.access_token_hash = ? AND t.revoked = 0 AND t.expires_at > CURRENT_TIMESTAMP AND c.status = 'active'
        LIMIT 1`,
      [tokenHash]
    );
    if (!row) return res.status(401).json({ error: 'Invalid or expired access token.' });
    // scopes may arrive already parsed (JSON column → mysql2 returns an array) or as
    // a raw string (TEXT column). Handle both; malformed input fails closed to no
    // scopes. Previously this always JSON.parse()'d, which threw on the array form
    // and silently zeroed every client's scopes → blanket 403 once the platform is on.
    let scopes = [];
    try {
      scopes = Array.isArray(row.scopes) ? row.scopes : JSON.parse(row.scopes || '[]');
    } catch (_) { scopes = []; }
    if (!Array.isArray(scopes)) scopes = [];
    req.apiClient = { ...row, scopes };
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Authentication failed.' });
  }
}

module.exports = { apiKeyAuth };
