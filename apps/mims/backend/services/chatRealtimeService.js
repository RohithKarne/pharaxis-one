'use strict';

// ── AC-T14: Redis pub/sub for cross-process chat WebSocket fan-out ────────────
// Same pattern as appRealtimeService.js.
// Channel: 'mims:chat'
// emitMessageCreated / emitParticipantsUpdated / emitConversationUpdated:
//   1. Broadcast to local sockets immediately
//   2. Publish to 'mims:chat' Redis channel with _pid (to suppress echo)
// The subscriber on other processes receives and broadcasts to their local sockets.

const WebSocket = require('ws');
const { readCookie, validateAccessToken } = require('../middleware/auth');
const { logger } = require('./logger');
const redis = require('./redisClient');

const CHAT_CHANNEL = 'mims:chat';
const _PID = process.pid;

let wss = null;
let _subscriber = null;

const socketState         = new Map();
const userSockets         = new Map();
const conversationSockets = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeSend(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch (_) {
    // best effort only
  }
}

function getUserConnectionSet(userId) {
  const key = Number(userId || 0);
  if (!userSockets.has(key)) userSockets.set(key, new Set());
  return userSockets.get(key);
}

function getConversationConnectionSet(conversationId) {
  const key = Number(conversationId || 0);
  if (!conversationSockets.has(key)) conversationSockets.set(key, new Set());
  return conversationSockets.get(key);
}

function getOnlineUserIds(userIds) {
  return [...new Set((userIds || []).map((v) => Number(v)).filter(Boolean))]
    .filter((userId) => (userSockets.get(userId)?.size || 0) > 0);
}

function sendPresenceSnapshot(conversationId, participantIds) {
  const sockets = conversationSockets.get(Number(conversationId || 0));
  if (!sockets || sockets.size === 0) return;
  const allowedUserIds = [...new Set((participantIds || []).map((v) => Number(v)).filter(Boolean))];
  const onlineUserIds  = getOnlineUserIds(allowedUserIds);
  const payload = {
    type:           'presence.updated',
    conversationId: Number(conversationId),
    onlineUserIds,
  };
  for (const ws of sockets) {
    const state  = socketState.get(ws);
    const userId = Number(state?.user?.userId || 0);
    if (!allowedUserIds.includes(userId)) continue;
    safeSend(ws, payload);
  }
}

function broadcastToConversation(conversationId, payload) {
  const sockets = conversationSockets.get(Number(conversationId || 0));
  if (!sockets) return;
  for (const ws of sockets) safeSend(ws, payload);
}

function broadcastToConversationUsers(conversationId, payload, allowedUserIds) {
  const sockets = conversationSockets.get(Number(conversationId || 0));
  if (!sockets) return;
  const allowed = [...new Set((allowedUserIds || []).map((v) => Number(v)).filter(Boolean))];
  for (const ws of sockets) {
    const state  = socketState.get(ws);
    const userId = Number(state?.user?.userId || 0);
    if (!allowed.includes(userId)) continue;
    safeSend(ws, payload);
  }
}

function pruneConversationSubscriptions(conversationId, allowedUserIds) {
  const key     = Number(conversationId || 0);
  const sockets = conversationSockets.get(key);
  if (!sockets) return;
  const allowed = new Set((allowedUserIds || []).map((v) => Number(v)).filter(Boolean));
  for (const ws of [...sockets]) {
    const state  = socketState.get(ws);
    const userId = Number(state?.user?.userId || 0);
    if (allowed.has(userId)) continue;
    sockets.delete(ws);
    state?.subscriptions?.delete(key);
  }
  if (sockets.size === 0) conversationSockets.delete(key);
}

function broadcastToUsers(userIds, payload) {
  const ids = [...new Set((userIds || []).map((v) => Number(v)).filter(Boolean))];
  for (const userId of ids) {
    const sockets = userSockets.get(userId);
    if (!sockets) continue;
    for (const ws of sockets) safeSend(ws, payload);
  }
}

async function handleSocketAuth(request) {
  const authHeader = request.headers.authorization || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const token = bearerToken || readCookie({ headers: { cookie: request.headers.cookie || '' } }, 'mims_token');
  return validateAccessToken(token);
}

function unregisterSocket(ws) {
  const state = socketState.get(ws);
  if (!state) return;

  const userSet = userSockets.get(Number(state.user.userId || 0));
  if (userSet) {
    userSet.delete(ws);
    if (userSet.size === 0) userSockets.delete(Number(state.user.userId || 0));
  }

  for (const [conversationId, participantIds] of state.subscriptions.entries()) {
    const sockets = conversationSockets.get(Number(conversationId || 0));
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) conversationSockets.delete(Number(conversationId || 0));
    }
    sendPresenceSnapshot(conversationId, participantIds || []);
  }

  socketState.delete(ws);
}

// ── Redis subscriber — fan-out from other processes ───────────────────────────

function _handleChatMessage(raw) {
  try {
    const msg = JSON.parse(raw);
    if (msg._pid === _PID) return; // skip own messages, already broadcast locally

    if (msg.type === 'message_created') {
      broadcastToConversationUsers(msg.conversationId, {
        type:           'message.created',
        conversationId: Number(msg.conversationId),
        message:        msg.message,
      }, msg.participantUserIds);
      broadcastToUsers(msg.participantUserIds, {
        type:           'conversation.updated',
        conversationId: Number(msg.conversationId),
      });
    } else if (msg.type === 'participants_updated') {
      pruneConversationSubscriptions(msg.conversationId, msg.participantUserIds);
      broadcastToConversationUsers(msg.conversationId, {
        type:           'participants.updated',
        conversationId: Number(msg.conversationId),
        participants:   msg.participants,
        onlineUserIds:  msg.onlineUserIds || [],
      }, msg.participantUserIds);
      broadcastToUsers(msg.participantUserIds, {
        type:           'conversation.updated',
        conversationId: Number(msg.conversationId),
      });
    } else if (msg.type === 'conversation_updated') {
      broadcastToUsers(msg.userIds, {
        type:           'conversation.updated',
        conversationId: Number(msg.conversationId),
      });
    }
  } catch (_) {}
}

