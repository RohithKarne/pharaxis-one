'use strict';

const crypto = require('crypto');
const pool = require('../../database/db');

function signPayload(secret, payload) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

async function enqueueWebhookEvent(event, payload, orgId) {
  const [subs] = await pool.execute(
    `SELECT ws.* FROM webhook_subscriptions ws JOIN api_clients c ON c.id = ws.client_id
      WHERE ws.status = 'active' AND c.org_id = ?`,
    [orgId]
  );
  let count = 0;
  for (const sub of subs) {
    const events = JSON.parse(sub.events || '[]');
    if (!events.includes(event)) continue;
    await pool.execute(
      `INSERT INTO webhook_deliveries (subscription_id, event, payload, attempt_count, next_retry_at)
       VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)`,
      [sub.id, event, JSON.stringify(payload)]
    );
    count += 1;
  }
  return count;
}

module.exports = { enqueueWebhookEvent, signPayload };
