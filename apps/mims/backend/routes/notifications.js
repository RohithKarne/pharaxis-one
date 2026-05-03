'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticate } = require('../middleware/auth');
const { emitDataSync } = require('../services/appRealtimeService');
const { markNotificationDelivered, retryFailedNotifications } = require('../services/notificationCenterService');

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

function toBoolQuery(value) {
  return value === '1' || value === 'true';
}

// GET /api/notifications — user notification feed
router.get('/notifications', authenticate, async (req, res) => {
  try {
    const limit = clamp(parseIntSafe(req.query.limit, 50), 1, 200);
    const offset = Math.max(0, parseIntSafe(req.query.offset, 0));
    const category = String(req.query.category || '').trim();
    const severity = String(req.query.severity || '').trim();
    const unreadOnly = toBoolQuery(String(req.query.unread_only || ''));
    const ackRequiredOnly = toBoolQuery(String(req.query.ack_required_only || ''));

    const where = ['user_id = ?'];
    const params = [req.user.userId];

    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    if (severity) {
      where.push('severity = ?');
      params.push(severity);
    }
    if (unreadOnly) where.push('is_read = 0');
    if (ackRequiredOnly) where.push('requires_acknowledgement = 1');

    const whereSql = where.join(' AND ');

    const [rows] = await pool.execute(
      `SELECT
         id,
         category,
         title,
         message,
         link_url,
         metadata,
         severity,
         requires_acknowledgement,
         event_key,
         is_read,
         created_at,
         read_at,
         acknowledged_at,
         delivery_status,
         delivery_attempts,
         max_delivery_attempts,
         last_delivery_attempt_at,
         next_retry_at,
         failure_reason
       FROM notifications
       WHERE ${whereSql}
       ORDER BY
         CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
         created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM notifications WHERE ${whereSql}`,
      params
    );
    const [[{ unread }]] = await pool.execute(
      'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.userId]
    );
    const [[{ ack_pending }]] = await pool.execute(
      `SELECT COUNT(*) AS ack_pending
       FROM notifications
       WHERE user_id = ? AND requires_acknowledgement = 1 AND acknowledged_at IS NULL`,
      [req.user.userId]
    );
    const [[{ failed_delivery }]] = await pool.execute(
      `SELECT COUNT(*) AS failed_delivery
       FROM notifications
       WHERE user_id = ? AND delivery_status = 'failed'`,
      [req.user.userId]
    );

    return res.json({
      notifications: rows.map((row) => ({ ...row, metadata: parseJsonSafe(row.metadata, null) })),
      total,
      unread,
      ack_pending,
      failed_delivery,
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
    emitDataSync({
      userIds: [req.user.userId],
      domains: ['alerts', 'dashboard'],
      reason: 'notification.read',
      payload: { notificationId: Number(req.params.id) },
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// POST /api/notifications/:id/acknowledge — acknowledge a critical notification
router.post('/notifications/:id/acknowledge', authenticate, async (req, res) => {
  try {
    const [result] = await pool.execute(
      `UPDATE notifications
       SET acknowledged_at = COALESCE(acknowledged_at, NOW()), acknowledged_by = ?, is_read = 1, read_at = COALESCE(read_at, NOW())
       WHERE id = ? AND user_id = ? AND requires_acknowledgement = 1`,
      [req.user.userId, req.params.id, req.user.userId]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Acknowledgement target not found.' });
    emitDataSync({
      userIds: [req.user.userId],
      domains: ['alerts', 'dashboard'],
      reason: 'notification.acknowledged',
      payload: { notificationId: Number(req.params.id) },
    });
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
    emitDataSync({
      userIds: [req.user.userId],
      domains: ['alerts', 'dashboard'],
      reason: 'notification.read_all',
      payload: { updated: Number(result.affectedRows || 0) },
    });
    return res.json({ success: true, updated: result.affectedRows || 0 });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// POST /api/notifications/:id/retry — manual retry of failed notification delivery marker
router.post('/notifications/:id/retry', authenticate, async (req, res) => {
  try {
    const [[row]] = await pool.execute(
      `SELECT id, user_id, delivery_status
       FROM notifications
       WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.userId]
    );
    if (!row) return res.status(404).json({ error: 'Notification not found.' });
    if (row.delivery_status !== 'failed') {
      return res.status(400).json({ error: 'Retry is allowed only for failed notifications.' });
    }
    await markNotificationDelivered(row.id);
    emitDataSync({
      userIds: [req.user.userId],
      domains: ['alerts'],
      reason: 'notification.retry',
      payload: { notificationId: Number(row.id) },
    });
    return res.json({ success: true, retried_id: row.id });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// POST /api/notifications/retry-failed — retry due failed notifications for current user
router.post('/notifications/retry-failed', authenticate, async (req, res) => {
  try {
    const retried = await retryFailedNotifications(Number(req.body?.limit || 100), {
      userId: req.user.userId,
    });
    emitDataSync({
      userIds: [req.user.userId],
      domains: ['alerts'],
      reason: 'notification.retry_failed',
      payload: { retried: Number(retried || 0) },
    });
    return res.json({ success: true, retried });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error.' });
  }
});

module.exports = router;
