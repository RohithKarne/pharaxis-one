/**
 * loginLockout.js — the account lock on both sign-ins (CPPM-49).
 *
 * Five wrong passwords in a row lock that sign-in for 30 minutes, the same numbers
 * MIMS uses. While locked, even the right password is refused. A success or an
 * admin's unlock clears the count.
 *
 * Attempts are keyed by a fingerprint of the email, not by the account, so an
 * address nobody registered counts and locks exactly like a real one: the messages
 * a guesser sees cannot tell them whether an account exists. The rate limiter in
 * server.js still caps requests per address on top of this.
 */
const crypto = require('crypto');
const { pool } = require('../database/db');

const MAX_FAILURES = 5;
const LOCK_MINUTES = 30;
const LOCKED_MESSAGE = `Too many wrong passwords. Sign-in for this account is paused for ${LOCK_MINUTES} minutes. Try again later, or ask your administrator to unlock it.`;

// scope is 'portal' (client id + email) or 'admin' (email only — admin emails are unique).
function loginKey(scope, clientId, email) {
  return crypto.createHash('sha256')
    .update(`${scope}:${clientId ?? ''}:${String(email || '').trim().toLowerCase()}`)
    .digest('hex');
}

async function isLocked(key) {
  const [[row]] = await pool.execute(
    'SELECT locked_until > UTC_TIMESTAMP() AS locked FROM cp_login_attempts WHERE login_key = ?', [key]);
  return !!row?.locked;
}

// One wrong password, counted in a single statement so parallel guesses cannot each
// read a count below the limit. A failure more than LOCK_MINUTES after the last one
// starts a new count. MySQL applies the SET clauses left to right, so locked_until
// sees the new failed_count and failed_count sees the old last_failed_at.
// Returns true when the sign-in is now locked.
async function recordFailure(key) {
  await pool.execute(
    `INSERT INTO cp_login_attempts (login_key, failed_count, last_failed_at) VALUES (?, 1, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
       failed_count   = IF(last_failed_at < UTC_TIMESTAMP() - INTERVAL ${LOCK_MINUTES} MINUTE, 1, failed_count + 1),
       locked_until   = IF(failed_count >= ${MAX_FAILURES}, UTC_TIMESTAMP() + INTERVAL ${LOCK_MINUTES} MINUTE, locked_until),
       last_failed_at = UTC_TIMESTAMP()`,
    [key]);
  return isLocked(key);
}

// A successful sign-in or an admin's unlock. Returns true if a row was removed.
async function clearAttempts(key) {
  const [r] = await pool.execute('DELETE FROM cp_login_attempts WHERE login_key = ?', [key]);
  return r.affectedRows > 0;
}

// For the admin user lists: { email: 'YYYY-MM-DDTHH:MM:SSZ' } for each address that
// is locked right now.
async function lockedUntilByEmail(scope, clientId, emails) {
  if (!emails.length) return {};
  const byKey = new Map(emails.map(e => [loginKey(scope, clientId, e), e]));
  const keys = [...byKey.keys()];
  const [rows] = await pool.execute(
    `SELECT login_key, DATE_FORMAT(locked_until, '%Y-%m-%dT%H:%i:%sZ') AS until
       FROM cp_login_attempts
      WHERE locked_until > UTC_TIMESTAMP() AND login_key IN (${keys.map(() => '?').join(',')})`,
    keys);
  return Object.fromEntries(rows.map(r => [byKey.get(r.login_key), r.until]));
}

module.exports = { loginKey, isLocked, recordFailure, clearAttempts, lockedUntilByEmail, LOCKED_MESSAGE, LOCK_MINUTES };
