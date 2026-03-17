/**
 * auth.js — CP Portal Authentication Middleware
 *
 * Two separate auth contexts:
 *   authenticateAdmin  — CP Admin Console JWT
 *   authenticatePortal — CP Portal user JWT (optional for anonymous submissions)
 */

const jwt = require('jsonwebtoken');

if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
  if (!process.env.CP_ADMIN_JWT_SECRET || !process.env.CP_PORTAL_JWT_SECRET) {
    console.error('FATAL: CP_ADMIN_JWT_SECRET and CP_PORTAL_JWT_SECRET env vars must be set in non-development environments.');
    process.exit(1);
  }
}
const ADMIN_SECRET  = process.env.CP_ADMIN_JWT_SECRET  || 'cp-admin-insecure-dev-only';
const PORTAL_SECRET = process.env.CP_PORTAL_JWT_SECRET || 'cp-portal-insecure-dev-only';

function authenticateAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Admin authentication required.' });
  }
  try {
    req.admin = jwt.verify(header.slice(7), ADMIN_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired admin token.' });
  }
}

function authenticatePortal(req, res, next) {
  // Optional auth — anonymous users can still submit
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      req.portalUser = jwt.verify(header.slice(7), PORTAL_SECRET);
    } catch {
      // ignore invalid token for anonymous access
    }
  }
  next();
}

function requirePortalAuth(req, res, next) {
  if (!req.portalUser) {
    return res.status(401).json({ error: 'Portal login required.' });
  }
  next();
}

/**
 * requireClientAccess — API-02: client ownership validation.
 *
 * Usage: router.get('/:clientId', authenticateAdmin, requireClientAccess, handler)
 *
 * - superadmin: full access to any client.
 * - admin: must have a clientId claim in their JWT that matches req.params.clientId.
 *
 * NOTE (Sprint 2 gap): cp_admin_users has no client_id column and the login JWT does
 * not embed clientId for regular admins. Until the schema is extended and the login
 * endpoint is updated to embed clientId, regular admins will receive 403. This is the
 * safe-fail posture — better to block than to allow cross-client data access.
 */
function requireClientAccess(req, res, next) {
  if (!req.admin) return res.status(401).json({ error: 'Admin authentication required.' });

  // Superadmins manage all clients — pass through.
  if (req.admin.role === 'superadmin') return next();

  // Regular admin: check their JWT clientId against the requested clientId.
  const requestedClientId = String(req.params.clientId || req.query.clientId || '');
  const adminClientId     = req.admin.clientId != null ? String(req.admin.clientId) : null;

  if (!adminClientId) {
    // No client scope in token — deny until schema + login are updated (Sprint 2 gap).
    return res.status(403).json({ error: 'Access denied. Your account has no client scope assigned.' });
  }

  if (adminClientId !== requestedClientId) {
    return res.status(403).json({ error: 'Access denied. You can only manage your own client.' });
  }

  next();
}

module.exports = { authenticateAdmin, authenticatePortal, requirePortalAuth, requireClientAccess, ADMIN_SECRET, PORTAL_SECRET };
