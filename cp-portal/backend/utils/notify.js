/**
 * notify.js — S4-3: Create in-app notifications for all active portal users of a client
 * Called when news, documents, or safety alerts are published.
 */

const db = require('../database/db');

/**
 * @param {number} clientId
 * @param {'news'|'document'|'safety'} type
 * @param {string} title
 * @param {number} itemId
 */
function notifyPortalUsers(clientId, type, title, itemId) {
  try {
    // S4-9: fetch prefs alongside user id — skip users who opted out of this notification type
    const users = db.prepare('SELECT id, notif_prefs_json FROM cp_portal_users WHERE client_id = ? AND is_active = 1').all(clientId);
    const insert = db.prepare(`INSERT OR IGNORE INTO cp_notifications (portal_user_id, client_id, type, title, item_id) VALUES (?, ?, ?, ?, ?)`);
    const insertMany = db.transaction((users) => {
      for (const u of users) {
        let prefs = { news: true, documents: true, safety: true };
        try { prefs = { ...prefs, ...JSON.parse(u.notif_prefs_json || '{}') }; } catch {}
        // Map notification type → pref key ('document' → 'documents')
        const prefKey = type === 'document' ? 'documents' : type;
        if (prefs[prefKey] === false) continue;
        insert.run(u.id, clientId, type, title, itemId);
      }
    });
    insertMany(users);
  } catch (err) {
    // Non-fatal — never block the main action for a notification failure
    console.error('[notify] failed:', err.message);
  }
}

module.exports = { notifyPortalUsers };
