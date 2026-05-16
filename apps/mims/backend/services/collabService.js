'use strict';

/**
 * collabService.js — Theme 5 (Wave 4) comments / mentions / watchers helper.
 *
 * Works alongside Wave 0 #3 (casePresenceService — in-memory presence over
 * WebSocket). Persists comment threads + watcher lists + mention notifications.
 *
 * Surface:
 *   listComments({orgId, caseId, section?, field?})
 *   postComment({orgId, caseId, section?, field?, parentId?, body, authorId})
 *   resolveComment({orgId, commentId, userId})
 *   deleteComment({orgId, commentId, userId})
 *
 *   listWatchers({orgId, caseId})
 *   addWatcher({orgId, caseId, userId, reason})
 *   removeWatcher({orgId, caseId, userId})
 *
 *   listMentions({orgId, userId, unreadOnly})
 *   markMentionSeen({orgId, mentionId, userId})
 *
 *   notifyMentions({orgId, caseId, commentId, body, byUserId}) — internal helper.
 *     Parses @username tokens out of the body, resolves to user ids, inserts
 *     case_mentions rows, and auto-adds the mentioned users as watchers.
 */

const pool = require('../database/db');
const { logger } = require('./logger');

// ── Comments ──────────────────────────────────────────────────────────────────

async function listComments({ orgId, caseId, section = null, field = null }) {
  const params = [orgId, caseId];
  let sql = `
    SELECT c.id, c.parent_id, c.section_name, c.field_name,
           c.author_id, u.name AS author_name, u.email AS author_email,
           c.body_md, c.body_html, c.resolved, c.resolved_at, c.resolved_by,
           c.created_at, c.updated_at
      FROM case_comments c
      LEFT JOIN users u ON u.id = c.author_id
     WHERE c.org_id = ? AND c.case_id = ? AND c.deleted_at IS NULL
  `;
  if (section) { sql += ' AND (c.section_name = ? OR c.section_name IS NULL)'; params.push(section); }
  if (field)   { sql += ' AND c.field_name = ?'; params.push(field); }
  sql += ' ORDER BY c.created_at ASC';
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function postComment({ orgId, caseId, section = null, field = null, parentId = null, body, authorId }) {
  if (!body || !String(body).trim()) throw new Error('body required');
  const [r] = await pool.execute(
    `INSERT INTO case_comments
       (org_id, case_id, parent_id, section_name, field_name, author_id, body_md)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [orgId, caseId, parentId, section, field, authorId, body]
  );
  // Author becomes a watcher (if not already)
  await addWatcher({ orgId, caseId, userId: authorId, reason: 'author' }).catch(() => {});
  // Resolve mentions
  await notifyMentions({ orgId, caseId, commentId: r.insertId, body, byUserId: authorId }).catch(err =>
    logger.warn({ err: err.message }, 'collab.notifyMentions failed (non-fatal)')
  );
  const [[row]] = await pool.execute(
    `SELECT c.*, u.name AS author_name FROM case_comments c LEFT JOIN users u ON u.id = c.author_id WHERE c.id = ?`,
    [r.insertId]
  );
  return row;
}

async function resolveComment({ orgId, commentId, userId }) {
  await pool.execute(
    `UPDATE case_comments SET resolved = 1, resolved_by = ?, resolved_at = NOW()
      WHERE id = ? AND org_id = ?`,
    [userId, commentId, orgId]
  );
  return { ok: true };
}

async function deleteComment({ orgId, commentId, userId }) {
  await pool.execute(
    `UPDATE case_comments SET deleted_at = NOW()
      WHERE id = ? AND org_id = ? AND (author_id = ? OR ? IS NOT NULL)`,
    [commentId, orgId, userId, userId]
  );
  return { ok: true };
}

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
           c.body_md
      FROM case_mentions m
      LEFT JOIN users u ON u.id = m.mentioned_by_user_id
      LEFT JOIN case_comments c ON c.id = m.comment_id
     WHERE m.org_id = ? AND m.mentioned_user_id = ?
  `;
  if (unreadOnly) sql += ' AND m.seen = 0';
  sql += ' ORDER BY m.created_at DESC LIMIT ?';
  params.push(Number(limit) || 50);
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

/**
 * Resolve @-mentions inside a comment body. Accepts:
 *   @username     (matches users.username if present, else users.email local-part)
 *   @"Full Name"  (quoted full name match against users.name, case-insensitive)
 * Inserts a row per resolved mention + auto-adds the user as a case watcher.
 */
async function notifyMentions({ orgId, caseId, commentId, body, byUserId }) {
  const tokens = parseMentionTokens(body || '');
  if (!tokens.length) return [];
  // Try to resolve each token to a user id
  const resolved = new Set();
  for (const t of tokens) {
    let row = null;
    if (t.quoted) {
      [[row]] = await pool.execute(
        `SELECT id FROM users WHERE org_id = ? AND LOWER(name) = LOWER(?) LIMIT 1`,
        [orgId, t.value]
      );
    } else {
      // Look up by exact username, then by email local-part
      [[row]] = await pool.execute(
        `SELECT id FROM users
          WHERE org_id = ?
            AND (username = ? OR SUBSTRING_INDEX(email,'@',1) = ?)
          LIMIT 1`,
        [orgId, t.value, t.value]
      );
    }
    if (row?.id && row.id !== byUserId) resolved.add(row.id);
  }
  // Insert + watch
  const out = [];
  for (const uid of resolved) {
    const [r] = await pool.execute(
      `INSERT INTO case_mentions
         (org_id, case_id, comment_id, mentioned_user_id, mentioned_by_user_id)
       VALUES (?, ?, ?, ?, ?)`,
      [orgId, caseId, commentId, uid, byUserId]
    );
    await addWatcher({ orgId, caseId, userId: uid, reason: 'mentioned' }).catch(() => {});
    out.push({ id: r.insertId, userId: uid });
  }
  return out;
}

function parseMentionTokens(text) {
  const out = [];
  // Quoted full names first
  const reQ = /@"([^"]+)"/g; let m;
  while ((m = reQ.exec(text))) out.push({ quoted: true,  value: m[1].trim() });
  // Then bare @handles (a-z, 0-9, dot, underscore)
  const reB = /(?:^|\s)@([A-Za-z0-9._-]{2,40})/g;
  while ((m = reB.exec(text))) out.push({ quoted: false, value: m[1] });
  return out;
}

module.exports = {
  listComments, postComment, resolveComment, deleteComment,
  listWatchers, addWatcher, removeWatcher,
  listMentions, markMentionSeen,
  notifyMentions,
};
