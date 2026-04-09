/**
 * notify.js — S4-3: Create in-app notifications for active portal users of a client (MySQL async)
 * Called when news, documents, or safety alerts are published.
 */
const { pool } = require('../database/db');

/**
 * @param {number} clientId
 * @param {'news'|'document'|'safety'} type
 * @param {string} title
 * @param {number} itemId
 */
async function notifyPortalUsers(clientId, type, title, itemId) {
  try {
    const [users] = await pool.execute(
      'SELECT id, notif_prefs_json FROM cp_portal_users WHERE client_id = ? AND is_active = 1',
      [clientId]
    );
    for (const u of users) {
      let prefs = { news: true, documents: true, safety: true };
      try { prefs = { ...prefs, ...JSON.parse(u.notif_prefs_json || '{}') }; } catch {}
      const prefKey = type === 'document' ? 'documents' : type;
      if (prefs[prefKey] === false) continue;
      await pool.execute(
        `INSERT IGNORE INTO cp_notifications (portal_user_id, client_id, type, title, item_id)
         VALUES (?, ?, ?, ?, ?)`,
        [u.id, clientId, type, title, itemId]
      );
    }
  } catch (err) {
    console.error('[notify] failed:', err.message);
  }
}

module.exports = { notifyPortalUsers };
