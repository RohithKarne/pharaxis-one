'use strict';

const pool = require('../database/db');
const jwt = require('jsonwebtoken');
const JWT_SECRET = require('../utils/jwtSecret');
const { sessionCacheGet, sessionCacheSet, sessionCacheInvalidate } = require('../services/redisClient');

function readCookie(req, name) {
  const cookieHeader = req.headers.cookie || '';
  const cookie = cookieHeader
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null;
}

function readBearer(req) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token && token !== 'null' && token !== 'undefined' ? token : null;
}

async function validateAccessToken(token) {
  if (!token) throw new Error('Access denied. No token provided.');

  // ── Redis session cache (60s TTL) — eliminates DB hit on every request ──────
  // Cache miss / Redis down → falls through to DB check transparently.
  const cached = await sessionCacheGet(token);
  if (cached) {
    // Re-verify JWT signature even on cache hit (catches key rotation edge cases)
    jwt.verify(token, JWT_SECRET);
    return { ...cached, token };
  }

  const decoded = jwt.verify(token, JWT_SECRET);

  let sessionFound = false;
  let requireTrackedSession = false;

  try {
    const [[sessionRow]] = await pool.execute(
      'SELECT id, expires_at FROM sessions WHERE token = ? LIMIT 1',
      [token]
    );

    if (sessionRow) {
      sessionFound = true;
      const expiresAt = sessionRow.expires_at ? new Date(sessionRow.expires_at).getTime() : null;
      if (expiresAt && !Number.isNaN(expiresAt) && expiresAt < Date.now()) {
        await pool.execute('DELETE FROM sessions WHERE id = ?', [sessionRow.id]).catch(() => {});
        throw new Error('Session expired. Please log in again.');
      }
    } else {
      const [[countRow]] = await pool.execute(
        'SELECT COUNT(*) AS cnt FROM sessions WHERE user_id = ?',
        [decoded.userId]
      );
      requireTrackedSession = Number(countRow?.cnt || 0) > 0;
    }
  } catch (err) {
    if (String(err?.message || '').includes('Session expired')) throw err;
    throw new Error('Authentication service unavailable. Please log in again.');
  }

  if (requireTrackedSession && !sessionFound) {
    throw new Error('Session revoked or invalid. Please log in again.');
  }

  const result = {
    userId:               decoded.userId,
    email:                decoded.email,
    role:                 decoded.role,
    orgId:                decoded.orgId ?? null,
    siteId:               decoded.siteId ?? null,
    token,
    passwordResetRequired: decoded.passwordResetRequired ?? false,
  };

  // Populate cache for subsequent requests
  await sessionCacheSet(token, result);
  return result;
}

/**
 * authenticate — verifies JWT and injects req.user
 * req.user = { userId, email, role, orgId, siteId, token }
 * Superadmin: orgId = null, siteId = null
 */
async function authenticate(req, res, next) {
  const token = readCookie(req, 'mims_token') || readBearer(req);
  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  try {
    req.user = await validateAccessToken(token);
    next();
  } catch (err) {
    const message = String(err?.message || '');
    if (message) return res.status(401).json({ error: message });
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }
}

/**
 * requireRole(...roles) — restrict route to specific roles
 * Usage: router.delete('/x', authenticate, requireRole('admin', 'superadmin'), handler)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

/**
 * requireOrg — blocks requests where orgId is null (non-superadmin must have an active org)
 * Superadmin is exempt.
 */
function requireOrg(req, res, next) {
  if (req.user.role === 'superadmin') return next();
  if (!req.user.orgId) {
    return res.status(403).json({ error: 'No active organisation. Please contact your administrator.' });
  }
  next();
}

async function requireAccessNotExpired(req, res, next) {
  if (!req.user || req.user.role === 'superadmin' || !req.user.orgId) return next();
  try {
    const [rows] = await pool.execute(
      'SELECT access_expires_at FROM user_org_access WHERE user_id = ? AND org_id = ? AND is_active = 1 LIMIT 1',
      [req.user.userId, req.user.orgId]
    );
    if (rows.length > 0 && rows[0].access_expires_at && new Date(rows[0].access_expires_at) < new Date()) {
      return res.status(401).json({ error: 'Your access to this organisation has expired. Please contact your administrator.' });
    }
    next();
  } catch (_) {
    next();
  }
}

module.exports = { authenticate, requireRole, requireOrg, requireAccessNotExpired, readCookie, validateAccessToken, sessionCacheInvalidate };
