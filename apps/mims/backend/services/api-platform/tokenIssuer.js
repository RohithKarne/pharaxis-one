'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const pool = require('../../database/db');

function hashToken(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
function newToken() { return crypto.randomBytes(32).toString('base64url'); }

async function issueClientCredentials({ client_id, client_secret }) {
  const [[client]] = await pool.execute('SELECT * FROM api_clients WHERE client_id = ? AND status = "active" LIMIT 1', [client_id]);
  if (!client) return null;
  const ok = await bcrypt.compare(String(client_secret || ''), client.client_secret_hash || '');
  if (!ok) return null;
  const token = newToken();
  const expires = new Date(Date.now() + 60 * 60 * 1000);
  await pool.execute(
    'INSERT INTO api_tokens (client_id, access_token_hash, expires_at, revoked) VALUES (?, ?, ?, 0)',
    [client.id, hashToken(token), expires]
  );
  await pool.execute('UPDATE api_clients SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', [client.id]);
  // mysql2 returns JSON columns pre-parsed — same array-or-string guard as apiKeyAuth.
  const scopes = Array.isArray(client.scopes) ? client.scopes : JSON.parse(client.scopes || '[]');
  return { access_token: token, token_type: 'Bearer', expires_in: 3600, scope: scopes.join(' ') };
}

async function createApiClient({ org_id, name, scopes = [], rate_limit_per_min = 60, created_by = null }) {
  const clientId = crypto.randomUUID();
  const secret = newToken();
  const secretHash = await bcrypt.hash(secret, 12);
  const [result] = await pool.execute(
    `INSERT INTO api_clients (org_id, client_id, client_secret_hash, name, scopes, rate_limit_per_min, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
    [org_id, clientId, secretHash, name || 'API Client', JSON.stringify(scopes), Number(rate_limit_per_min || 60), created_by]
  );
  return { id: result.insertId, client_id: clientId, client_secret: secret };
}

module.exports = { issueClientCredentials, createApiClient, hashToken };
