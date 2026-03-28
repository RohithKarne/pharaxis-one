'use strict';

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'mims-dev-secret-change-in-production';

/**
 * authenticate — verifies JWT and injects req.user
 * req.user = { userId, email, role, orgId, siteId }
 * Superadmin: orgId = null, siteId = null
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = {
      userId:               decoded.userId,
      email:                decoded.email,
      role:                 decoded.role,
      orgId:                decoded.orgId   ?? null,
      siteId:               decoded.siteId  ?? null,
      passwordResetRequired: decoded.passwordResetRequired ?? false
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token. Please log in again.' });
  }
}

/**
 * requireRole(...roles) — restrict route to specific roles
 * Usage: router.delete('/x', authenticate, requireRole('admin', 'superadmin'), handler)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    next();
  };
}

/**
 * requireOrg — blocks requests where orgId is null (non-superadmin must have an active org)
 * Superadmin is exempt.
 */
function requireOrg(req, res, next) {
  if (req.user.role === 'superadmin') return next();
  if (!req.user.orgId)
    return res.status(403).json({ error: 'No active organisation. Please contact your administrator.' });
  next();
}

module.exports = { authenticate, requireRole, requireOrg };
