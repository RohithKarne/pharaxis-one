'use strict';

/**
 * passwordPolicy.js — Single source of truth for password rules.
 * Reads from `system_config` (set via MIMS Admin > System > System Parameters > General).
 *
 * Used by:
 *   - authController.js (password change, forgot-password, first-login reset)
 *   - routes/admin/users.js (admin-set password, expiry on user creation)
 */

const pool = require('../database/db');

const KEYS = {
  PASSWORD_EXPIRY_DAYS:       'password_expiry_days',
  PASSWORD_REQ_ALPHANUMERIC:  'password_require_alphanumeric',
  PASSWORD_REQ_SPECIAL_CHARS: 'password_require_special_chars',
  PASSWORD_HISTORY_COUNT:     'password_history_count',
};

const DEFAULTS = {
  expiry_days:      90,
  require_alpha:    false,
  require_special:  false,
  history_count:    10,
};

const SPECIAL_CHARS_REGEX = /[!@#$%^&*]/;
const ALPHA_REGEX         = /[A-Za-z]/;
const NUMERIC_REGEX       = /[0-9]/;

// In-process cache (60s) — config rarely changes; avoid DB hit per request.
let _cache = null;
let _cacheAt = 0;
const CACHE_TTL_MS = 60_000;

async function getPolicy() {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL_MS) return _cache;

  try {
    const [rows] = await pool.execute(
      `SELECT config_key, config_value FROM system_config WHERE config_key IN (?, ?, ?, ?)`,
      Object.values(KEYS)
    );
    const map = {};
    for (const r of rows) map[r.config_key] = r.config_value;

    _cache = {
      expiry_days:     parseInt(map[KEYS.PASSWORD_EXPIRY_DAYS]    ?? DEFAULTS.expiry_days,    10),
      require_alpha:   (map[KEYS.PASSWORD_REQ_ALPHANUMERIC]  ?? '0') === '1',
      require_special: (map[KEYS.PASSWORD_REQ_SPECIAL_CHARS] ?? '0') === '1',
      history_count:   parseInt(map[KEYS.PASSWORD_HISTORY_COUNT]   ?? DEFAULTS.history_count, 10),
    };
    _cacheAt = now;
    return _cache;
  } catch (_) {
    return { ...DEFAULTS };
  }
}

// Clear cache on policy update — called from PUT /system-params/general
function invalidateCache() {
  _cache = null;
  _cacheAt = 0;
}

/**
 * Validate a candidate password against the active policy.
 * Returns { ok: true } or { ok: false, error: '...' }.
 */
async function validateComplexity(password) {
  if (!password || typeof password !== 'string') {
    return { ok: false, error: 'Password is required.' };
  }
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }

  const policy = await getPolicy();

  if (policy.require_alpha) {
    if (!ALPHA_REGEX.test(password) || !NUMERIC_REGEX.test(password)) {
      return { ok: false, error: 'Password must contain at least one letter and one number.' };
    }
  }
  if (policy.require_special) {
    if (!SPECIAL_CHARS_REGEX.test(password)) {
      return { ok: false, error: 'Password must contain at least one special character (! @ # $ % ^ & *).' };
    }
  }

  return { ok: true };
}

module.exports = {
  getPolicy,
  invalidateCache,
  validateComplexity,
  DEFAULTS,
};
