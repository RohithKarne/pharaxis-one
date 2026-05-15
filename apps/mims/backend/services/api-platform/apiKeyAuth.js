'use strict';

const pool = require('../../database/db');
const { hashToken } = require('./tokenIssuer');

async function apiKeyAuth(req, res, next) {
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
  req.apiClient = { ...row, scopes: JSON.parse(row.scopes || '[]') };
  next();
}

module.exports = { apiKeyAuth };
