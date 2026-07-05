'use strict';

const pool = require('../../database/db');
const { signPayload } = require('./webhookDispatcher');
const { assertPublicHttpUrl } = require('../../utils/ssrfGuard');

// H-09: stop retrying after this many attempts so a dead endpoint doesn't get
// re-POSTed forever and the queue can drain.
const MAX_ATTEMPTS = 8;

async function deliverPendingWebhooks(limit = 50) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.min(Math.max(Number(limit), 1), 200) : 50;
  const [rows] = await pool.execute(
    `SELECT d.*, s.url, s.signing_secret
       FROM webhook_deliveries d JOIN webhook_subscriptions s ON s.id = d.subscription_id
      WHERE s.status = 'active' AND d.delivered_at IS NULL AND d.attempt_count < ${MAX_ATTEMPTS}
        AND (d.next_retry_at IS NULL OR d.next_retry_at <= CURRENT_TIMESTAMP)
      ORDER BY d.id ASC LIMIT ${safeLimit}`
  );
  const results = [];
  for (const row of rows) {
    const payload = typeof row.payload === 'string' ? JSON.parse(row.payload || '{}') : row.payload;
    try {
      // H-01: re-validate on every attempt (defends against DNS rebinding to an internal IP).
      await assertPublicHttpUrl(row.url);
      const res = await fetch(row.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-MIMS-Signature': signPayload(row.signing_secret, payload), 'X-MIMS-Event': row.event },
        body: JSON.stringify(payload),
      });
      const body = await res.text().catch(() => '');
      await pool.execute(
        `UPDATE webhook_deliveries
            SET response_status=?, response_body=?, attempt_count=attempt_count+1,
                delivered_at=CASE WHEN ? BETWEEN 200 AND 299 THEN CURRENT_TIMESTAMP ELSE delivered_at END,
                next_retry_at=CASE WHEN ? BETWEEN 200 AND 299 THEN NULL ELSE DATE_ADD(CURRENT_TIMESTAMP, INTERVAL LEAST(POWER(2, attempt_count + 1), 60) MINUTE) END
          WHERE id=?`,
        [res.status, body.slice(0, 4000), res.status, res.status, row.id]
      );
      results.push({ id: row.id, status: res.status });
    } catch (err) {
      await pool.execute(
        `UPDATE webhook_deliveries SET response_status=0, response_body=?, attempt_count=attempt_count+1, next_retry_at=DATE_ADD(CURRENT_TIMESTAMP, INTERVAL LEAST(POWER(2, attempt_count + 1), 60) MINUTE) WHERE id=?`,
        [err.message, row.id]
      );
      results.push({ id: row.id, error: err.message });
    }
  }
  return results;
}

module.exports = { deliverPendingWebhooks };
