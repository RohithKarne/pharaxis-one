'use strict';

/**
 * Migration 152 — sessions keep a fingerprint of the sign-in token (MIPM-172).
 *
 * The full token was stored, so anyone who could read the table (or a backup)
 * could use any live session for up to eight hours. The token becomes its
 * SHA-256 fingerprint; the organisation and role the Logged-in Users screen read
 * out of the token are kept in their own columns.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

async function up(conn) {
  const [cols] = await conn.execute("SHOW COLUMNS FROM sessions WHERE Field IN ('org_id', 'role')");
  const have = new Set(cols.map((c) => c.Field));
  if (!have.has('org_id')) await conn.execute('ALTER TABLE sessions ADD COLUMN org_id INT NULL AFTER user_id');
  if (!have.has('role')) await conn.execute('ALTER TABLE sessions ADD COLUMN role VARCHAR(40) NULL AFTER org_id');

  // Only rows still holding a raw token (a JWT has dots; a fingerprint is 64 hex characters).
  const [rows] = await conn.execute("SELECT id, token FROM sessions WHERE token LIKE '%.%'");
  for (const row of rows) {
    const claims = jwt.decode(row.token) || {};
    const key = crypto.createHash('sha256').update(String(row.token)).digest('hex');
    await conn.execute('UPDATE sessions SET token = ?, org_id = ?, role = ? WHERE id = ?',
      [key, Number(claims.orgId) || null, claims.role || null, row.id]);
  }
}

async function down(_conn) {}

module.exports = { up, down };
