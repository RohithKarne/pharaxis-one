'use strict';

const pool = require('../database/db');

function serializeMetadata(metadata) {
  if (metadata === undefined) return null;
  try {
    return JSON.stringify(metadata);
  } catch (_) {
    return null;
  }
}

async function createNotification(userId, payload) {
  if (!userId || !payload?.title) return null;

  const {
    category = 'general',
    title,
    message = null,
    linkUrl = null,
    metadata,
    severity = 'info',
    requiresAcknowledgement = false,
    eventKey = null,
  } = payload;

  const [result] = await pool.execute(
    `INSERT INTO notifications
       (user_id, category, title, message, link_url, metadata, severity, requires_acknowledgement, event_key, is_read,
        delivery_status, delivery_attempts, max_delivery_attempts, last_delivery_attempt_at, delivered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'delivered', 1, 3, NOW(), NOW())`,
    [
      userId,
      category,
      title,
      message,
      linkUrl,
      serializeMetadata(metadata),
      severity,
      requiresAcknowledgement ? 1 : 0,
      eventKey,
    ]
  );

  if (result.insertId) {
    await recordNotificationAttempt(result.insertId, 1, 'delivered', null);
  }
  return result.insertId || null;
}

async function createNotifications(userIds, payload) {
  const uniqueUserIds = [...new Set((userIds || []).map((value) => Number(value)).filter(Boolean))];
  const ids = [];
  for (const userId of uniqueUserIds) {
    const createdId = await createNotification(userId, payload);
    if (createdId) ids.push(createdId);
  }
  return ids;
}

async function recordNotificationAttempt(notificationId, attemptNo, status, errorMessage = null) {
  if (!notificationId) return;
  await pool.execute(
    `INSERT INTO notification_delivery_attempts (notification_id, attempt_no, status, error_message)
     VALUES (?, ?, ?, ?)`,
    [notificationId, Number(attemptNo || 1), status || 'delivered', errorMessage || null]
  );
}

async function markNotificationFailed(notificationId, errorMessage = null, maxRetries = 3, nextRetryAt = null) {
  if (!notificationId) return;
  await pool.execute(
    `UPDATE notifications
     SET delivery_status = 'failed',
         max_delivery_attempts = GREATEST(COALESCE(max_delivery_attempts, 3), ?),
         delivery_attempts = COALESCE(delivery_attempts, 0) + 1,
         last_delivery_attempt_at = NOW(),
         next_retry_at = COALESCE(?, next_retry_at),
         failure_reason = ?
     WHERE id = ?`,
    [Number(maxRetries || 3), nextRetryAt || null, errorMessage || null, notificationId]
  );
  const [[row]] = await pool.execute('SELECT delivery_attempts FROM notifications WHERE id = ?', [notificationId]);
  await recordNotificationAttempt(notificationId, Number(row?.delivery_attempts || 1), 'failed', errorMessage || null);
}

async function markNotificationDelivered(notificationId) {
  if (!notificationId) return;
  await pool.execute(
    `UPDATE notifications
     SET delivery_status = 'delivered',
         delivery_attempts = COALESCE(delivery_attempts, 0) + 1,
         last_delivery_attempt_at = NOW(),
         next_retry_at = NULL,
         failure_reason = NULL,
         delivered_at = NOW()
     WHERE id = ?`,
    [notificationId]
  );
  const [[row]] = await pool.execute('SELECT delivery_attempts FROM notifications WHERE id = ?', [notificationId]);
  await recordNotificationAttempt(notificationId, Number(row?.delivery_attempts || 1), 'delivered', null);
}

async function retryFailedNotifications(limit = 100, options = {}) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit || 100)));
  const userId = Number(options?.userId || 0);
  const hasUserScope = Number.isInteger(userId) && userId > 0;

  const whereParts = [
    `delivery_status = 'failed'`,
    `(next_retry_at IS NULL OR next_retry_at <= NOW())`,
    `COALESCE(delivery_attempts, 0) < COALESCE(max_delivery_attempts, 3)`,
  ];
  const params = [];
  if (hasUserScope) {
    whereParts.push('user_id = ?');
    params.push(userId);
  }
  const [rows] = await pool.execute(
    `SELECT id, delivery_attempts, max_delivery_attempts
     FROM notifications
     WHERE ${whereParts.join(' AND ')}
     ORDER BY COALESCE(next_retry_at, created_at) ASC
     LIMIT ${safeLimit}`,
    params
  );

  let retried = 0;
  for (const row of rows || []) {
    await markNotificationDelivered(row.id);
    retried += 1;
  }
  return retried;
}

module.exports = {
  createNotification,
  createNotifications,
  recordNotificationAttempt,
  markNotificationFailed,
  markNotificationDelivered,
  retryFailedNotifications,
};
