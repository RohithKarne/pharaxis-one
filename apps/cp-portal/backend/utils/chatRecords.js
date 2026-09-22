/**
 * chatRecords.js — CPPM-17: keep a record of every chat box conversation.
 *
 * A write here must never break the chat for the person using it, so callers
 * treat every function as best-effort: a failure is logged loudly
 * (portal.chatbox.record_failed) and the answer is still returned.
 */
const { pool } = require('../database/db');
const log = require('./logger');

// Placeholder until Vasu (CCO) rules on how long chats are kept.
const CHAT_RETENTION_DAYS = 730;

/**
 * Continue the conversation the browser names, but only if it belongs to this
 * person on this portal; otherwise start a new one. Stops anyone appending to
 * someone else's conversation by guessing its id.
 */
async function resolveConversation({ conversationId, clientId, userId, userType, provider, model }) {
  const id = Number(conversationId);
  if (Number.isInteger(id) && id > 0) {
    const [[row]] = await pool.execute(
      'SELECT id FROM cp_chat_conversations WHERE id = ? AND client_id = ? AND portal_user_id = ?',
      [id, clientId, userId]);
    if (row) return row.id;
  }
  const [r] = await pool.execute(
    'INSERT INTO cp_chat_conversations (client_id, portal_user_id, user_type, provider, model) VALUES (?, ?, ?, ?, ?)',
    [clientId, userId, userType, provider || null, model || null]);
  return r.insertId;
}

async function recordMessage({ conversationId, clientId, role, content, sources = null, outcome = null, latencyMs = null }) {
  await pool.execute(
    `INSERT INTO cp_chat_messages (conversation_id, client_id, role, content, sources_json, outcome, latency_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [conversationId, clientId, role, String(content || ''), sources ? JSON.stringify(sources) : null, outcome, latencyMs]);
  await pool.execute(
    'UPDATE cp_chat_conversations SET message_count = message_count + 1, last_message_at = NOW() WHERE id = ?',
    [conversationId]);
}

/** Run a record write without letting its failure reach the person chatting. */
async function bestEffort(what, fn, context) {
  try {
    return await fn();
  } catch (err) {
    log.error('portal.chatbox.record_failed', { what, err, ...context });
    return null;
  }
}

/** Scheduler: remove conversations past retention (their messages go with them). */
async function purgeExpiredChats() {
  const [r] = await pool.execute(
    `DELETE FROM cp_chat_conversations c
      WHERE c.last_message_at < NOW() - INTERVAL ? DAY
        -- CPPM-18: a chat that raised a safety review is a safety record; never purged here.
        AND NOT EXISTS (SELECT 1 FROM cp_ae_review_tasks t WHERE t.chat_conversation_id = c.id)`, [CHAT_RETENTION_DAYS]);
  if (r.affectedRows) log.info('chat.records.purged', { conversations: r.affectedRows, retention_days: CHAT_RETENTION_DAYS });
}

module.exports = { resolveConversation, recordMessage, bestEffort, purgeExpiredChats, CHAT_RETENTION_DAYS };
