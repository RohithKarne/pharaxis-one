'use strict';

/**
 * admin/userPreferences.js — Saved Views for admin list screens.
 * Personal to each user unless its owner shares it with their organisation
 * (migration 148). A shared view is read-only to everyone but its owner.
 * v1: filter combinations only.
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
    // The user's own views, then views others in the same organisation chose to share.
    const [rows] = await pool.execute(
      `SELECT up.id, up.view_name, up.filter_json, up.is_default, up.is_shared, up.updated_at,
              (up.user_id = ?) AS is_mine, u.name AS owner_name
         FROM user_preferences up
         LEFT JOIN users u ON u.id = up.user_id
        WHERE up.screen_key = ?
          AND (up.user_id = ? OR (up.is_shared = 1 AND up.org_id IS NOT NULL AND up.org_id = ?))
        ORDER BY (up.user_id = ?) DESC, up.is_default DESC, up.view_name ASC`,
      [req.user.userId, screenKey, req.user.userId, req.user.orgId ?? null, req.user.userId]
    );
    const views = rows.map(r => ({
      ...r,
      is_mine: !!r.is_mine,
      // Another user's default is theirs, not this user's.
      is_default: r.is_mine ? r.is_default : 0,
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
  const { screen_key, view_name, filter_json, is_default = 0, is_shared = 0 } = req.body || {};
  if (!screen_key?.trim() || !view_name?.trim() || filter_json == null) {
    return res.status(400).json({ error: 'screen_key, view_name, and filter_json are required.' });
  }
  if (is_shared && !req.user.orgId) {
    return res.status(400).json({ error: 'Sharing needs an organisation. Views saved without one stay personal.' });
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
      `INSERT INTO user_preferences (user_id, screen_key, view_name, filter_json, is_default, is_shared, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE filter_json = VALUES(filter_json), is_default = VALUES(is_default),
         is_shared = VALUES(is_shared), org_id = VALUES(org_id), updated_at = NOW()`,
      [req.user.userId, screen_key.trim(), view_name.trim(), JSON.stringify(filter_json), is_default ? 1 : 0,
        is_shared ? 1 : 0, req.user.orgId ?? null]
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
    const [result] = await pool.execute(
      'DELETE FROM user_preferences WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    // A shared view is visible to others but only its owner may delete it.
    if (!result.affectedRows) return res.status(404).json({ error: 'View not found among your own views.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /user-preferences/views/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
