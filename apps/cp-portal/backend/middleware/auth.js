/**
 * auth.js — CP Portal Authentication Middleware (MySQL async)
 *
 * Two separate auth contexts:
 *   authenticateAdmin  — CP Admin Console JWT
 *   authenticatePortal — CP Portal user JWT (optional for anonymous submissions)
 */

const jwt        = require('jsonwebtoken');
const { pool }   = require('../database/db');

if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
  if (!process.env.CP_ADMIN_JWT_SECRET || !process.env.CP_PORTAL_JWT_SECRET) {
    console.error('FATAL: CP_ADMIN_JWT_SECRET and CP_PORTAL_JWT_SECRET env vars must be set in non-development environments.');
    process.exit(1);
  }
}
const ADMIN_SECRET  = process.env.CP_ADMIN_JWT_SECRET  || 'cp-admin-insecure-dev-only';
const PORTAL_SECRET = process.env.CP_PORTAL_JWT_SECRET || 'cp-portal-insecure-dev-only';
const isDevLike = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
const ADMIN_RUNTIME_SECRET = process.env.CP_ADMIN_JWT_SECRET || (isDevLike ? 'cp-admin-local-dev-only-change-me' : ADMIN_SECRET);
const PORTAL_RUNTIME_SECRET = process.env.CP_PORTAL_JWT_SECRET || (isDevLike ? 'cp-portal-local-dev-only-change-me' : PORTAL_SECRET);
if (isDevLike && (!process.env.CP_ADMIN_JWT_SECRET || !process.env.CP_PORTAL_JWT_SECRET)) {
  console.warn('CP admin/portal JWT secrets are missing in development/test; using deterministic local defaults.')
}

async function authenticateAdmin(req, res, next) {
  const token = req.cookies?.cp_admin_token ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!token) return res.status(401).json({ error: 'Admin authentication required.' });
  try {
    // Pin the algorithm so only our HS256 tokens are accepted.
    req.admin = jwt.verify(token, ADMIN_RUNTIME_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired admin token.' });
  }
  // SEC: re-check the account is still active on every request. A stateless JWT
  // otherwise stays valid for its full 12h lifetime even after an admin is
  // deactivated — a removed/compromised admin must lose access immediately.
  try {
    const [[row]] = await pool.execute('SELECT is_active, token_version FROM cp_admin_users WHERE id = ?', [req.admin.adminId]);
    if (!row || !row.is_active) return res.status(401).json({ error: 'Your admin account is no longer active.' });
    // CP-26: reject tokens whose version is stale (revoked by a password change).
    if ((row.token_version ?? 0) !== (req.admin.tv ?? 0)) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    next();
  } catch (err) {
    next(err);
  }
}

async function authenticatePortal(req, _res, next) {
  // Optional auth — anonymous users can still submit
  const token = req.cookies?.cp_portal_token ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (token) {
    try {
      const payload = jwt.verify(token, PORTAL_RUNTIME_SECRET, { algorithms: ['HS256'] });
      payload.id = payload.userId; // alias: routes use req.portalUser.id
      req.portalUser = payload;
      const [[userRecord]] = await pool.execute(
        'SELECT is_active, token_version FROM cp_portal_users WHERE id = ?',
        [req.portalUser.userId]
      );
      // CP-26: drop deactivated users AND tokens revoked by a password change.
      if (!userRecord || !userRecord.is_active || (userRecord.token_version ?? 0) !== (payload.tv ?? 0)) {
        req.portalUser = null; // treat as anonymous
      }
    } catch {
      req.portalUser = null; // ignore invalid token for anonymous access
    }
  }
  next();
}

async function requirePortalAuth(req, res, next) {
  if (!req.portalUser) {
    return res.status(401).json({ error: 'Portal login required.' });
  }
  try {
    const [[userRecord]] = await pool.execute(
      'SELECT is_active FROM cp_portal_users WHERE id = ?',
      [req.portalUser.userId]
    );
    if (!userRecord || !userRecord.is_active) {
      return res.status(401).json({ error: 'Your account has been deactivated.' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

function requireClientAccess(req, res, next) {
  if (!req.admin) return res.status(401).json({ error: 'Admin authentication required.' });
  if (req.admin.role === 'superadmin') return next();

  const requestedClientId = String(req.params.clientId || req.query.clientId || '');
  const adminClientId     = req.admin.clientId != null ? String(req.admin.clientId) : null;

  if (!adminClientId) {
    return res.status(403).json({ error: 'Access denied. Your account has no client scope assigned.' });
  }
  if (adminClientId !== requestedClientId) {
    return res.status(403).json({ error: 'Access denied. You can only manage your own client.' });
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin) return res.status(401).json({ error: 'Admin authentication required.' });
    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = {
  authenticateAdmin,
  authenticatePortal,
  requirePortalAuth,
  requireClientAccess,
  requireRole,
  ADMIN_SECRET: ADMIN_RUNTIME_SECRET,
  PORTAL_SECRET: PORTAL_RUNTIME_SECRET
};
