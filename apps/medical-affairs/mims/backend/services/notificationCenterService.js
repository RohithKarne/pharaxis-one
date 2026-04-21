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
       (user_id, category, title, message, link_url, metadata, severity, requires_acknowledgement, event_key, is_read)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
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

module.exports = {
  createNotification,
  createNotifications,
};
