'use strict';

const express        = require('express');
const router         = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const pool           = require('../database/db');

// Public
router.post('/register',       authController.register);
router.post('/login',          authController.login);
router.post('/forgot-password/send-code', authController.sendForgotPasswordCode);
router.post('/forgot-password/verify-code', authController.verifyForgotPasswordCode);
router.post('/forgot-password/reset', authController.completeForgotPasswordReset);
router.post('/2fa/send-email-code', authController.sendTwoFactorEmailCode);
router.post('/2fa/setup/totp', authController.beginTotpSetup);
router.post('/2fa/verify',     authController.verifyTwoFactor);
router.post('/2fa/skip-setup', authController.skipTwoFactorSetup);

// Protected
router.get('/me',              authenticate, authController.me);
router.post('/switch-org',     authenticate, authController.switchOrg);
router.post('/reset-password', authenticate, authController.resetPassword);
router.post('/change-password', authenticate, authController.changePassword);

// Logout — records logout time in login_audit (AUD-03)
router.post('/logout', authenticate, async (req, res) => {
  const pool = require('../database/db');
  await pool.execute(
    `UPDATE login_audit SET logout_time = NOW()
     WHERE user_id = ? AND logout_time IS NULL
     ORDER BY login_time DESC LIMIT 1`,
    [req.user.userId]
  );
  res.json({ message: 'Logged out.' });
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
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
