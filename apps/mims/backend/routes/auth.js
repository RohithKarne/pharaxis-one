'use strict';

const express        = require('express');
const router         = express.Router();
const authController = require('../controllers/authController');
const { authenticate, requireRole } = require('../middleware/auth');
const pool           = require('../database/db');
const { logger } = require('../services/logger');
const {
  accountCreationRateLimiter,
  loginRateLimiter,
  recoveryRateLimiter,
  verificationRateLimiter,
} = require('../middleware/rateLimiters');

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function resolveSessionTimeoutMinutes(req) {
  try {
    if (req.user.role === 'superadmin') {
      const [[row]] = await pool.execute(
        "SELECT config_value FROM system_config WHERE config_key = 'superadmin_session_timeout_minutes' LIMIT 1"
      );
      return Math.max(15, toNumber(row?.config_value, 60));
    }

    if (!req.user.orgId) return 30;
    const [[org]] = await pool.execute(
      'SELECT session_timeout_minutes FROM organisations WHERE id = ? LIMIT 1',
      [req.user.orgId]
    );
    return Math.max(15, toNumber(org?.session_timeout_minutes, 30));
  } catch (_) {
    return req.user.role === 'superadmin' ? 60 : 30;
  }
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  const ts = new Date(expiresAt).getTime();
  if (Number.isNaN(ts)) return false;
  return ts < Date.now();
}

// Public
router.post('/register', accountCreationRateLimiter, authController.register);
router.post('/login', loginRateLimiter, authController.login);
router.post('/email-verification/send-code', verificationRateLimiter, authController.sendEmailVerificationCode);
router.post('/email-verification/verify-code', verificationRateLimiter, authController.verifyEmailCode);
router.post('/forgot-password/send-code', recoveryRateLimiter, authController.sendForgotPasswordCode);
router.post('/forgot-password/verify-code', verificationRateLimiter, authController.verifyForgotPasswordCode);
router.post('/forgot-password/reset', recoveryRateLimiter, authController.completeForgotPasswordReset);
router.post('/2fa/send-email-code', verificationRateLimiter, authController.sendTwoFactorEmailCode);
router.post('/2fa/setup/totp', verificationRateLimiter, authController.beginTotpSetup);
router.post('/2fa/verify', verificationRateLimiter, authController.verifyTwoFactor);
router.post('/2fa/skip-setup', verificationRateLimiter, authController.skipTwoFactorSetup);

// Protected
router.get('/me',              authenticate, authController.me);
router.post('/switch-org',     authenticate, authController.switchOrg);
router.post('/reset-password', authenticate, authController.resetPassword);
router.post('/change-password', authenticate, authController.changePassword);

// GET /api/auth/sessions — Session management data (Sprint 14 G11)
router.get('/sessions', authenticate, async (req, res) => {
  try {
    const token = extractBearerToken(req);

    const [rows] = await pool.execute(
      `SELECT id, token, created_at, expires_at
       FROM sessions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.userId]
    );

    const sessions = rows.map((row) => ({
      id: row.id,
      is_current: !!token && row.token === token,
      created_at: row.created_at,
      expires_at: row.expires_at,
      is_expired: isExpired(row.expires_at),
    }));

    const currentSession = sessions.find((s) => s.is_current) || null;

    const [recentLogins] = await pool.execute(
      `SELECT id, login_time, logout_time, status, fail_reason
       FROM login_audit
       WHERE user_id = ?
       ORDER BY login_time DESC
       LIMIT 20`,
      [req.user.userId]
    );

    const sessionTimeoutMinutes = await resolveSessionTimeoutMinutes(req);

    return res.json({
      sessionTimeoutMinutes,
      activeSessionCount: sessions.filter((s) => !s.is_expired).length,
      currentSession,
      sessions,
      recentLogins,
    });
  } catch (err) {
    logger.error({ err, user_id: req.user?.userId, route: '/api/auth/sessions' }, 'Failed to load sessions');
    return res.status(500).json({ error: err.message || 'Failed to load sessions.' });
  }
});

// POST /api/auth/sessions/revoke-others — revoke all other tracked sessions
router.post('/sessions/revoke-others', authenticate, async (req, res) => {
  try {
    const token = extractBearerToken(req);
    if (!token) return res.status(400).json({ error: 'Current token not found.' });

    const [result] = await pool.execute(
      'DELETE FROM sessions WHERE user_id = ? AND token <> ?',
      [req.user.userId, token]
    );

    return res.json({ success: true, revoked: Number(result?.affectedRows || 0) });
  } catch (err) {
    logger.error({ err, user_id: req.user?.userId, route: '/api/auth/sessions/revoke-others' }, 'Failed to revoke other sessions');
    return res.status(500).json({ error: err.message || 'Failed to revoke sessions.' });
  }
});

// POST /api/auth/sessions/:id/revoke — revoke specific tracked session
router.post('/sessions/:id/revoke', authenticate, async (req, res) => {
  try {
    const token = extractBearerToken(req);
    const sessionId = Number(req.params.id);
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Invalid session id.' });
    }

    const [[row]] = await pool.execute(
      'SELECT id, token FROM sessions WHERE id = ? AND user_id = ? LIMIT 1',
      [sessionId, req.user.userId]
    );
    if (!row) return res.status(404).json({ error: 'Session not found.' });

    const [result] = await pool.execute(
      'DELETE FROM sessions WHERE id = ? AND user_id = ?',
      [sessionId, req.user.userId]
    );

    return res.json({
      success: !!result?.affectedRows,
      revokedCurrent: !!token && row.token === token,
    });
  } catch (err) {
    logger.error({ err, user_id: req.user?.userId, route: '/api/auth/sessions/:id/revoke' }, 'Failed to revoke selected session');
    return res.status(500).json({ error: err.message || 'Failed to revoke session.' });
  }
});

// Logout — records logout time in login_audit (AUD-03) + clears tracked session
router.post('/logout', authenticate, async (req, res) => {
  const token = extractBearerToken(req);
  await pool.execute(
    `UPDATE login_audit SET logout_time = NOW()
     WHERE user_id = ? AND logout_time IS NULL
     ORDER BY login_time DESC LIMIT 1`,
    [req.user.userId]
  );
  if (token) {
    await pool.execute('DELETE FROM sessions WHERE token = ?', [token]).catch(() => {});
  }
  logger.info({ user_id: req.user?.userId, route: '/api/auth/logout' }, 'User logged out');
  res.json({ message: 'Logged out.' });
});

// POST /api/auth/unlock-user — admin manually unlocks a locked account (AC-E6)
router.post('/unlock-user', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    await pool.execute(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?`,
      [user_id]
    );
    res.json({ success: true, message: 'User account unlocked.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/org-logo — returns logo_url for the current user's active org
router.get('/org-logo', authenticate, async (req, res) => {
  try {
    if (!req.user.orgId) return res.json({ logo_url: null });
    const [[org]] = await pool.execute(
      'SELECT logo_url FROM organisations WHERE id = ?',
      [req.user.orgId]
    );
    res.json({ logo_url: org?.logo_url || null });
  } catch (err) {
    logger.error({ err, user_id: req.user?.userId, route: '/api/auth/org-logo' }, 'Failed to load org logo');
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
