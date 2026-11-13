'use strict';

// L4 (Rohith, 2026-11-13): sign-in is a platform matter. One idle timeout, one set
// of two-step methods and one "remember this device" period for every
// organisation, kept in system_config and set on Sign-in & Security. The old
// per-organisation columns (session_timeout_minutes, two_factor_methods,
// two_factor_remember_days) are kept as history and no longer read.

const pool = require('../database/db');

const DEFAULTS = { user_session_timeout_minutes: '30', two_factor_methods: 'email,totp', two_factor_remember_days: '7' };
let cache = null;

async function getPlatformSignIn() {
  if (cache && cache.until > Date.now()) return cache.value;
  const keys = Object.keys(DEFAULTS);
  const [rows] = await pool.query('SELECT config_key, config_value FROM system_config WHERE config_key IN (?)', [keys]);
  const raw = { ...DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.config_key, r.config_value])) };
  const methods = String(raw.two_factor_methods).split(',').map((m) => m.trim()).filter((m) => ['email', 'totp'].includes(m));
  const value = {
    sessionTimeout: Math.max(30, parseInt(raw.user_session_timeout_minutes, 10) || 30),
    twoFactorMethods: methods.length ? methods : ['email', 'totp'],
    rememberDays: Math.max(1, Math.min(90, parseInt(raw.two_factor_remember_days, 10) || 7)),
  };
  cache = { value, until: Date.now() + 60_000 };
  return value;
}

function invalidatePlatformSignIn() { cache = null; }

module.exports = { getPlatformSignIn, invalidatePlatformSignIn, PLATFORM_SIGN_IN_DEFAULTS: DEFAULTS };
