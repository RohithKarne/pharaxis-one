'use strict';

/**
 * featureFlagsService.js — per-tenant feature flag evaluator.
 *
 * Every Wave 1–5 theme (the 10-theme case-form roadmap) ships behind a flag.
 * Themes are off by default. Admin enables per tenant via the Feature Flags
 * admin screen. Frontend gets resolved flag map at boot via /api/feature-flags/resolved.
 *
 * Caching: 60s in-memory map keyed by (flag_key, org_id). Invalidated when
 * an admin writes via the admin route.
 */

const pool = require('../database/db');

const CACHE_TTL_MS = 60 * 1000;
const _cache = new Map(); // key=`${flagKey}|${orgId}` → { value: bool, expiresAt: number }

function cacheKey(flagKey, orgId) {
  return `${flagKey}|${orgId == null ? 'null' : orgId}`;
}

function invalidate(flagKey = null, orgId = null) {
  if (flagKey == null && orgId == null) {
    _cache.clear();
    return;
  }
  for (const k of [..._cache.keys()]) {
    const [fk, oid] = k.split('|');
    const matchFlag = flagKey == null || fk === flagKey;
    const matchOrg  = orgId  == null || oid === String(orgId);
    if (matchFlag && matchOrg) _cache.delete(k);
  }
}

/**
 * Returns true if `flagKey` is enabled for the given org_id.
 * Falls back to feature_flags.default_state when no per-tenant row exists.
 */
async function isEnabledForOrg(flagKey, orgId) {
  if (!flagKey) return false;
  const k = cacheKey(flagKey, orgId);
  const cached = _cache.get(k);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    // Resolve flag id + default
    const [[flag]] = await pool.execute(
      'SELECT id, default_state FROM feature_flags WHERE flag_key = ? LIMIT 1',
      [flagKey]
    );
    if (!flag) {
      _cache.set(k, { value: false, expiresAt: Date.now() + CACHE_TTL_MS });
      return false;
    }
    // Tenant-specific override?
    let value = flag.default_state === 'on';
    if (orgId != null) {
      const [[row]] = await pool.execute(
        'SELECT enabled FROM tenant_feature_flags WHERE flag_id = ? AND org_id = ? LIMIT 1',
        [flag.id, orgId]
      );
      if (row) value = !!row.enabled;
    }
    _cache.set(k, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch (_) {
    return false;
  }
}

/**
 * Returns a flag-key → boolean map for the org, suitable for sending to the frontend.
 */
async function resolveAllForOrg(orgId) {
  try {
    const [flags] = await pool.execute('SELECT flag_key FROM feature_flags');
    const out = {};
    for (const f of flags) {
      out[f.flag_key] = await isEnabledForOrg(f.flag_key, orgId);
    }
    return out;
  } catch (_) {
    return {};
  }
}

/**
 * Express middleware factory: gate a route on a flag.
 *   router.get('/x', authenticate, requireFlag('cf.theme3_inline_validation'), handler)
 */
function requireFlag(flagKey, { allowSuperadmin = true } = {}) {
  return async (req, res, next) => {
    if (allowSuperadmin && req.user?.role === 'superadmin') return next();
    const orgId = req.user?.orgId ?? null;
    const ok = await isEnabledForOrg(flagKey, orgId);
    if (!ok) return res.status(403).json({ error: `Feature not enabled for this tenant.`, flag: flagKey });
    next();
  };
}

module.exports = {
  isEnabledForOrg,
  resolveAllForOrg,
  invalidate,
  requireFlag,
};
