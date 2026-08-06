'use strict';
/**
 * database/sslConfig.js — TLS options for the MySQL pool.
 *
 * PAUD-3 item 4a. Split out of db.js purely so it can be tested: db.js runs
 * migrations at import time, so anything living inside it needs a live database
 * to exercise.
 *
 * Off unless MYSQL_SSL=true, so local and CI runs against a plaintext MySQL are
 * unaffected by this change.
 */

const fs = require('fs');

/**
 * @returns {object|undefined} mysql2 `ssl` option, or undefined to leave it off.
 */
function buildSslOption(env = process.env) {
  if (String(env.MYSQL_SSL || '').toLowerCase() !== 'true') return undefined;

  const isProd = env.NODE_ENV === 'production';
  const caPath = env.MYSQL_SSL_CA;

  // Without a CA we can only fall back to rejectUnauthorized:false, which
  // encrypts the traffic but authenticates nothing — that stops a passive
  // listener and not an active one, and it is not an answer to give an auditor.
  // Allowed for local testing, refused in production.
  if (!caPath) {
    if (isProd) throw new Error('MYSQL_SSL_CA is required when MYSQL_SSL=true in production.');
    return { rejectUnauthorized: false };
  }

  if (!fs.existsSync(caPath)) {
    throw new Error(`MYSQL_SSL_CA points at a file that does not exist: ${caPath}`);
  }

  return { ca: fs.readFileSync(caPath, 'utf8'), rejectUnauthorized: true };
}

module.exports = { buildSslOption };
