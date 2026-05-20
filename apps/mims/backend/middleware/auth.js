'use strict';

const pool = require('../database/db');
const jwt = require('jsonwebtoken');
const JWT_SECRET = require('../utils/jwtSecret');
const { sessionCacheGet, sessionCacheSet, sessionCacheInvalidate } = require('../services/redisClient');
const { hasGlobalAdminScope, isAdminUser, normalizeRole } = require('../utils/adminScope');

function createAuthError(message, code, status = 401, shouldLogout = status === 401) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  err.shouldLogout = shouldLogout;
  return err;
}

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
  if (!token) throw createAuthError('Access denied. No token provided.', 'AUTH_TOKEN_MISSING');

  // ── Redis session cache (60s TTL) — eliminates DB hit on every request ──────
  // Cache miss / Redis down → falls through to DB check transparently.
  const cached = await sessionCacheGet(token);
  if (cached) {
    // Re-verify JWT signature even on cache hit (catches key rotation edge cases)
    try {
      jwt.verify(token, JWT_SECRET);
    } catch (_) {
      throw createAuthError('Session revoked or invalid. Please log in again.', 'AUTH_TOKEN_INVALID');
    }
    return { ...cached, token };
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (_) {
    throw createAuthError('Session revoked or invalid. Please log in again.', 'AUTH_TOKEN_INVALID');
  }

  let sessionFound = false;

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
        throw createAuthError('Session expired. Please log in again.', 'SESSION_EXPIRED');
      }
    }
  } catch (err) {
    if (err?.code) throw err;
    throw createAuthError('Authentication service unavailable. Please try again shortly.', 'AUTH_SERVICE_UNAVAILABLE', 503, false);
  }

  if (!sessionFound) {
    throw createAuthError('Session revoked or invalid. Please log in again.', 'SESSION_REVOKED');
  }

  const result = {
    userId:               decoded.userId,
    email:                decoded.email,
    role:                 decoded.role,
    orgId:                decoded.orgId ?? null,
    siteId:               decoded.siteId ?? null,
    platformAdmin:        Boolean(decoded.platformAdmin),
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
 * Platform admin compatibility: orgId = null, siteId = null
 */
async function authenticate(req, res, next) {
  const token = readCookie(req, 'mims_token') || readBearer(req);
  if (!token) {
    return res.status(401).json({
      error: 'Access denied. No token provided.',
      error_code: 'AUTH_TOKEN_MISSING',
      should_logout: true,
    });
  }

  try {
    req.user = await validateAccessToken(token);
    next();
  } catch (err) {
    const status = Number(err?.status || 401);
    const message = String(err?.message || 'Invalid or expired token. Please log in again.');
    return res.status(status).json({
      error: message,
      error_code: err?.code || (status === 503 ? 'AUTH_SERVICE_UNAVAILABLE' : 'AUTH_TOKEN_INVALID'),
      should_logout: Boolean(err?.shouldLogout),
    });
  }
}

/**
 * requireRole(...roles) — restrict route to specific roles
 * Usage: router.delete('/x', authenticate, requireRole('admin', 'platform_admin'), handler)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    const requestedRoles = roles.map((role) => normalizeRole(role));
    const userRole = normalizeRole(req.user);
    const allowed =
      requestedRoles.includes(userRole) ||
      (requestedRoles.includes('platform_admin') && hasGlobalAdminScope(req.user)) ||
      (requestedRoles.includes('admin') && isAdminUser(req.user));
    if (!allowed) {
      return res.status(403).json({
        error: 'You do not have permission to perform this action.',
        error_code: 'ROLE_FORBIDDEN',
        should_logout: false,
      });
    }
    next();
  };
}

/**
 * requireOrg — blocks requests where orgId is null (non-platform-admin must have an active org)
 * Global platform admins remain exempt because they operate without org scoping.
 */
function requireOrg(req, res, next) {
  if (hasGlobalAdminScope(req.user)) return next();
  if (!req.user.orgId) {
    return res.status(403).json({
      error: 'No active organisation. Please contact your administrator.',
      error_code: 'ORG_CONTEXT_MISSING',
      should_logout: false,
    });
  }
  next();
}

async function requireAccessNotExpired(req, res, next) {
  if (!req.user || hasGlobalAdminScope(req.user) || !req.user.orgId) return next();
  try {
    const [rows] = await pool.execute(
      'SELECT access_expires_at FROM user_org_access WHERE user_id = ? AND org_id = ? AND is_active = 1 LIMIT 1',
      [req.user.userId, req.user.orgId]
    );
    if (rows.length > 0 && rows[0].access_expires_at && new Date(rows[0].access_expires_at) < new Date()) {
      return res.status(403).json({
        error: 'Your access to this organisation has expired. Please contact your administrator.',
        error_code: 'ORG_ACCESS_EXPIRED',
        should_logout: false,
      });
    }
    next();
  } catch (_) {
    next();
  }
}

module.exports = { authenticate, requireRole, requireOrg, requireAccessNotExpired, readCookie, validateAccessToken, sessionCacheInvalidate };
