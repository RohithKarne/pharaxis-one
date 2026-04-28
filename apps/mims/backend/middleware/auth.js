'use strict';

const pool = require('../database/db');
const jwt = require('jsonwebtoken');
const JWT_SECRET = require('../utils/jwtSecret');

/**
 * authenticate — verifies JWT and injects req.user
 * req.user = { userId, email, role, orgId, siteId, token }
 * Superadmin: orgId = null, siteId = null
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Session tracking enforcement (Sprint 14 G11):
    // - If a token row exists, validate expiry and allow.
    // - If token row is missing but user has tracked sessions, treat token as revoked.
    // - If no tracked sessions exist yet, allow for backward compatibility.
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
          return res.status(401).json({ error: 'Session expired. Please log in again.' });
        }
      } else {
        const [[countRow]] = await pool.execute(
          'SELECT COUNT(*) AS cnt FROM sessions WHERE user_id = ?',
          [decoded.userId]
        );
        requireTrackedSession = Number(countRow?.cnt || 0) > 0;
      }
    } catch (_) {
      // Fail-open for DB issues to avoid locking out all users on transient DB faults.
      sessionFound = true;
      requireTrackedSession = false;
    }

    if (requireTrackedSession && !sessionFound) {
      return res.status(401).json({ error: 'Session revoked or invalid. Please log in again.' });
    }

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      orgId: decoded.orgId ?? null,
      siteId: decoded.siteId ?? null,
      token,
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

module.exports = { authenticate, requireRole, requireOrg, requireAccessNotExpired };
