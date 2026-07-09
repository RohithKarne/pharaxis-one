/**
 * Admin Auth — /api/admin/auth
 * Login, logout, profile for CP Portal admin users
 */

const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, ADMIN_SECRET } = require('../../middleware/auth');

// SEC: admin console is same-origin only and never linked cross-site, so Strict
// SameSite is safe here and gives full CSRF protection on the admin surface.
const COOKIE_OPTS = { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' }

// SEC: constant dummy hash so login timing is identical whether or not the email
// exists — otherwise the missing-user path returns faster (no bcrypt) and leaks
// which admin emails are registered.
const DUMMY_HASH = bcrypt.hashSync('cp-timing-equalizer', 12);

// POST /api/admin/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const [[user]] = await pool.execute('SELECT * FROM cp_admin_users WHERE email = ? AND is_active = 1', [email]);
    if (!user) {
      bcrypt.compareSync(password, DUMMY_HASH); // equalize timing with the valid-user path
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

    const token = jwt.sign(
      // CP-26: embed token_version for revocation on password change.
      { adminId: user.id, email: user.email, name: user.name, role: user.role, clientId: user.client_id ?? null, tv: user.token_version ?? 0 },
      ADMIN_SECRET,
      { expiresIn: '12h' }
    );

    await pool.execute(`UPDATE cp_admin_users SET updated_at = NOW() WHERE id = ?`, [user.id]);

    // SEC: token is delivered only via the httpOnly cookie, never in the body.
    res.cookie('cp_admin_token', token, { ...COOKIE_OPTS, maxAge: 12 * 60 * 60 * 1000 })
       .json({ admin: { id: user.id, name: user.name, email: user.email, role: user.role, clientId: user.client_id ?? null } });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/auth/me
router.get('/me', authenticateAdmin, async (req, res) => {
  try {
    const [[user]] = await pool.execute('SELECT id, name, email, role, client_id, created_at FROM cp_admin_users WHERE id = ?', [req.admin.adminId]);
    if (!user) return res.status(404).json({ error: 'Admin user not found.' });
    res.json({ admin: { ...user, clientId: user.client_id ?? null } });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/admin/auth/password
router.patch('/password', authenticateAdmin, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords are required.' });
    if (new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });

    const [[user]] = await pool.execute('SELECT * FROM cp_admin_users WHERE id = ?', [req.admin.adminId]);
    if (!bcrypt.compareSync(current_password, user.password)) return res.status(401).json({ error: 'Current password incorrect.' });

    const hash = bcrypt.hashSync(new_password, 12);
    await pool.execute(`UPDATE cp_admin_users SET password = ?, token_version = token_version + 1, updated_at = NOW() WHERE id = ?`, [hash, user.id]);
    res.json({ message: 'Password updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/auth/logout — clear auth cookie
router.post('/logout', async (_req, res) => {
  try {
    res.clearCookie('cp_admin_token', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' })
       .json({ message: 'Logged out.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
