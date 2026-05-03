'use strict';

const pool = require('../database/db');
const { logger } = require('./logger');

let schemaReadyPromise = null;

function normalizeOptionalString(value, maxLength = 255) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

async function ensureMobilePushSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS mobile_push_devices (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id INT NOT NULL,
          org_id INT NULL,
          push_token VARCHAR(255) NOT NULL,
          platform VARCHAR(32) NOT NULL DEFAULT 'unknown',
          device_label VARCHAR(255) NULL,
          app_build VARCHAR(64) NULL,
          provider VARCHAR(32) NOT NULL DEFAULT 'expo',
          is_active TINYINT(1) NOT NULL DEFAULT 1,
          last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_push_at DATETIME NULL,
          last_error TEXT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_mobile_push_token (push_token),
          KEY idx_mobile_push_user (user_id),
          KEY idx_mobile_push_org (org_id),
          CONSTRAINT fk_mobile_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
    })().catch((err) => {
      schemaReadyPromise = null;
      throw err;
    });
  }
  return schemaReadyPromise;
}

async function upsertMobilePushDevice(userId, orgId, payload = {}) {
  await ensureMobilePushSchema();
  const pushToken = normalizeOptionalString(payload.pushToken, 255);
  if (!pushToken) throw new Error('pushToken is required.');

  await pool.execute(
    `INSERT INTO mobile_push_devices
       (user_id, org_id, push_token, platform, device_label, app_build, provider, is_active, last_seen_at, last_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, NOW(), NULL)
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       org_id = VALUES(org_id),
       platform = VALUES(platform),
       device_label = VALUES(device_label),
       app_build = VALUES(app_build),
       provider = VALUES(provider),
       is_active = 1,
       last_seen_at = NOW(),
       last_error = NULL,
       updated_at = NOW()`,
    [
      Number(userId),
      orgId ? Number(orgId) : null,
      pushToken,
      normalizeOptionalString(payload.platform, 32) || 'unknown',
      normalizeOptionalString(payload.deviceLabel, 255),
      normalizeOptionalString(payload.appBuild, 64),
      normalizeOptionalString(payload.provider, 32) || 'expo',
    ]
  );

  const [[device]] = await pool.execute(
    `SELECT id, user_id, org_id, push_token, platform, device_label, app_build, provider, is_active, last_seen_at
     FROM mobile_push_devices
     WHERE push_token = ?`,
    [pushToken]
  );
  return device || null;
}

async function deactivateMobilePushDevice(userId, pushToken) {
  await ensureMobilePushSchema();
  const [result] = await pool.execute(
    `UPDATE mobile_push_devices
     SET is_active = 0, updated_at = NOW()
     WHERE user_id = ? AND push_token = ?`,
    [Number(userId), String(pushToken || '').trim()]
  );
  return Number(result?.affectedRows || 0);
}

async function listActiveMobilePushDevicesForUsers(userIds) {
  await ensureMobilePushSchema();
  const ids = [...new Set((userIds || []).map((value) => Number(value)).filter(Boolean))];
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id, user_id, org_id, push_token, platform, provider
     FROM mobile_push_devices
     WHERE is_active = 1 AND user_id IN (${placeholders})`,
    ids
  );
  return rows || [];
}

async function listMobilePushDevicesForUser(userId) {
  await ensureMobilePushSchema();
  const [rows] = await pool.execute(
    `SELECT id, push_token, platform, device_label, app_build, provider, is_active, last_seen_at, last_push_at, last_error
     FROM mobile_push_devices
     WHERE user_id = ?
     ORDER BY last_seen_at DESC, id DESC`,
    [Number(userId)]
  );
  return rows || [];
}

function buildExpoMessages(devices, payload) {
  const body = String(payload?.message || payload?.title || '').trim();
  const title = String(payload?.title || '').trim();
  return devices
    .filter((device) => /^ExponentPushToken\[.+\]$|^ExpoPushToken\[.+\]$/.test(String(device.push_token || '')))
    .map((device) => ({
      to: device.push_token,
      sound: 'default',
      title,
      body,
      data: {
        category: payload?.category || 'general',
        linkUrl: payload?.linkUrl || null,
        metadata: payload?.metadata || null,
        eventKey: payload?.eventKey || null,
      },
    }));
}

async function sendPushNotificationsToUsers(userIds, payload) {
  const devices = await listActiveMobilePushDevicesForUsers(userIds);
  const messages = buildExpoMessages(devices, payload);
  if (messages.length === 0) return { attempted: 0, delivered: 0, failed: 0 };

  let delivered = 0;
  let failed = 0;
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    const body = await response.json().catch(() => ({}));
    const tickets = Array.isArray(body?.data) ? body.data : [];

    for (let index = 0; index < messages.length; index += 1) {
      const ticket = tickets[index] || {};
      const device = devices.find((item) => item.push_token === messages[index].to);
      if (ticket.status === 'ok') {
        delivered += 1;
        if (device?.id) {
          await pool.execute(
            `UPDATE mobile_push_devices
             SET last_push_at = NOW(), last_error = NULL, updated_at = NOW()
             WHERE id = ?`,
            [device.id]
          );
        }
      } else {
        failed += 1;
        if (device?.id) {
          await pool.execute(
            `UPDATE mobile_push_devices
             SET last_error = ?, updated_at = NOW()
             WHERE id = ?`,
            [normalizeOptionalString(ticket?.message || 'Push delivery failed.', 1000), device.id]
          );
        }
      }
    }
  } catch (err) {
    failed = messages.length;
    logger.warn({ err }, 'Mobile push delivery failed');
  }

  return {
    attempted: messages.length,
    delivered,
    failed,
  };
}

module.exports = {
  deactivateMobilePushDevice,
  ensureMobilePushSchema,
  listMobilePushDevicesForUser,
  sendPushNotificationsToUsers,
  upsertMobilePushDevice,
};
