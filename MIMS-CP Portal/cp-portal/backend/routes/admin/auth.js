/**
 * Admin Auth — /api/admin/auth
 * Login, logout, profile for CP Portal admin users
 */

const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin, ADMIN_SECRET } = require('../../middleware/auth');

// POST /api/admin/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const user = db.prepare('SELECT * FROM cp_admin_users WHERE email = ? AND is_active = 1').get(email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials.' });

  const token = jwt.sign(
    { adminId: user.id, email: user.email, name: user.name, role: user.role },
    ADMIN_SECRET,
    { expiresIn: '12h' }
  );

  db.prepare(`UPDATE cp_admin_users SET updated_at = datetime('now') WHERE id = ?`).run(user.id);

  res.json({
    token,
    admin: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

// GET /api/admin/auth/me
router.get('/me', authenticateAdmin, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, created_at FROM cp_admin_users WHERE id = ?').get(req.admin.adminId);
  if (!user) return res.status(404).json({ error: 'Admin user not found.' });
  res.json({ admin: user });
});

// PATCH /api/admin/auth/password
router.patch('/password', authenticateAdmin, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords are required.' });
  if (new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });

  const user = db.prepare('SELECT * FROM cp_admin_users WHERE id = ?').get(req.admin.adminId);
  if (!bcrypt.compareSync(current_password, user.password)) return res.status(401).json({ error: 'Current password incorrect.' });

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare(`UPDATE cp_admin_users SET password = ?, updated_at = datetime('now') WHERE id = ?`).run(hash, user.id);
  res.json({ message: 'Password updated.' });
});

module.exports = router;
