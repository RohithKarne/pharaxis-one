'use strict';

const pool = require('../database/db');

function uniqueIds(values) {
  return [...new Set((values || []).map((value) => Number(value)).filter(Boolean))];
}

async function addParticipants(conversationId, participantIds) {
  const ids = uniqueIds(participantIds);
  for (const userId of ids) {
    await pool.execute(
      `INSERT INTO chat_conversation_participants (conversation_id, user_id, is_active)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE is_active = 1`,
      [conversationId, userId]
    );
  }
}

async function getConversationForUser(conversationId, user) {
  const [rows] = await pool.execute(
    `SELECT c.id, c.org_id, c.conversation_type, c.title, c.created_by, c.is_archived, c.created_at, c.updated_at,
            l.entity_type, l.entity_id,
            cs.case_number
       FROM chat_conversations c
       INNER JOIN chat_conversation_participants me
               ON me.conversation_id = c.id
              AND me.user_id = ?
              AND me.is_active = 1
       LEFT JOIN chat_conversation_links l
              ON l.conversation_id = c.id
       LEFT JOIN cases cs
              ON l.entity_type = 'case'
             AND cs.id = l.entity_id
      WHERE c.id = ?
        AND c.org_id = ?`,
    [user.userId, conversationId, user.orgId]
  );
  return rows[0] || null;
}

async function getCaseRow(caseId) {
  const [rows] = await pool.execute(
    `SELECT id, org_id, case_number, case_owner_id, created_by
       FROM cases
      WHERE id = ?`,
    [caseId]
  );
  return rows[0] || null;
}

async function ensureCaseConversation(caseId, user) {
  const caseRow = await getCaseRow(caseId);
  if (!caseRow) return null;
  if (user.role !== 'superadmin' && Number(caseRow.org_id) !== Number(user.orgId)) return null;

  const [existing] = await pool.execute(
    `SELECT c.id, c.org_id, c.conversation_type, c.title, c.created_by, c.is_archived, c.created_at, c.updated_at
       FROM chat_conversations c
       INNER JOIN chat_conversation_links l
               ON l.conversation_id = c.id
      WHERE l.entity_type = 'case'
        AND l.entity_id = ?
      LIMIT 1`,
    [caseId]
  );

  let conversationId = existing[0]?.id || null;
  if (!conversationId) {
    const [result] = await pool.execute(
      `INSERT INTO chat_conversations (org_id, conversation_type, title, created_by)
       VALUES (?, 'case', ?, ?)`,
      [caseRow.org_id, caseRow.case_number ? `Case ${caseRow.case_number}` : `Case ${caseRow.id}`, user.userId]
    );
    conversationId = result.insertId;
    await pool.execute(
      `INSERT INTO chat_conversation_links (conversation_id, entity_type, entity_id)
       VALUES (?, 'case', ?)`,
      [conversationId, caseId]
    );
  }

  await addParticipants(conversationId, [user.userId, caseRow.created_by, caseRow.case_owner_id]);
  return getConversationForUser(conversationId, { ...user, orgId: caseRow.org_id });
}

async function createConversation({ orgId, createdBy, type, title, participantIds }) {
  const normalizedType = type === 'direct' ? 'direct' : 'group';
  const [result] = await pool.execute(
    `INSERT INTO chat_conversations (org_id, conversation_type, title, created_by)
     VALUES (?, ?, ?, ?)`,
    [orgId, normalizedType, title || null, createdBy]
  );
  const conversationId = result.insertId;
  await addParticipants(conversationId, [createdBy, ...participantIds]);
  return conversationId;
}

async function listConversationMessages(conversationId) {
  const [rows] = await pool.execute(
    `SELECT m.id,
            m.conversation_id,
            m.user_id,
            m.body,
            m.created_at,
            m.updated_at,
            u.name AS user_name,
            u.email AS user_email
       FROM chat_messages m
       LEFT JOIN users u ON u.id = m.user_id
      WHERE m.conversation_id = ?
        AND m.deleted_at IS NULL
      ORDER BY m.created_at ASC, m.id ASC`,
    [conversationId]
  );
  return rows;
}

async function markConversationRead(conversationId, userId, lastMessageId = null) {
  let resolvedMessageId = Number(lastMessageId || 0);
  if (!resolvedMessageId) {
    const [[row]] = await pool.execute(
      `SELECT id
         FROM chat_messages
        WHERE conversation_id = ?
          AND deleted_at IS NULL
        ORDER BY id DESC
        LIMIT 1`,
      [conversationId]
    );
    resolvedMessageId = Number(row?.id || 0);
  }

  await pool.execute(
    `UPDATE chat_conversation_participants
        SET last_read_message_id = ?,
            last_read_at = NOW()
      WHERE conversation_id = ?
        AND user_id = ?`,
    [resolvedMessageId || null, conversationId, userId]
  );
}

