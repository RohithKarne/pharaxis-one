/**
 * Admin Portal Users — /api/admin/users
 * View and manage portal-facing users (patients, HCPs, etc.)
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');

router.get('/:clientId', authenticateAdmin, (req, res) => {
  const { user_type, search } = req.query;
  let query = 'SELECT id, first_name, last_name, email, user_type, specialty, country, is_active, is_verified, last_login_at, created_at FROM cp_portal_users WHERE client_id = ?';
  const params = [req.params.clientId];
  if (user_type) { query += ' AND user_type = ?'; params.push(user_type); }
  if (search) { query += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)'; const s = `%${search}%`; params.push(s, s, s); }
  query += ' ORDER BY created_at DESC';
  const rows = db.prepare(query).all(...params);
  res.json({ users: rows });
});

router.patch('/:clientId/:userId', authenticateAdmin, (req, res) => {
  const { first_name, last_name, email, user_type, country, is_active, is_verified } = req.body;
  const updates = [], params = [];
  const VALID_USER_TYPES = ['hcp', 'physician', 'patient', 'non_hcp', 'other'];
  if (first_name  !== undefined) { updates.push('first_name = ?');  params.push(first_name); }
  if (last_name   !== undefined) { updates.push('last_name = ?');   params.push(last_name); }
  if (email       !== undefined) { updates.push('email = ?');       params.push(email); }
  if (user_type   !== undefined && VALID_USER_TYPES.includes(user_type)) {
    updates.push('user_type = ?'); params.push(user_type);
  }
  if (country     !== undefined) { updates.push('country = ?');     params.push(country); }
  if (is_active   !== undefined) { updates.push('is_active = ?');   params.push(is_active ? 1 : 0); }
  if (is_verified !== undefined) { updates.push('is_verified = ?'); params.push(is_verified ? 1 : 0); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
  params.push(req.params.userId, req.params.clientId);
  db.prepare(`UPDATE cp_portal_users SET ${updates.join(', ')} WHERE id=? AND client_id=?`).run(...params);
  audit(req.admin, req.params.clientId, 'UPDATE', 'portal_user', req.params.userId, { fields: Object.keys(req.body) });
  res.json({ message: 'User updated.' });
});

router.delete('/:clientId/:userId', authenticateAdmin, (req, res) => {
  db.prepare('UPDATE cp_portal_users SET is_active=0 WHERE id=? AND client_id=?').run(req.params.userId, req.params.clientId);
  audit(req.admin, req.params.clientId, 'DELETE', 'portal_user', req.params.userId, {});
  res.json({ message: 'User deactivated.' });
});

module.exports = router;
