'use strict';

/**
 * Migration 186 — "Configure folders" becomes "Configure content" (write-route
 * sweep, Saad 2026-10-14).
 *
 * WHY
 * Content Settings — the publishing checks run before content is published,
 * the alert defaults and the content lists (document categories, languages) —
 * could be changed by every content author. An author could switch off the
 * checks a publisher relies on. They now need the same permission as setting
 * up folders, so its name says what it covers.
 */

async function up(conn) {
  await conn.execute(
    "UPDATE access_activity_privileges SET label = 'Configure content (folders, settings, lists)' WHERE privilege_key = 'content.folder.configure'"
  );
}

module.exports = { up };
