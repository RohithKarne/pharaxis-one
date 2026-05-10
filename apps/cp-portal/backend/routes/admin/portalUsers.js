/**
 * Admin Portal Users — /api/admin/users
 * View and manage portal-facing users (patients, HCPs, etc.)
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');

router.use('/:clientId', authenticateAdmin, requireClientAccess);
const { audit } = require('../../utils/audit');

router.get('/:clientId', authenticateAdmin, async (req, res) => {
  try {
    const { user_type, search } = req.query;
    let query = 'SELECT id, first_name, last_name, email, user_type, specialty, country, is_active, is_verified, last_login_at, created_at FROM cp_portal_users WHERE client_id = ?';
    const params = [req.params.clientId];
    if (user_type) { query += ' AND user_type = ?'; params.push(user_type); }
    if (search) { query += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)'; const s = `%${search}%`; params.push(s, s, s); }
    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.execute(query, params);
    res.json({ users: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.patch('/:clientId/:userId', authenticateAdmin, async (req, res) => {
  try {
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
    await pool.execute(`UPDATE cp_portal_users SET ${updates.join(', ')} WHERE id=? AND client_id=?`, params);
    await audit(req.admin, req.params.clientId, 'UPDATE', 'portal_user', req.params.userId, { fields: Object.keys(req.body) });
    res.json({ message: 'User updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/:clientId/:userId', authenticateAdmin, async (req, res) => {
  try {
    await pool.execute('UPDATE cp_portal_users SET is_active=0 WHERE id=? AND client_id=?', [req.params.userId, req.params.clientId]);
    await audit(req.admin, req.params.clientId, 'DELETE', 'portal_user', req.params.userId, {});
    res.json({ message: 'User deactivated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
