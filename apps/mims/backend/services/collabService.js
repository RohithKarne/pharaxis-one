'use strict';

/**
 * collabService.js — Theme 5 (Wave 4) comments / mentions / watchers helper.
 *
 * Works alongside Wave 0 #3 (casePresenceService — in-memory presence over
 * WebSocket). Persists comment threads + watcher lists + mention notifications.
 *
 * Case comments themselves are listed and posted by routes/cases.js against the
 * deployed case_comments table (case_id, user_id, comment). The comment
 * functions that lived here wrote columns that table does not have (T16).
 *
 * Surface:
 *   listWatchers({orgId, caseId})
 *   addWatcher({orgId, caseId, userId, reason})
 *   removeWatcher({orgId, caseId, userId})
 *
 *   listMentions({orgId, userId, unreadOnly})
 *   markMentionSeen({orgId, mentionId, userId})
 */

const pool = require('../database/db');

// ── Watchers ─────────────────────────────────────────────────────────────────

async function listWatchers({ orgId, caseId }) {
  const [rows] = await pool.execute(
    `SELECT w.user_id, w.reason, w.created_at,
            u.name, u.email
       FROM case_watchers w
       LEFT JOIN users u ON u.id = w.user_id
      WHERE w.org_id = ? AND w.case_id = ?
      ORDER BY w.created_at`,
    [orgId, caseId]
  );
  return rows;
}

async function addWatcher({ orgId, caseId, userId, reason = 'manual' }) {
  if (!userId) return { ok: false };
  await pool.execute(
    `INSERT IGNORE INTO case_watchers (org_id, case_id, user_id, reason)
     VALUES (?, ?, ?, ?)`,
    [orgId, caseId, userId, reason]
  );
  return { ok: true };
}

async function removeWatcher({ orgId, caseId, userId }) {
  await pool.execute(
    `DELETE FROM case_watchers WHERE org_id = ? AND case_id = ? AND user_id = ?`,
    [orgId, caseId, userId]
  );
  return { ok: true };
}

// ── Mentions ─────────────────────────────────────────────────────────────────

async function listMentions({ orgId, userId, unreadOnly = false, limit = 50 }) {
  const params = [orgId, userId];
  let sql = `
    SELECT m.id, m.case_id, m.comment_id, m.mentioned_by_user_id,
           m.seen, m.seen_at, m.created_at,
           u.name AS mentioned_by_name,
           c.comment AS body_md
      FROM case_mentions m
      LEFT JOIN users u ON u.id = m.mentioned_by_user_id
      LEFT JOIN case_comments c ON c.id = m.comment_id
     WHERE m.org_id = ? AND m.mentioned_user_id = ?
  `;
  if (unreadOnly) sql += ' AND m.seen = 0';
  // Inlined integer: a bound LIMIT ? is refused by execute() on this server.
  sql += ` ORDER BY m.created_at DESC LIMIT ${Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)}`;
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function markMentionSeen({ orgId, mentionId, userId }) {
  await pool.execute(
    `UPDATE case_mentions SET seen = 1, seen_at = NOW()
      WHERE id = ? AND org_id = ? AND mentioned_user_id = ?`,
    [mentionId, orgId, userId]
  );
  return { ok: true };
}

module.exports = {
  listWatchers, addWatcher, removeWatcher,
  listMentions, markMentionSeen,
};
