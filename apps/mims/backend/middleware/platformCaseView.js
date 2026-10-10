'use strict';

/**
 * platformCaseView.js — a platform admin reads every organisation's cases
 * (Rohith's decision, 2026-10-10, reversing the support-grant rule of
 * 2026-10-04). What stays from that rule is the record: each case a platform
 * admin opens is written to the audit log, one row per case, not per request.
 *
 * Chained from authenticate, like the access-expiry check, so it covers every
 * case route without touching them.
 */

const pool = require('../database/db');
const { isPlatformAdmin } = require('../utils/adminScope');
const { logAudit } = require('../utils/auditLog');

const CASE_OPEN_PATH = /^\/api\/cases\/(\d+)(\?|$)/;

async function recordPlatformCaseView(req, res, next) {
  const opened = req.method === 'GET' && req.user && isPlatformAdmin(req.user) && CASE_OPEN_PATH.exec(req.originalUrl || '');
  if (!opened) return next();
  try {
    const caseId = Number(opened[1]);
    // The case screen reads the case several times while it loads.
    const [[recent]] = await pool.execute(
      `SELECT id FROM audit_logs WHERE action = 'PLATFORM_ADMIN_CASE_VIEW' AND user_id = ? AND entity_id = ?
         AND created_at > NOW() - INTERVAL 10 MINUTE LIMIT 1`,
      [req.user.userId, caseId]
    );
    if (!recent) {
      await logAudit(req.user.userId, req.user.email, 'PLATFORM_ADMIN_CASE_VIEW', 'case', caseId, {
        org_id: Number(req.user.orgId) || null,
      });
    }
  } catch (err) {
    // The record must not block the read; the read itself is still audited by the case routes.
    console.error('recordPlatformCaseView: audit write failed:', err.message);
  }
  return next();
}

module.exports = { recordPlatformCaseView };
