/**
 * routes/auth.js — Authentication Routes (v1.0)
 *
 * WHAT THIS FILE DOES:
 * - Defines the URL endpoints (routes) for authentication
 * - Maps each URL + HTTP method to the right controller function
 *
 * ROUTE OVERVIEW:
 *   POST /api/auth/register  → Create a new user account
 *   POST /api/auth/login     → Login and receive a JWT token
 *   GET  /api/auth/me        → Get current logged-in user (protected)
 *
 * HOW EXPRESS ROUTING WORKS:
 * When the browser sends a request to /api/auth/login, Express matches it
 * to the route below and calls authController.login to handle it.
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Public routes (no login required)
router.post('/register', authController.register);
router.post('/login', authController.login);

// Protected route (must be logged in — sends JWT token in Authorization header)
router.get('/me', authenticate, authController.me);

// POST /api/auth/logout — records logout time in login_audit (AUD-03)
router.post('/logout', authenticate, async (req, res) => {
  const pool = require('../database/db');
  // Update the most recent login_audit record for this user with logout time
  await pool.execute(
    `UPDATE login_audit SET logout_time = NOW()
     WHERE user_id = ? AND logout_time IS NULL
     ORDER BY login_time DESC LIMIT 1`,
    [req.user.userId]
  );
  res.json({ message: 'Logged out.' });
});

module.exports = router;
