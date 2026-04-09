'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticate } = require('../middleware/auth');

function parseIntSafe(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseJsonSafe(value, fallback = null) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

// GET /api/notifications — user notification feed
router.get('/notifications', authenticate, async (req, res) => {
  try {
    const limit = clamp(parseIntSafe(req.query.limit, 50), 1, 200);
    const offset = Math.max(0, parseIntSafe(req.query.offset, 0));

    const [rows] = await pool.execute(
      `SELECT id, category, title, message, link_url, metadata, is_read, created_at, read_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      [req.user.userId]
    );
    const [[{ cnt: total }]] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ?',
      [req.user.userId]
    );
    const [[{ cnt: unread }]] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.userId]
    );

    return res.json({
      notifications: rows.map(row => ({ ...row, metadata: parseJsonSafe(row.metadata, null) })),
      total,
      unread,
      limit,
      offset,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// POST /api/notifications/:id/read — mark one notification as read
router.post('/notifications/:id/read', authenticate, async (req, res) => {
  try {
    const [result] = await pool.execute(
      `UPDATE notifications
       SET is_read = 1, read_at = COALESCE(read_at, NOW())
       WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Notification not found.' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// POST /api/notifications/read-all — mark all unread as read
router.post('/notifications/read-all', authenticate, async (req, res) => {
  try {
    const [result] = await pool.execute(
      `UPDATE notifications
       SET is_read = 1, read_at = COALESCE(read_at, NOW())
       WHERE user_id = ? AND is_read = 0`,
      [req.user.userId]
    );
    return res.json({ success: true, updated: result.affectedRows || 0 });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error.' });
  }
});

module.exports = router;
