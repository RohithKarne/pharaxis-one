'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../../database/db');
const JWT_SECRET = require('../../utils/jwtSecret');
const { authenticate, requireRole, sessionCacheInvalidate } = require('../../middleware/auth');
const { hasGlobalAdminScope } = require('../../utils/adminScope');

const router = express.Router();

function normalizeTokenDate(value) {
  if (!value) return null;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function decodeSessionToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (_) {
    return null;
  }
}

function deriveApplication(role) {
  const normalized = String(role || '').toLowerCase();
  return normalized === 'admin' || normalized === 'superadmin' ? 'Admin' : 'MIMS';
}

router.get('/logged-in-users', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const [sessionRows] = await pool.execute(
      `SELECT s.id, s.user_id, s.token, s.created_at, s.expires_at, u.name
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE STR_TO_DATE(s.expires_at, '%Y-%m-%d %H:%i:%s') > NOW()
       ORDER BY s.created_at DESC
       LIMIT 500`
    );

    const decodedRows = [];
    const orgIdSet = new Set();

    for (const row of sessionRows) {
      const decoded = decodeSessionToken(row.token);
      if (!decoded) continue;

      if (!hasGlobalAdminScope(req.user) && Number(decoded.orgId || 0) !== Number(req.user.orgId || 0)) {
        continue;
      }

      const orgId = Number(decoded.orgId || 0);
      if (orgId > 0) orgIdSet.add(orgId);

      decodedRows.push({
        session_id: row.id,
        login_date: row.created_at,
        user_id: row.user_id,
        full_name: row.name || 'User',
        application: deriveApplication(decoded.role),
        org_id: orgId > 0 ? orgId : null,
      });
    }

    let orgNameById = new Map();
    if (orgIdSet.size > 0) {
      const orgIds = Array.from(orgIdSet);
      const placeholders = orgIds.map(() => '?').join(',');
      const [orgRows] = await pool.execute(
        `SELECT id, name FROM organisations WHERE id IN (${placeholders})`,
        orgIds
      );
      orgNameById = new Map(orgRows.map((row) => [Number(row.id), row.name]));
    }

    const users = decodedRows.map((row) => ({
      session_id: row.session_id,
      login_date: row.login_date,
      user_id: row.user_id,
      full_name: row.full_name,
      application: row.application,
      tenant: row.org_id ? (orgNameById.get(Number(row.org_id)) || `Org ${row.org_id}`) : 'Platform',
    }));

    users.sort((a, b) => {
      const aDate = normalizeTokenDate(a.login_date);
      const bDate = normalizeTokenDate(b.login_date);
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return bDate.getTime() - aDate.getTime();
    });

    return res.json({ users });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load logged in users.' });
  }
});

router.post('/logged-in-users/:sessionId/sign-out', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Invalid session id.' });
    }

    const [[sessionRow]] = await pool.execute(
      `SELECT s.id, s.user_id, s.token, u.name
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.id = ?
       LIMIT 1`,
      [sessionId]
    );

    if (!sessionRow) return res.status(404).json({ error: 'Session not found.' });

    const decoded = decodeSessionToken(sessionRow.token);
    const rowOrgId = Number(decoded?.orgId || 0);
    if (!hasGlobalAdminScope(req.user) && rowOrgId !== Number(req.user.orgId || 0)) {
      return res.status(403).json({ error: 'You can only sign out users in your tenant.' });
    }

    const [userSessionRows] = await pool.execute(
      'SELECT id, token FROM sessions WHERE user_id = ?',
      [sessionRow.user_id]
    );

    const sessionIdsToRevoke = [];
    const tokensToInvalidate = [];

    for (const row of userSessionRows) {
      const decodedRow = decodeSessionToken(row.token);
      const rowOrgIdValue = Number(decodedRow?.orgId || 0);
      if (!hasGlobalAdminScope(req.user) && rowOrgIdValue !== Number(req.user.orgId || 0)) {
        continue;
      }
      sessionIdsToRevoke.push(row.id);
      tokensToInvalidate.push(row.token);
    }

    if (sessionIdsToRevoke.length === 0) {
      return res.status(404).json({ error: 'No active sessions found to sign out.' });
    }

    const placeholders = sessionIdsToRevoke.map(() => '?').join(',');
    await pool.execute(
      `DELETE FROM sessions WHERE id IN (${placeholders})`,
      sessionIdsToRevoke
    );

    await Promise.all(tokensToInvalidate.map((token) => sessionCacheInvalidate(token)));
    await pool.execute(
      `UPDATE login_audit
       SET logout_time = NOW()
       WHERE user_id = ? AND logout_time IS NULL
       ORDER BY login_time DESC
       LIMIT 1`,
      [sessionRow.user_id]
    );

    return res.json({
      success: true,
      user_id: sessionRow.user_id,
      full_name: sessionRow.name || 'User',
      revoked_sessions: sessionIdsToRevoke.length,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to sign out user.' });
  }
});

module.exports = router;
