'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../database/db');
const { authenticate, requireOrg } = require('../middleware/auth');
const { createNotifications } = require('../services/notificationCenterService');
const { logger } = require('../services/logger');
const {
  emitConversationUpdated,
  emitMessageCreated,
  emitParticipantsUpdated,
  getOnlineUserIds,
} = require('../services/chatRealtimeService');
const {
  addConversationParticipants,
  createConversation,
  createMessage,
  ensureCaseConversation,
  getConversationForUser,
  listConversationMessages,
  listConversationParticipantIds,
  listConversationParticipants,
  listUserConversations,
  markConversationRead,
  removeConversationParticipant,
  upgradeConversationToGroup,
} = require('../services/chatService');

function uniqueIds(values) {
  return [...new Set((values || []).map((value) => Number(value)).filter(Boolean))];
}

async function resolveEligibleUsersForOrg(orgId, ids) {
  const userIds = uniqueIds(ids);
  if (userIds.length === 0) return [];
  const placeholders = userIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id, u.name, u.email
       FROM users u
       LEFT JOIN user_org_access uoa
              ON uoa.user_id = u.id
             AND uoa.org_id = ?
             AND uoa.is_active = 1
      WHERE u.is_active = 1
        AND (u.org_id = ? OR uoa.user_id IS NOT NULL)
        AND u.id IN (${placeholders})
      ORDER BY u.name ASC`,
    [orgId, orgId, ...userIds]
  );
  return rows;
}

async function listLegacyCaseComments(caseId) {
  const [rows] = await pool.execute(
    `SELECT cc.id,
            cc.case_id,
            cc.user_id,
            cc.comment,
            cc.created_at,
            cc.updated_at,
            u.name AS user_name,
            u.email AS user_email
       FROM case_comments cc
       LEFT JOIN users u ON u.id = cc.user_id
      WHERE cc.case_id = ?
      ORDER BY cc.created_at ASC, cc.id ASC`,
    [caseId]
  );
  return rows.map((row) => ({
    id: `legacy-${row.id}`,
    source: 'legacy_case_comment',
    conversation_id: null,
    user_id: row.user_id,
    body: row.comment,
    created_at: row.created_at,
    updated_at: row.updated_at,
    user_name: row.user_name,
    user_email: row.user_email,
  }));
}

async function getCaseProtectionIds(caseId) {
  if (!caseId) return [];
  const [[row]] = await pool.execute(
    `SELECT created_by, case_owner_id
       FROM cases
      WHERE id = ?
      LIMIT 1`,
    [caseId]
  );
  return [row?.created_by, row?.case_owner_id].map((value) => Number(value)).filter(Boolean);
}

async function writeCaseChatAudit(caseId, userId, userName, messageText) {
  try {
    await pool.execute(
      `INSERT INTO case_audit_trail (case_id, user_id, user_name, action_type, field_name, old_value, new_value)
       VALUES (?, ?, ?, 'CHAT_MESSAGE_SENT', 'chat_message', NULL, ?)`,
      [caseId, userId, userName || null, String(messageText || '').slice(0, 1000)]
    );
  } catch (_) {
    // best effort
  }
}

router.get('/chat/conversations', authenticate, requireOrg, async (req, res) => {
  try {
    const conversations = await listUserConversations(req.user);
    return res.json({ conversations });
  } catch (err) {
    logger.error({ err, route: '/api/chat/conversations', user_id: req.user?.userId }, 'Failed to list chat conversations');
    return res.status(500).json({ error: err.message || 'Failed to load conversations.' });
  }
});

router.post('/chat/conversations', authenticate, requireOrg, async (req, res) => {
  try {
    const participantIds = uniqueIds(req.body?.participant_ids || []);
    const title = String(req.body?.title || '').trim();
    if (participantIds.length === 0) {
      return res.status(400).json({ error: 'At least one participant is required.' });
    }

    const eligible = await resolveEligibleUsersForOrg(req.user.orgId, participantIds);
    if (eligible.length !== participantIds.length) {
      return res.status(400).json({ error: 'One or more selected participants are not active in this organisation.' });
    }

    const conversationType = participantIds.length === 1 ? 'direct' : 'group';
    const resolvedTitle = title || (conversationType === 'direct' ? eligible[0]?.name || eligible[0]?.email || 'Direct Chat' : 'Team Chat');
    const conversationId = await createConversation({
      orgId: req.user.orgId,
      createdBy: req.user.userId,
      type: conversationType,
      title: resolvedTitle,
      participantIds,
    });

    const conversation = await getConversationForUser(conversationId, req.user);
    const participants = await listConversationParticipants(conversationId);
    const participantUserIds = participants.map((item) => Number(item.user_id)).filter(Boolean);
    emitParticipantsUpdated(conversationId, participants, getOnlineUserIds(participantUserIds));

    const recipientIds = participantUserIds.filter((userId) => userId !== Number(req.user.userId));
    if (recipientIds.length > 0) {
      await createNotifications(recipientIds, {
        category: 'chat_message',
        title: `New chat created: ${resolvedTitle}`,
        message: `${req.user.email} started a new conversation with you.`,
        linkUrl: `/chat?conversation=${conversationId}`,
        metadata: { conversation_id: Number(conversationId) },
      });
    }

    return res.status(201).json({ conversation });
  } catch (err) {
    logger.error({ err, route: '/api/chat/conversations', user_id: req.user?.userId }, 'Failed to create chat conversation');
    return res.status(500).json({ error: err.message || 'Failed to create conversation.' });
  }
});

router.post('/chat/cases/:id/conversation', authenticate, requireOrg, async (req, res) => {
  try {
    const conversation = await ensureCaseConversation(req.params.id, req.user);
    if (!conversation) return res.status(403).json({ error: 'Access denied.' });
    const participants = await listConversationParticipants(conversation.id);
    emitParticipantsUpdated(conversation.id, participants, getOnlineUserIds(participants.map((item) => item.user_id)));
    return res.json({ conversation });
  } catch (err) {
    logger.error({ err, route: '/api/chat/cases/:id/conversation', case_id: req.params?.id, user_id: req.user?.userId }, 'Failed to ensure case chat conversation');
    return res.status(500).json({ error: err.message || 'Failed to open case conversation.' });
  }
});

router.get('/chat/conversations/:id/participants', authenticate, requireOrg, async (req, res) => {
  try {
    const conversation = await getConversationForUser(req.params.id, req.user);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
    const participants = await listConversationParticipants(conversation.id);
    const onlineUserIds = getOnlineUserIds(participants.map((item) => item.user_id));
    return res.json({ participants, onlineUserIds });
  } catch (err) {
    logger.error({ err, route: '/api/chat/conversations/:id/participants', conversation_id: req.params?.id, user_id: req.user?.userId }, 'Failed to load chat participants');
    return res.status(500).json({ error: err.message || 'Failed to load participants.' });
  }
});

router.post('/chat/conversations/:id/participants', authenticate, requireOrg, async (req, res) => {
  try {
    const conversation = await getConversationForUser(req.params.id, req.user);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

    const userIds = uniqueIds(req.body?.user_ids || []);
    if (userIds.length === 0) return res.status(400).json({ error: 'user_ids is required.' });

    const eligible = await resolveEligibleUsersForOrg(req.user.orgId, userIds);
    if (eligible.length !== userIds.length) {
      return res.status(400).json({ error: 'One or more selected participants are not active in this organisation.' });
    }

    if (conversation.conversation_type === 'direct' && userIds.length > 0) {
      await upgradeConversationToGroup(conversation.id);
    }

    const participants = await addConversationParticipants(conversation.id, userIds);
    const onlineUserIds = getOnlineUserIds(participants.map((item) => item.user_id));
    emitParticipantsUpdated(conversation.id, participants, onlineUserIds);

    await createNotifications(userIds, {
      category: 'chat_message',
      title: `Added to ${conversation.title || 'chat conversation'}`,
      message: `${req.user.email} added you to a conversation.`,
      linkUrl: conversation.entity_type === 'case' && conversation.entity_id
        ? `/cases/${conversation.entity_id}?section=comments`
        : `/chat?conversation=${conversation.id}`,
      metadata: { conversation_id: Number(conversation.id) },
    });

    return res.status(201).json({ participants, onlineUserIds });
  } catch (err) {
    logger.error({ err, route: '/api/chat/conversations/:id/participants', conversation_id: req.params?.id, user_id: req.user?.userId }, 'Failed to add chat participants');
    return res.status(500).json({ error: err.message || 'Failed to add participants.' });
  }
});

router.delete('/chat/conversations/:id/participants/:userId', authenticate, requireOrg, async (req, res) => {
  try {
    const conversation = await getConversationForUser(req.params.id, req.user);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

    const targetUserId = Number(req.params.userId || 0);
    if (!targetUserId) return res.status(400).json({ error: 'Invalid participant id.' });

    const isSelf = Number(targetUserId) === Number(req.user.userId);
    const canManage = req.user.role === 'admin' || req.user.role === 'superadmin' || Number(conversation.created_by || 0) === Number(req.user.userId);
    if (!isSelf && !canManage) {
      return res.status(403).json({ error: 'Only the conversation owner or an admin can remove other participants.' });
    }

    if (conversation.entity_type === 'case' && conversation.entity_id) {
      const protectedIds = await getCaseProtectionIds(conversation.entity_id);
      if (protectedIds.includes(targetUserId)) {
        return res.status(400).json({ error: 'Core case participants cannot be removed from this conversation.' });
      }
      if (isSelf) {
        return res.status(400).json({ error: 'You cannot leave a case-linked conversation.' });
      }
    }

    const participants = await removeConversationParticipant(conversation.id, targetUserId);
    const onlineUserIds = getOnlineUserIds(participants.map((item) => item.user_id));
    emitParticipantsUpdated(conversation.id, participants, onlineUserIds);
    return res.json({ participants, onlineUserIds });
  } catch (err) {
    logger.error({ err, route: '/api/chat/conversations/:id/participants/:userId', conversation_id: req.params?.id, user_id: req.user?.userId }, 'Failed to remove chat participant');
    return res.status(500).json({ error: err.message || 'Failed to remove participant.' });
  }
});

router.get('/chat/conversations/:id/messages', authenticate, requireOrg, async (req, res) => {
  try {
    const conversation = await getConversationForUser(req.params.id, req.user);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

    const chatMessages = await listConversationMessages(conversation.id);
    const items = chatMessages.map((row) => ({
      ...row,
      source: 'chat_message',
    }));

    if (conversation.entity_type === 'case' && conversation.entity_id) {
      const legacy = await listLegacyCaseComments(conversation.entity_id);
      const merged = [...legacy, ...items].sort((left, right) => {
        const a = new Date(left.created_at).getTime();
        const b = new Date(right.created_at).getTime();
        if (a !== b) return a - b;
        return String(left.id).localeCompare(String(right.id));
      });
      return res.json({ conversation, messages: merged });
    }

    return res.json({ conversation, messages: items });
  } catch (err) {
    logger.error({ err, route: '/api/chat/conversations/:id/messages', conversation_id: req.params?.id, user_id: req.user?.userId }, 'Failed to load chat messages');
    return res.status(500).json({ error: err.message || 'Failed to load messages.' });
  }
});

router.post('/chat/conversations/:id/messages', authenticate, requireOrg, async (req, res) => {
  try {
    const conversation = await getConversationForUser(req.params.id, req.user);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });

    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'body is required.' });
    if (body.length > 4000) return res.status(400).json({ error: 'body must be <= 4000 chars.' });
    const mentionUserIds = uniqueIds(req.body?.mention_user_ids || []);
    const participantUserIds = await listConversationParticipantIds(conversation.id);
    const invalidMention = mentionUserIds.find((userId) => !participantUserIds.includes(userId));
    if (invalidMention) {
      return res.status(400).json({ error: 'Mention target must already be a participant in the conversation.' });
    }

    const saved = await createMessage(conversation.id, req.user.userId, body);
    await markConversationRead(conversation.id, req.user.userId, saved?.id || null);

    const participants = await listConversationParticipants(conversation.id);
    const recipientIds = participants
      .map((participant) => Number(participant.user_id))
      .filter((userId) => userId && userId !== Number(req.user.userId));
    const mentionedRecipients = recipientIds.filter((userId) => mentionUserIds.includes(userId));
    const standardRecipients = recipientIds.filter((userId) => !mentionUserIds.includes(userId));

    if (standardRecipients.length > 0) {
      const convoLabel = conversation.entity_type === 'case' && conversation.case_number
        ? `Case ${conversation.case_number}`
        : (conversation.title || 'Chat');
      await createNotifications(standardRecipients, {
        category: 'chat_message',
        title: `New chat message in ${convoLabel}`,
        message: `${req.user.email} sent a new message.`,
        linkUrl: conversation.entity_type === 'case' && conversation.entity_id
          ? `/cases/${conversation.entity_id}?section=comments`
          : `/chat?conversation=${conversation.id}`,
        metadata: {
          conversation_id: Number(conversation.id),
          entity_type: conversation.entity_type || null,
          entity_id: conversation.entity_id || null,
        },
      });
    }

    if (mentionedRecipients.length > 0) {
      const convoLabel = conversation.entity_type === 'case' && conversation.case_number
        ? `Case ${conversation.case_number}`
        : (conversation.title || 'Chat');
      await createNotifications(mentionedRecipients, {
        category: 'chat_mention',
        title: `You were mentioned in ${convoLabel}`,
        message: `${req.user.email} mentioned you in chat.`,
        linkUrl: conversation.entity_type === 'case' && conversation.entity_id
          ? `/cases/${conversation.entity_id}?section=comments`
          : `/chat?conversation=${conversation.id}`,
        metadata: {
          conversation_id: Number(conversation.id),
          entity_type: conversation.entity_type || null,
          entity_id: conversation.entity_id || null,
          mention_user_ids: mentionUserIds,
        },
      });
    }

    if (conversation.entity_type === 'case' && conversation.entity_id) {
      await writeCaseChatAudit(conversation.entity_id, req.user.userId, req.user.email, body);
    }

    emitMessageCreated(conversation.id, {
      ...saved,
      source: 'chat_message',
      mention_user_ids: mentionUserIds,
    }, participantUserIds);

    return res.status(201).json({ ...saved, mention_user_ids: mentionUserIds });
  } catch (err) {
    logger.error({ err, route: '/api/chat/conversations/:id/messages', conversation_id: req.params?.id, user_id: req.user?.userId }, 'Failed to create chat message');
    return res.status(500).json({ error: err.message || 'Failed to send message.' });
  }
});

router.post('/chat/conversations/:id/read', authenticate, requireOrg, async (req, res) => {
  try {
    const conversation = await getConversationForUser(req.params.id, req.user);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found.' });
    await markConversationRead(conversation.id, req.user.userId, req.body?.last_message_id || null);
    emitConversationUpdated(conversation.id, [req.user.userId]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err, route: '/api/chat/conversations/:id/read', conversation_id: req.params?.id, user_id: req.user?.userId }, 'Failed to mark chat conversation read');
    return res.status(500).json({ error: err.message || 'Failed to mark conversation read.' });
  }
});

module.exports = router;
