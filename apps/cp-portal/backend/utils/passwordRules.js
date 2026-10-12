'use strict';

/**
 * passwordRules.js — one rule for every CP Portal password (Rohith's sign-in
 * Tier 1, 12 Oct 2026). Eight characters and nothing else let "password1"
 * through. Now: at least 12 characters, not on the list of common passwords,
 * not the person's own email, and not one of their last five.
 *
 *   const problem = checkPassword(password, { email });
 *   if (problem) return res.status(400).json({ error: problem });
 *   if (await isRecentPassword('admin', id, password)) ...
 *   await rememberPassword('admin', id, hash);
 */

const bcrypt = require('bcrypt');
const { pool } = require('../database/db');
const COMMON = require('./commonPasswords');

const MIN_LENGTH = 12;
const MAX_LENGTH = 128;
const HISTORY_KEEP = 5;

const COMMON_SET = new Set(COMMON.map(p => p.toLowerCase()));

// Returns a sentence for the person, or null when the password is acceptable.
function checkPassword(password, { email = '' } = {}) {
  const value = String(password || '');
  if (value.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters.`;
  if (value.length > MAX_LENGTH) return 'Input exceeds maximum length.';
  const lower = value.toLowerCase();
  if (COMMON_SET.has(lower) || COMMON_SET.has(lower.replace(/[^a-z0-9]/g, ''))) {
    return 'That password is too common. Choose one that is harder to guess.';
  }
  const local = String(email || '').toLowerCase().split('@')[0];
  if (local && local.length >= 4 && lower.includes(local)) return 'Password must not contain your email address.';
  return null;
}

// True when the password matches one of the person's recent passwords.
async function isRecentPassword(subjectType, subjectId, password) {
  const [rows] = await pool.execute(
    `SELECT password_hash FROM cp_password_history
     WHERE subject_type = ? AND subject_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
    [subjectType, subjectId, HISTORY_KEEP]
  );
  for (const row of rows) {
    if (await bcrypt.compare(String(password), row.password_hash)) return true;
  }
  return false;
}

// Record a password that has just been set and keep only the last five.
async function rememberPassword(subjectType, subjectId, passwordHash) {
  await pool.execute(
    'INSERT INTO cp_password_history (subject_type, subject_id, password_hash) VALUES (?, ?, ?)',
    [subjectType, subjectId, passwordHash]
  );
  await pool.execute(
    `DELETE FROM cp_password_history WHERE subject_type = ? AND subject_id = ? AND id NOT IN (
       SELECT id FROM (SELECT id FROM cp_password_history WHERE subject_type = ? AND subject_id = ?
                       ORDER BY created_at DESC, id DESC LIMIT ?) keep)`,
    [subjectType, subjectId, subjectType, subjectId, HISTORY_KEEP]
  );
}

const RECENT_MESSAGE = 'You used that password recently. Choose a new one.';

module.exports = { checkPassword, isRecentPassword, rememberPassword, MIN_LENGTH, MAX_LENGTH, HISTORY_KEEP, RECENT_MESSAGE };
