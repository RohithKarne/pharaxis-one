/**
 * Portal Auth — /api/portal/auth
 * Registration and login for portal-facing users
 */

const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const router  = express.Router();
const db      = require('../../database/db');
const { requirePortalAuth, authenticatePortal, PORTAL_SECRET } = require('../../middleware/auth');

// POST /api/portal/auth/register
router.post('/register', (req, res) => {
  const { client_code, first_name, last_name, email, password, user_type, specialty, country, phone } = req.body;
  if (!client_code || !first_name || !last_name || !email || !password) {
    return res.status(400).json({ error: 'client_code, first_name, last_name, email and password are required.' });
  }
  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(client_code);
  if (!client) return res.status(404).json({ error: 'Portal not found.' });

  const existing = db.prepare('SELECT id FROM cp_portal_users WHERE client_id = ? AND email = ?').get(client.id, email);
  if (existing) return res.status(409).json({ error: 'Email already registered.' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(`
    INSERT INTO cp_portal_users (client_id, first_name, last_name, email, password, user_type, specialty, country, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(client.id, first_name, last_name, email, hash, user_type || 'other', specialty || null, country || null, phone || null);

  const token = jwt.sign(
    { userId: info.lastInsertRowid, clientId: client.id, email, name: `${first_name} ${last_name}`, user_type: user_type || 'other' },
    PORTAL_SECRET,
    { expiresIn: '24h' }
  );
  res.status(201).json({ token, user: { id: info.lastInsertRowid, first_name, last_name, email, user_type: user_type || 'other' } });
});

// POST /api/portal/auth/login
router.post('/login', (req, res) => {
  const { client_code, email, password } = req.body;
  if (!client_code || !email || !password) return res.status(400).json({ error: 'client_code, email and password are required.' });

  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(client_code);
  if (!client) return res.status(404).json({ error: 'Portal not found.' });

  const user = db.prepare('SELECT * FROM cp_portal_users WHERE client_id = ? AND email = ? AND is_active = 1').get(client.id, email);
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials.' });

  db.prepare(`UPDATE cp_portal_users SET last_login_at = datetime('now') WHERE id = ?`).run(user.id);

  const token = jwt.sign(
    { userId: user.id, clientId: client.id, email, name: `${user.first_name} ${user.last_name}`, user_type: user.user_type },
    PORTAL_SECRET,
    { expiresIn: '24h' }
  );
  res.json({ token, user: { id: user.id, first_name: user.first_name, last_name: user.last_name, email, user_type: user.user_type } });
});

// GET /api/portal/auth/me — get current user's submission history
router.get('/me', authenticatePortal, requirePortalAuth, (req, res) => {
  const user = db.prepare('SELECT id, first_name, last_name, email, user_type, specialty, country, created_at FROM cp_portal_users WHERE id = ?').get(req.portalUser.userId);
  const submissions = db.prepare('SELECT id, submission_type, status, external_ref, submitted_at FROM cp_submissions WHERE user_id = ? ORDER BY submitted_at DESC').all(req.portalUser.userId);
  res.json({ user, submissions });
});

module.exports = router;
