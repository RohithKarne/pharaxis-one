'use strict';

const pool = require('../database/db');
const jwt = require('jsonwebtoken');
const JWT_SECRET = require('../utils/jwtSecret');
const { sessionCacheGet, sessionCacheSet, sessionCacheInvalidate } = require('../services/redisClient');
const { sessionKey } = require('../utils/sessionKey');
const { hasGlobalAdminScope, isAdminUser, normalizeRole } = require('../utils/adminScope');
const { getUserModules } = require('../utils/userModules');

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

// sessions.expires_at is written as a UTC 'YYYY-MM-DD HH:MM:SS' (trackSessionToken).
// new Date() reads that bare form as local time, so in IST a session was refused
// 5.5 hours early. A DATETIME column arrives as a Date (the pool runs in UTC) and
// is used as it is.
function sessionExpiryMs(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.getTime();
  const text = String(value).trim();
  const utc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}Z` : text;
  return new Date(utc).getTime();
}
// A bearer value counts only when it looks like a JWT (three base64url parts).
// The web app no longer receives the session token (T15), so its "signed in"
// marker still rides along as `Bearer cookie-session`; ignoring anything that is
// not a JWT lets the httpOnly cookie carry the session instead.
const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function readBearer(req) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return JWT_SHAPE.test(token) ? token : null;
}

// A session opened for a forced password change (sign-in with password_reset_required)
// may only do what the set-new-password screen needs; everything else refuses it.
function refusePendingPasswordReset(session, allowPasswordReset) {
  if (session.passwordResetRequired && !allowPasswordReset) {
    throw createAuthError('Set a new password before continuing.', 'PASSWORD_RESET_REQUIRED', 403, false);
  }
  return session;
}

// MIPM-32: what a switched-off person is told, on every route in — a live session,
// a password sign-in or single sign-on. The web app shows it as a full screen.
const ACCESS_ENDED_MESSAGE = 'Your access has ended. Please contact your administrator.';
const ACCESS_ENDED_CODE = 'ACCESS_ENDED';

function isSwitchedOff(user) {
  return Boolean(user) && (!Number(user.is_active) || Boolean(Number(user.is_disabled)));
}

// Ends every session a person has, on every device, and clears the 60-second
// session cache for each one. Throws if it cannot, so the caller can say so.
async function endAllSessions(userId) {
  const [rows] = await pool.execute('SELECT token FROM sessions WHERE user_id = ?', [userId]);
  await pool.execute('DELETE FROM sessions WHERE user_id = ?', [userId]);
  await Promise.all(rows.map((row) => sessionCacheInvalidate(row.token)));
  return rows.length;
}

async function validateAccessToken(token, { allowPasswordReset = false } = {}) {
  if (!token) throw createAuthError('Access denied. No token provided.', 'AUTH_TOKEN_MISSING');

  // ── Redis session cache (60s TTL) — eliminates DB hit on every request ──────
  // Cache miss / Redis down → falls through to DB check transparently.
  // MIPM-172: sessions and the cache are keyed by the token's fingerprint.
  const key = sessionKey(token);
  const cached = await sessionCacheGet(key);
  if (cached) {
    // Re-verify JWT signature even on cache hit (catches key rotation edge cases)
    try {
      jwt.verify(token, JWT_SECRET);
    } catch (_) {
      throw createAuthError('Session revoked or invalid. Please log in again.', 'AUTH_TOKEN_INVALID');
    }
    return refusePendingPasswordReset({ ...cached, token }, allowPasswordReset);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (_) {
    throw createAuthError('Session revoked or invalid. Please log in again.', 'AUTH_TOKEN_INVALID');
  }

  let sessionFound = false;
  let accountName = null;

  try {
    // MIPM-32: a switched-off account is refused here whether or not its sessions
    // were ended, and with its own reason. Before, only the session row was
    // checked, so a person switched off by an admin stayed in until it expired.
    const [[account]] = await pool.execute(
      'SELECT is_active, is_disabled, name FROM users WHERE id = ? LIMIT 1',
      [decoded.userId]
    );
    if (isSwitchedOff(account)) throw createAuthError(ACCESS_ENDED_MESSAGE, ACCESS_ENDED_CODE);
    accountName = account?.name || null;

    const [[sessionRow]] = await pool.execute(
      'SELECT id, expires_at, last_seen_at FROM sessions WHERE token = ? LIMIT 1',
      [key]
    );

    if (sessionRow) {
      sessionFound = true;
      const expiresAt = sessionExpiryMs(sessionRow.expires_at);
      if (expiresAt && !Number.isNaN(expiresAt) && expiresAt < Date.now()) {
        await pool.execute('DELETE FROM sessions WHERE id = ?', [sessionRow.id]).catch(() => {});
        throw createAuthError('Session expired. Please log in again.', 'SESSION_EXPIRED');
      }
      // MIPM-211: the idle timeout was only the cookie's lifetime, so the token
      // itself stayed valid for 8 hours. A session unused for longer than the
      // timeout now ends here. Checked on a cache miss, so at least once a minute.
      if (await sessionIdle(sessionRow.last_seen_at, decoded)) {
        await pool.execute('DELETE FROM sessions WHERE id = ?', [sessionRow.id]).catch(() => {});
        throw createAuthError('You were signed out after a period without activity. Please log in again.', 'SESSION_IDLE');
      }
      await pool.execute('UPDATE sessions SET last_seen_at = NOW() WHERE id = ?', [sessionRow.id]);
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
    // MIPM-76: the person's name, for audit entries and notifications that name them.
    name:                 accountName,
    role:                 decoded.role,
    orgId:                decoded.orgId ?? null,
    siteId:               decoded.siteId ?? null,
    platformAdmin:        Boolean(decoded.platformAdmin),
    token,
    passwordResetRequired: decoded.passwordResetRequired ?? false,
  };

  // Populate cache for subsequent requests
  await sessionCacheSet(key, result);
  return refusePendingPasswordReset(result, allowPasswordReset);
}

/**
 * authenticate — verifies JWT and injects req.user
 * req.user = { userId, email, role, orgId, siteId, token }
 * Platform admin compatibility: orgId = null, siteId = null
 * A forced password-change session is refused (403 PASSWORD_RESET_REQUIRED).
 */
function authenticate(req, res, next) {
  return authenticateRequest(req, res, next, { allowPasswordReset: false });
}

/**
 * authenticateAllowingPasswordReset — as authenticate, but also admits a forced
 * password-change session. Only for the routes the set-new-password screen calls.
 */
function authenticateAllowingPasswordReset(req, res, next) {
  return authenticateRequest(req, res, next, { allowPasswordReset: true });
}

// MIPM-71: the sign-in cookie's lifetime is the session timeout, and it was set
// once at sign-in, so a person working the whole time was signed out exactly that
// long after signing in. Each authenticated request now renews it, so the timeout
// counts from the last request. Timeouts are read the way sign-in reads them and
// cached for a minute (a changed timeout applies within a minute).
const _timeoutCache = new Map();
async function sessionTimeoutMinutes(user) {
  const isPlatform = Boolean(user.platformAdmin) || user.role === 'platform_admin';
  const key = isPlatform ? 'platform' : `org:${user.orgId ?? ''}`;
  const hit = _timeoutCache.get(key);
  if (hit && hit.until > Date.now()) return hit.minutes;
  let minutes = isPlatform ? 60 : 30;
  try {
    const [[row]] = isPlatform
      ? await pool.execute("SELECT config_value AS v FROM system_config WHERE config_key = 'platform_admin_session_timeout_minutes' LIMIT 1")
      : await pool.execute('SELECT session_timeout_minutes AS v FROM organisations WHERE id = ? LIMIT 1', [user.orgId ?? null]);
    minutes = Math.max(30, parseInt(row?.v, 10) || minutes);
  } catch (_) { /* keep the default; the cookie is still renewed */ }
  _timeoutCache.set(key, { minutes, until: Date.now() + 60_000 });
  return minutes;
}

// True when a session's last use is older than its organisation's timeout.
async function sessionIdle(lastSeenAt, user) {
  const lastSeen = sessionExpiryMs(lastSeenAt);
  if (!lastSeen || Number.isNaN(lastSeen)) return false;
  return Date.now() - lastSeen > (await sessionTimeoutMinutes(user)) * 60 * 1000;
}

async function renewSessionCookie(res, user) {
  const minutes = await sessionTimeoutMinutes(user);
  res.cookie('mims_token', user.token, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: minutes * 60 * 1000,
  });
}

async function authenticateRequest(req, res, next, options) {
  const fromCookie = !readBearer(req);
  const token = readBearer(req) || readCookie(req, 'mims_token');
  if (!token) {
    return res.status(401).json({
      error: 'Access denied. No token provided.',
      error_code: 'AUTH_TOKEN_MISSING',
      should_logout: true,
    });
  }

  try {
    req.user = await validateAccessToken(token, options);
  } catch (err) {
    const status = Number(err?.status || 401);
    const message = String(err?.message || 'Invalid or expired token. Please log in again.');
    return res.status(status).json({
      error: message,
      error_code: err?.code || (status === 503 ? 'AUTH_SERVICE_UNAVAILABLE' : 'AUTH_TOKEN_INVALID'),
      should_logout: Boolean(err?.shouldLogout),
    });
  }

  // A forced password-change session keeps its own short cookie (10 minutes).
  if (fromCookie && !req.user.passwordResetRequired) await renewSessionCookie(res, req.user);

  // Time-boxed org access is checked here rather than per route. It was written
  // as standalone middleware and mounted on nothing, so an expired grant let
  // every request through (PAUD-2 item 12). Chaining it to the one place every
  // authenticated route already passes through is what closes that.
  return requireAccessNotExpired(req, res, next);
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
 * requireCapability(privilegeKey) — restrict a route to users whose security
 * group grants the given capability (feature.action, e.g. 'case.close').
 * Superadmin bypasses; falls back to the privilege's default_allowed_roles.
 * Builds on the existing access_* framework (accessConfigurationService).
 */
function requireCapability(privilegeKey) {
  return async (req, res, next) => {
    try {
      // Lazy require to avoid a circular dependency (service → db → middleware).
      const { userHasActivityPrivilege } = require('../services/accessConfigurationService');
      const allowed = await userHasActivityPrivilege(req.user, privilegeKey);
      if (!allowed) {
        return res.status(403).json({
          error: 'You do not have permission to perform this action.',
          error_code: 'CAPABILITY_FORBIDDEN',
          should_logout: false,
        });
      }
      next();
    } catch (_) {
      return res.status(500).json({ error: 'Permission check failed.', error_code: 'CAPABILITY_CHECK_ERROR' });
    }
  };
}

function requireScopedCapability(privilegeKey) {
  return async (req, res, next) => {
    try {
      const { resolveActivityScope } = require('../services/accessConfigurationService');
      const scope = await resolveActivityScope(req.user, privilegeKey);
      if (scope === 'none') {
        return res.status(403).json({
          error: 'You do not have permission to perform this action.',
          error_code: 'CAPABILITY_FORBIDDEN',
          should_logout: false,
        });
      }
      req.activityScope = { ...(req.activityScope || {}), [privilegeKey]: scope };
      return next();
    } catch (err) {
      console.error(`requireScopedCapability(${privilegeKey}) failed:`, err);
      return res.status(500).json({ error: 'Permission check failed.', error_code: 'CAPABILITY_CHECK_ERROR' });
    }
  };
}

/**
 * requireOrg — blocks requests where orgId is null (non-platform-admin must have an active org)
 * Global platform admins remain exempt because they operate without org scoping.
 */
function requireOrg(req, res, next) {
  if (hasGlobalAdminScope(req.user)) return next();
  // MIPM-5: the organisation comes only from the signed-in session, which sign-in and
  // /auth/switch-org set after checking membership. An x-org-id header used to be taken
  // at face value when the session had none; nothing sends it, so it is no longer read.
  const activeOrgId = req.user.orgId || null;
  if (!activeOrgId) {
    return res.status(403).json({
      error: 'No active organisation. Please contact your administrator.',
      error_code: 'ORG_CONTEXT_MISSING',
      should_logout: false,
    });
  }
  req.user.orgId = activeOrgId;
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
  } catch (err) {
    // Fail closed: if the expiry cannot be read, an expired grant must not slip through.
    console.error('requireAccessNotExpired: organisation access lookup failed:', err.message);
    return res.status(503).json({
      error: 'Organisation access could not be checked. Please try again shortly.',
      error_code: 'AUTH_SERVICE_UNAVAILABLE',
      should_logout: false,
    });
  }
}

/**
 * requireModule(moduleKey) — the admin's module grant, enforced on the server.
 * Same rule as the browser's ModuleAccessGuard: platform admins pass; everyone
 * else needs the module from their role's defaults or a personal grant. Module grants were
 * checked only in the browser, so any signed-in user could call e.g. the report
 * APIs directly (T11 / M-69). Use after authenticate.
 */
function requireModule(moduleKey) {
  return async (req, res, next) => {
    try {
      if (hasGlobalAdminScope(req.user)) return next();
      // Same resolver as sign-in: role defaults, then personal rows (MIPM-134).
      const modules = await getUserModules(req.user?.userId);
      if (modules.includes(moduleKey)) return next();
      return res.status(403).json({
        error: 'You do not have access to this module.',
        error_code: 'MODULE_FORBIDDEN',
        should_logout: false,
      });
    } catch (err) {
      console.error(`requireModule(${moduleKey}) failed:`, err);
      return res.status(500).json({ error: 'Permission check failed.', error_code: 'MODULE_CHECK_ERROR' });
    }
  };
}

module.exports = { sessionIdle, authenticate, authenticateAllowingPasswordReset, requireRole, requireCapability, requireScopedCapability, requireModule, requireOrg, requireAccessNotExpired, readCookie, validateAccessToken, sessionCacheInvalidate, endAllSessions, isSwitchedOff, ACCESS_ENDED_MESSAGE, ACCESS_ENDED_CODE, sessionExpiryMs, readBearer };
