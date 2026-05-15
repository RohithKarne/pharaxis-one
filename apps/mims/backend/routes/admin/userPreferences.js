'use strict';

/**
 * admin/userPreferences.js — Saved Views for admin list screens.
 * Personal to each user; not shared. v1: filter combinations only.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate } = require('../../middleware/auth');

// GET /api/admin/user-preferences/views?screen_key=users
router.get('/user-preferences/views', authenticate, async (req, res) => {
  const screenKey = String(req.query.screen_key || '').trim();
  if (!screenKey) return res.status(400).json({ error: 'screen_key is required.' });
  try {
    const [rows] = await pool.execute(
      `SELECT id, view_name, filter_json, is_default, updated_at
         FROM user_preferences
        WHERE user_id = ? AND screen_key = ?
        ORDER BY is_default DESC, view_name ASC`,
      [req.user.userId, screenKey]
    );
    const views = rows.map(r => ({
      ...r,
      filter_json: typeof r.filter_json === 'string' ? JSON.parse(r.filter_json) : r.filter_json,
    }));
    res.json({ views });
  } catch (err) {
    console.error('GET /user-preferences/views error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/user-preferences/views
// Body: { screen_key, view_name, filter_json, is_default? }
router.post('/user-preferences/views', authenticate, async (req, res) => {
  const { screen_key, view_name, filter_json, is_default = 0 } = req.body || {};
  if (!screen_key?.trim() || !view_name?.trim() || filter_json == null) {
    return res.status(400).json({ error: 'screen_key, view_name, and filter_json are required.' });
  }
  try {
    if (is_default) {
      // Clear other defaults for this user + screen
      await pool.execute(
        'UPDATE user_preferences SET is_default = 0 WHERE user_id = ? AND screen_key = ?',
        [req.user.userId, screen_key.trim()]
      );
    }
    await pool.execute(
      `INSERT INTO user_preferences (user_id, screen_key, view_name, filter_json, is_default)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE filter_json = VALUES(filter_json), is_default = VALUES(is_default), updated_at = NOW()`,
      [req.user.userId, screen_key.trim(), view_name.trim(), JSON.stringify(filter_json), is_default ? 1 : 0]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('POST /user-preferences/views error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/user-preferences/views/:id
router.delete('/user-preferences/views/:id', authenticate, async (req, res) => {
  try {
    await pool.execute(
      'DELETE FROM user_preferences WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /user-preferences/views/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
