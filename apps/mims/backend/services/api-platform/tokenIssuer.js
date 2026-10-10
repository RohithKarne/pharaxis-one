'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const pool = require('../../database/db');

function hashToken(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
function newToken() { return crypto.randomBytes(32).toString('base64url'); }

async function issueClientCredentials({ client_id, client_secret }) {
  const [[client]] = await pool.execute('SELECT * FROM api_clients WHERE client_id = ? AND status = "active" LIMIT 1', [client_id]);
  if (!client) return null;
  let ok = await bcrypt.compare(String(client_secret || ''), client.client_secret_hash || '');
  // The secret replaced by the last rotation still works until its end date (bridge plan P7).
  if (!ok && client.previous_secret_hash && client.previous_secret_expires_at && new Date(client.previous_secret_expires_at) > new Date()) {
    ok = await bcrypt.compare(String(client_secret || ''), client.previous_secret_hash);
  }
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

// A new secret for an existing connection. The current one keeps working for
// `graceDays`, so the sender can switch over without a gap; the case history,
// keys and ownership stay with the same connection.
async function rotateClientSecret(apiClientId, graceDays = 7) {
  const secret = newToken();
  const secretHash = await bcrypt.hash(secret, 12);
  const previousEnds = new Date(Date.now() + graceDays * 24 * 60 * 60 * 1000);
  await pool.execute(
    `UPDATE api_clients SET previous_secret_hash = client_secret_hash, previous_secret_expires_at = ?, client_secret_hash = ?
      WHERE id = ?`, [previousEnds, secretHash, apiClientId]);
  return { client_secret: secret, previous_secret_expires_at: previousEnds };
}

module.exports = { issueClientCredentials, createApiClient, rotateClientSecret, hashToken };
