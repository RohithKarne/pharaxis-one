/**
 * notify.js — S4-3: Create in-app notifications for active portal users of a client (MySQL async)
 * Called when news, documents, or safety alerts are published.
 */
const { pool } = require('../database/db');
const { canSee } = require('./audience');

// CPPM-25: where each item type keeps its audience list.
const AUDIENCE_SOURCE = {
  document: { table: 'cp_documents',     column: 'visible_to_json' },
  news:     { table: 'cp_news_posts',    column: 'target_types_json' },
  safety:   { table: 'cp_safety_alerts', column: 'target_types_json' },
};

// CPPM-108 (Decision 3, Rohith, 3 Oct 2026): a high or critical safety alert — a
// Dear HCP letter, for one — always reaches the doctor. The Preferences switch
// covers medium and informational alerts only.
const ALWAYS_SENT_SEVERITIES = ['high', 'critical'];

/**
 * @param {number} clientId
 * @param {'news'|'document'|'safety'} type
 * @param {string} title
 * @param {number} itemId
 */
async function notifyPortalUsers(clientId, type, title, itemId) {
  try {
    // Read the item's audience from the item itself, so every caller gets it right.
    const source = AUDIENCE_SOURCE[type];
    let audienceJson = null;
    let alwaysSent = false;
    if (source) {
      const [[item]] = await pool.execute(
        `SELECT ${source.column} AS audience${type === 'safety' ? ', severity' : ''} FROM ${source.table} WHERE id = ? AND client_id = ?`,
        [itemId, clientId]
      );
      if (!item) return;
      audienceJson = item.audience;
      alwaysSent = type === 'safety' && ALWAYS_SENT_SEVERITIES.includes(String(item.severity || '').toLowerCase());
    }

    const [users] = await pool.execute(
      'SELECT id, user_type, notif_prefs_json FROM cp_portal_users WHERE client_id = ? AND is_active = 1',
      [clientId]
    );
    for (const u of users) {
      if (!canSee(audienceJson, u.user_type)) continue;
      let prefs = { news: true, documents: true, safety: true };
      try { prefs = { ...prefs, ...JSON.parse(u.notif_prefs_json || '{}') }; } catch {}
      const prefKey = type === 'document' ? 'documents' : type;
      if (prefs[prefKey] === false && !alwaysSent) continue;
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

module.exports = { notifyPortalUsers, ALWAYS_SENT_SEVERITIES };
