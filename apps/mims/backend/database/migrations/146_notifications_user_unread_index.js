'use strict';

/**
 * Migration 146 — index for one user's notification feed and counts.
 *
 * Every open MIMS tab polls GET /api/notifications?unread_only=true, which reads
 * the user's unread rows and counts unread, awaiting-acknowledgement and failed
 * items. Only single-column indexes existed, so MySQL either intersected
 * idx_notifications_user with idx_notifications_read (every unread row in the
 * table) or read each of the user's rows from the table. Leading with
 * (user_id, is_read) finds the unread rows directly, and the three trailing
 * columns let the counts be answered from the index alone.
 *
 * Adds an index only; no data changes. Skipped only when the index already
 * exists (ER_DUP_KEYNAME); any other failure stops startup.
 */

async function up(conn) {
  try {
    await conn.execute(
      `ALTER TABLE notifications ADD INDEX idx_notifications_user_unread
         (user_id, is_read, requires_acknowledgement, acknowledged_at, delivery_status)`
    );
  } catch (err) {
    if (err && err.code === 'ER_DUP_KEYNAME') return; // already applied
    throw err;
  }
}

module.exports = { up };