async function createMessage(conversationId, userId, body) {
  const [result] = await pool.execute(
    `INSERT INTO chat_messages (conversation_id, user_id, body)
     VALUES (?, ?, ?)`,
    [conversationId, userId, body]
  );

  await pool.execute(
    `UPDATE chat_conversations
        SET updated_at = NOW()
      WHERE id = ?`,
    [conversationId]
  );

  const [[saved]] = await pool.execute(
    `SELECT m.id,
            m.conversation_id,
            m.user_id,
            m.body,
            m.created_at,
            m.updated_at,
            u.name AS user_name,
            u.email AS user_email
       FROM chat_messages m
       LEFT JOIN users u ON u.id = m.user_id
      WHERE m.id = ?`,
    [result.insertId]
  );

  return saved || null;
}

async function listConversationParticipants(conversationId) {
  const [rows] = await pool.execute(
    `SELECT cp.user_id, u.name, u.email, cp.joined_at
       FROM chat_conversation_participants cp
       LEFT JOIN users u ON u.id = cp.user_id
      WHERE cp.conversation_id = ?
        AND cp.is_active = 1
      ORDER BY u.name ASC, u.email ASC`,
    [conversationId]
  );
  return rows;
}

async function listConversationParticipantIds(conversationId) {
  const [rows] = await pool.execute(
    `SELECT user_id
       FROM chat_conversation_participants
      WHERE conversation_id = ?
        AND is_active = 1`,
    [conversationId]
  );
  return rows.map((row) => Number(row.user_id)).filter(Boolean);
}

async function addConversationParticipants(conversationId, participantIds) {
  await addParticipants(conversationId, participantIds);
  return listConversationParticipants(conversationId);
}

async function removeConversationParticipant(conversationId, userId) {
  await pool.execute(
    `UPDATE chat_conversation_participants
        SET is_active = 0
      WHERE conversation_id = ?
        AND user_id = ?`,
    [conversationId, userId]
  );
  return listConversationParticipants(conversationId);
}

async function upgradeConversationToGroup(conversationId) {
  await pool.execute(
    `UPDATE chat_conversations
        SET conversation_type = 'group', updated_at = NOW()
      WHERE id = ?
        AND conversation_type = 'direct'`,
    [conversationId]
  );
}

async function listUserConversations(user) {
  const [rows] = await pool.execute(
    `SELECT
        c.id,
        c.conversation_type,
        c.title,
        c.created_at,
        c.updated_at,
        l.entity_type,
        l.entity_id,
        cs.case_number,
        COALESCE(unread.unread_count, 0) AS unread_count,
        lm.id AS latest_message_id,
        lm.body AS latest_message_body,
        lm.created_at AS latest_message_at,
        lu.name AS latest_message_user_name,
        GROUP_CONCAT(DISTINCT up.name ORDER BY up.name SEPARATOR ' • ') AS participant_names
      FROM chat_conversations c
      INNER JOIN chat_conversation_participants me
              ON me.conversation_id = c.id
             AND me.user_id = ?
             AND me.is_active = 1
      LEFT JOIN chat_conversation_links l
             ON l.conversation_id = c.id
      LEFT JOIN cases cs
             ON l.entity_type = 'case'
            AND cs.id = l.entity_id
      LEFT JOIN chat_messages lm
             ON lm.id = (
               SELECT m2.id
                 FROM chat_messages m2
                WHERE m2.conversation_id = c.id
                  AND m2.deleted_at IS NULL
                ORDER BY m2.id DESC
                LIMIT 1
             )
      LEFT JOIN users lu
             ON lu.id = lm.user_id
      LEFT JOIN chat_conversation_participants cp
             ON cp.conversation_id = c.id
            AND cp.is_active = 1
      LEFT JOIN users up
             ON up.id = cp.user_id
      LEFT JOIN (
        SELECT cp2.conversation_id, COUNT(m.id) AS unread_count
          FROM chat_conversation_participants cp2
          INNER JOIN chat_messages m
                  ON m.conversation_id = cp2.conversation_id
                 AND m.deleted_at IS NULL
                 AND m.user_id <> cp2.user_id
                 AND m.id > COALESCE(cp2.last_read_message_id, 0)
         WHERE cp2.user_id = ?
           AND cp2.is_active = 1
         GROUP BY cp2.conversation_id
      ) unread
             ON unread.conversation_id = c.id
      WHERE c.org_id = ?
        AND c.is_archived = 0
      GROUP BY
        c.id,
        c.conversation_type,
        c.title,
        c.created_at,
        c.updated_at,
        l.entity_type,
        l.entity_id,
        cs.case_number,
        unread.unread_count,
        lm.id,
        lm.body,
        lm.created_at,
        lu.name
      ORDER BY COALESCE(lm.created_at, c.updated_at) DESC, c.id DESC`,
    [user.userId, user.userId, user.orgId]
  );
  return rows;
}

module.exports = {
  addParticipants,
  createConversation,
  createMessage,
  addConversationParticipants,
  ensureCaseConversation,
  getConversationForUser,
  listConversationMessages,
  listConversationParticipants,
  listConversationParticipantIds,
  listUserConversations,
  markConversationRead,
  removeConversationParticipant,
  upgradeConversationToGroup,
};
