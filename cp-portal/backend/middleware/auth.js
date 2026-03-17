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

module.exports = { authenticateAdmin, authenticatePortal, requirePortalAuth, ADMIN_SECRET, PORTAL_SECRET };
