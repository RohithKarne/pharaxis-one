/**
 * Admin Chat Records — /api/admin/chat-records (CPPM-17)
 * Read-only view of chat box conversations for one client. Opening a
 * conversation is audited: these are personal, sometimes health, messages.
 */
const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess, requireRole } = require('../../middleware/auth');

// Personal, sometimes health, messages: admins, plus safety reviewers who must
// read a conversation raised in the Safety Queue (CPPM-18). Not viewers.
const canRead = requireRole('superadmin', 'admin', 'safety_reviewer');
const { audit } = require('../../utils/audit');
const log = require('../../utils/logger');

const PAGE_SIZE = 25;

// GET /api/admin/chat-records/:clientId?page=1&user_type=hcp
router.get('/:clientId', authenticateAdmin, requireClientAccess, canRead, async (req, res) => {
  try {
    const clientId = Number(req.params.clientId);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const where = ['c.client_id = ?'];
    const params = [clientId];
    if (req.query.user_type) { where.push('c.user_type = ?'); params.push(String(req.query.user_type)); }

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM cp_chat_conversations c WHERE ${where.join(' AND ')}`, params);
    const [rows] = await pool.query(
      `SELECT c.id, c.user_type, c.provider, c.model, c.message_count, c.started_at, c.last_message_at,
              u.first_name, u.last_name, u.email,
              (SELECT m.content FROM cp_chat_messages m WHERE m.conversation_id = c.id AND m.role = 'user' ORDER BY m.id LIMIT 1) AS first_question
         FROM cp_chat_conversations c
         LEFT JOIN cp_portal_users u ON u.id = c.portal_user_id AND u.client_id = c.client_id
        WHERE ${where.join(' AND ')}
        ORDER BY c.last_message_at DESC, c.id DESC
        LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`, params);
    res.json({ conversations: rows, total, page, page_size: PAGE_SIZE });
  } catch (err) {
    log.error('admin.chat_records.error', { err, route: 'GET /:clientId', request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/chat-records/:clientId/:conversationId
router.get('/:clientId/:conversationId', authenticateAdmin, requireClientAccess, canRead, async (req, res) => {
  try {
    const clientId = Number(req.params.clientId);
    const [[conv]] = await pool.execute(
      `SELECT c.id, c.user_type, c.provider, c.model, c.message_count, c.started_at, c.last_message_at,
              u.first_name, u.last_name, u.email
         FROM cp_chat_conversations c
         LEFT JOIN cp_portal_users u ON u.id = c.portal_user_id AND u.client_id = c.client_id
        WHERE c.id = ? AND c.client_id = ?`, [req.params.conversationId, clientId]);
    if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
    const [messages] = await pool.execute(
      `SELECT id, role, content, sources_json, outcome, latency_ms, created_at
         FROM cp_chat_messages WHERE conversation_id = ? AND client_id = ? ORDER BY id`, [conv.id, clientId]);
    await audit(req.admin, clientId, 'CHAT_VIEWED', 'chat_conversation', conv.id, { messages: messages.length });
    res.json({ conversation: conv, messages });
  } catch (err) {
    log.error('admin.chat_records.error', { err, route: 'GET /:clientId/:conversationId', request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
