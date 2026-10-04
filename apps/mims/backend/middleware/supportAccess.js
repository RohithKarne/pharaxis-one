'use strict';

/**
 * supportAccess.js — a platform admin reads a client's cases only under that
 * client's support grant (Rohith's decision, 2026-10-04).
 *
 * Before, every case route dropped its organisation filter for a platform admin,
 * so Pharaxis staff read every organisation's cases whatever organisation they
 * had selected. Now, on a case request, a platform admin:
 *   - must have selected an organisation (the sign-in's org switch), and
 *   - that organisation must hold an active support grant (org_support_access),
 * and for the request they act as that organisation's admin — the same
 * org-scoped paths every tenant admin takes — with each case they open recorded.
 *
 * Chained from authenticate, like the access-expiry check: one place every
 * authenticated route passes through, instead of ~40 call sites.
 */

const pool = require('../database/db');
const { isPlatformAdmin } = require('../utils/adminScope');
const { logAudit } = require('../utils/auditLog');

// Case data: the case routers (/api/cases/**), the inbox that feeds them and the
// case audit trail. Admin, content, reporting and platform screens are untouched.
const CASE_DATA_PATH = /^\/api\/(cases|inbox)(\/|$)|^\/api\/admin\/(case-audit-trail|audit-trail)(\/|$)/;
const CASE_OPEN_PATH = /^\/api\/cases\/(\d+)(\?|$)/;

async function activeGrant(orgId) {
  const [[grant]] = await pool.execute(
    `SELECT id FROM org_support_access
     WHERE org_id = ? AND revoked_at IS NULL AND expires_at > NOW()
     ORDER BY expires_at DESC LIMIT 1`,
    [orgId]
  );
  return grant || null;
}

async function applySupportScope(req, res, next) {
  if (!req.user || !isPlatformAdmin(req.user) || !CASE_DATA_PATH.test(req.originalUrl || '')) return next();
  try {
    const orgId = Number(req.user.orgId) || null;
    if (!orgId) {
      return res.status(403).json({
        error: 'Select an organisation first. Cases are read one organisation at a time, under its support access.',
        error_code: 'SUPPORT_ACCESS_REQUIRED',
        should_logout: false,
      });
    }
    const grant = await activeGrant(orgId);
    if (!grant) {
      const [[org]] = await pool.execute('SELECT name FROM organisations WHERE id = ?', [orgId]);
      return res.status(403).json({
        error: `${org?.name || 'This organisation'} has not granted support access to its cases. Ask its administrator to grant it under System › Security › Support Access.`,
        error_code: 'SUPPORT_ACCESS_REQUIRED',
        should_logout: false,
      });
    }
    // A copy: req.user came from the session cache and must not be changed there.
    req.user = { ...req.user, role: 'admin', platformAdmin: false, supportAccess: true, supportGrantId: grant.id };
    const opened = req.method === 'GET' && CASE_OPEN_PATH.exec(req.originalUrl || '');
    if (opened) {
      // One row per case opened, not one per request: the case screen reads the
      // case several times while it loads.
      const [[recent]] = await pool.execute(
        `SELECT id FROM audit_logs WHERE action = 'SUPPORT_ACCESS_CASE_VIEW' AND user_id = ? AND entity_id = ?
           AND created_at > NOW() - INTERVAL 10 MINUTE LIMIT 1`,
        [req.user.userId, Number(opened[1])]
      );
      if (!recent) {
        await logAudit(req.user.userId, req.user.email, 'SUPPORT_ACCESS_CASE_VIEW', 'case', Number(opened[1]), {
          org_id: orgId, grant_id: grant.id,
        });
      }
    }
    return next();
  } catch (err) {
    // Fail closed, as the access-expiry check does.
    console.error('applySupportScope: support access lookup failed:', err.message);
    return res.status(503).json({
      error: 'Support access could not be checked. Please try again shortly.',
      error_code: 'AUTH_SERVICE_UNAVAILABLE',
      should_logout: false,
    });
  }
}

module.exports = { applySupportScope };