async function _setupChatSubscriber() {
  try {
    _subscriber = redis.createSubscriber();

    _subscriber.on('message', (channel, raw) => {
      if (channel === CHAT_CHANNEL) _handleChatMessage(raw);
    });

    _subscriber.on('error', (err) => {
      logger.warn({ err: err.message }, 'chatRealtimeService: Redis subscriber error — cross-process sync degraded');
    });

    await _subscriber.subscribe(CHAT_CHANNEL);
    logger.info({ channel: CHAT_CHANNEL, pid: _PID }, 'chatRealtimeService: Redis subscriber active');
  } catch (err) {
    logger.warn({ err: err.message }, 'chatRealtimeService: Redis subscriber setup failed — in-process only');
    _subscriber = null;
  }
}

// ── WebSocket server ──────────────────────────────────────────────────────────

function attachChatRealtime(server) {
  if (wss) return wss;
  wss = new WebSocket.Server({ noServer: true });

  // Start Redis cross-process subscriber
  _setupChatSubscriber();

  server.on('upgrade', async (request, socket, head) => {
    if (!String(request.url || '').startsWith('/api/chat/ws')) return;

    try {
      const user = await handleSocketAuth(request);
      wss.handleUpgrade(request, socket, head, (ws) => {
        const initialState = { user, subscriptions: new Map() };
        socketState.set(ws, initialState);
        getUserConnectionSet(user.userId).add(ws);

        safeSend(ws, {
          type: 'ready',
          user: {
            userId: user.userId,
            email:  user.email,
            role:   user.role,
            orgId:  user.orgId,
          },
        });

        ws.on('message', (raw) => {
          try {
            const payload = JSON.parse(String(raw || '{}'));
            if (payload.type === 'subscribe') {
              const conversationId    = Number(payload.conversationId || 0);
              if (!conversationId) return;
              const participantUserIds = [...new Set((payload.participantUserIds || []).map((v) => Number(v)).filter(Boolean))];
              initialState.subscriptions.set(conversationId, participantUserIds);
              getConversationConnectionSet(conversationId).add(ws);
              safeSend(ws, { type: 'subscribed', conversationId });
              sendPresenceSnapshot(conversationId, participantUserIds);
              return;
            }
            if (payload.type === 'unsubscribe') {
              const conversationId    = Number(payload.conversationId || 0);
              if (!conversationId) return;
              const participantUserIds = initialState.subscriptions.get(conversationId) || [];
              initialState.subscriptions.delete(conversationId);
              const sockets = conversationSockets.get(conversationId);
              if (sockets) {
                sockets.delete(ws);
                if (sockets.size === 0) conversationSockets.delete(conversationId);
              }
              sendPresenceSnapshot(conversationId, participantUserIds);
            }
          } catch (_) {
            // ignore malformed socket messages
          }
        });

        ws.on('close', () => unregisterSocket(ws));
        ws.on('error', () => unregisterSocket(ws));
      });
    } catch (err) {
      logger.warn({ err, route: '/api/chat/ws' }, 'Rejected chat websocket connection');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  return wss;
}

// ── Public emit API ───────────────────────────────────────────────────────────

function emitMessageCreated(conversationId, message, participantUserIds) {
  // 1. Local broadcast
  broadcastToConversationUsers(conversationId, {
    type:           'message.created',
    conversationId: Number(conversationId),
    message,
  }, participantUserIds);
  broadcastToUsers(participantUserIds, {
    type:           'conversation.updated',
    conversationId: Number(conversationId),
  });

  // 2. Cross-process via Redis
  redis.publish(CHAT_CHANNEL, {
    _pid:             _PID,
    type:             'message_created',
    conversationId:   Number(conversationId),
    message,
    participantUserIds,
  }).catch(() => {});
}

function emitParticipantsUpdated(conversationId, participants, onlineUserIds) {
  const participantUserIds = participants.map((item) => item.user_id);
  // 1. Local: prune + broadcast
  pruneConversationSubscriptions(conversationId, participantUserIds);
  const payload = {
    type:           'participants.updated',
    conversationId: Number(conversationId),
    participants,
    onlineUserIds:  onlineUserIds || [],
  };
  broadcastToConversationUsers(conversationId, payload, participantUserIds);
  broadcastToUsers(participantUserIds, {
    type:           'conversation.updated',
    conversationId: Number(conversationId),
  });

  // 2. Cross-process via Redis
  redis.publish(CHAT_CHANNEL, {
    _pid:             _PID,
    type:             'participants_updated',
    conversationId:   Number(conversationId),
    participants,
    participantUserIds,
    onlineUserIds:    onlineUserIds || [],
  }).catch(() => {});
}

function emitConversationUpdated(conversationId, userIds) {
  // 1. Local broadcast
  broadcastToUsers(userIds, {
    type:           'conversation.updated',
    conversationId: Number(conversationId),
  });

  // 2. Cross-process via Redis
  redis.publish(CHAT_CHANNEL, {
    _pid:           _PID,
    type:           'conversation_updated',
    conversationId: Number(conversationId),
    userIds,
  }).catch(() => {});
}

module.exports = {
  attachChatRealtime,
  emitConversationUpdated,
  emitMessageCreated,
  emitParticipantsUpdated,
  getOnlineUserIds,
  sendPresenceSnapshot,
};
