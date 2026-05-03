'use strict';

const WebSocket = require('ws');
const { URL } = require('url');
const { readCookie, validateAccessToken } = require('../middleware/auth');
const { logger } = require('./logger');

let wss = null;

const socketState = new Map();
const userSockets = new Map();
const conversationSockets = new Map();

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
  return [...new Set((userIds || []).map((value) => Number(value)).filter(Boolean))]
    .filter((userId) => (userSockets.get(userId)?.size || 0) > 0);
}

function sendPresenceSnapshot(conversationId, participantIds) {
  const sockets = conversationSockets.get(Number(conversationId || 0));
  if (!sockets || sockets.size === 0) return;
  const allowedUserIds = [...new Set((participantIds || []).map((value) => Number(value)).filter(Boolean))];
  const onlineUserIds = getOnlineUserIds(allowedUserIds);
  const payload = {
    type: 'presence.updated',
    conversationId: Number(conversationId),
    onlineUserIds,
  };
  for (const ws of sockets) {
    const state = socketState.get(ws);
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
  const allowed = [...new Set((allowedUserIds || []).map((value) => Number(value)).filter(Boolean))];
  for (const ws of sockets) {
    const state = socketState.get(ws);
    const userId = Number(state?.user?.userId || 0);
    if (!allowed.includes(userId)) continue;
    safeSend(ws, payload);
  }
}

function pruneConversationSubscriptions(conversationId, allowedUserIds) {
  const key = Number(conversationId || 0);
  const sockets = conversationSockets.get(key);
  if (!sockets) return;
  const allowed = new Set((allowedUserIds || []).map((value) => Number(value)).filter(Boolean));
  for (const ws of [...sockets]) {
    const state = socketState.get(ws);
    const userId = Number(state?.user?.userId || 0);
    if (allowed.has(userId)) continue;
    sockets.delete(ws);
    state?.subscriptions?.delete(key);
  }
  if (sockets.size === 0) conversationSockets.delete(key);
}

function broadcastToUsers(userIds, payload) {
  const ids = [...new Set((userIds || []).map((value) => Number(value)).filter(Boolean))];
  for (const userId of ids) {
    const sockets = userSockets.get(userId);
    if (!sockets) continue;
    for (const ws of sockets) safeSend(ws, payload);
  }
}

async function handleSocketAuth(request) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
  const tokenFromQuery = requestUrl.searchParams.get('token');
  const token = tokenFromQuery || readCookie({ headers: { cookie: request.headers.cookie || '' } }, 'mims_token');
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

function attachChatRealtime(server) {
  if (wss) return wss;
  wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', async (request, socket, head) => {
    if (!String(request.url || '').startsWith('/api/chat/ws')) return;

    try {
      const user = await handleSocketAuth(request);
      wss.handleUpgrade(request, socket, head, (ws) => {
        const initialState = {
          user,
          subscriptions: new Map(),
        };
        socketState.set(ws, initialState);
        getUserConnectionSet(user.userId).add(ws);

        safeSend(ws, {
          type: 'ready',
          user: {
            userId: user.userId,
            email: user.email,
            role: user.role,
            orgId: user.orgId,
          },
        });

        ws.on('message', (raw) => {
          try {
            const payload = JSON.parse(String(raw || '{}'));
            if (payload.type === 'subscribe') {
              const conversationId = Number(payload.conversationId || 0);
              if (!conversationId) return;
              const participantUserIds = [...new Set((payload.participantUserIds || []).map((value) => Number(value)).filter(Boolean))];
              initialState.subscriptions.set(conversationId, participantUserIds);
              getConversationConnectionSet(conversationId).add(ws);
              safeSend(ws, { type: 'subscribed', conversationId });
              sendPresenceSnapshot(conversationId, participantUserIds);
              return;
            }
            if (payload.type === 'unsubscribe') {
              const conversationId = Number(payload.conversationId || 0);
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

function emitMessageCreated(conversationId, message, participantUserIds) {
  broadcastToConversationUsers(conversationId, {
    type: 'message.created',
    conversationId: Number(conversationId),
    message,
  }, participantUserIds);
  broadcastToUsers(participantUserIds, {
    type: 'conversation.updated',
    conversationId: Number(conversationId),
  });
}

function emitParticipantsUpdated(conversationId, participants, onlineUserIds) {
  const participantUserIds = participants.map((item) => item.user_id);
  pruneConversationSubscriptions(conversationId, participantUserIds);
  const payload = {
    type: 'participants.updated',
    conversationId: Number(conversationId),
    participants,
    onlineUserIds: onlineUserIds || [],
  };
  broadcastToConversationUsers(conversationId, payload, participantUserIds);
  broadcastToUsers(participantUserIds, {
    type: 'conversation.updated',
    conversationId: Number(conversationId),
  });
}

function emitConversationUpdated(conversationId, userIds) {
  broadcastToUsers(userIds, {
    type: 'conversation.updated',
    conversationId: Number(conversationId),
  });
}

module.exports = {
  attachChatRealtime,
  emitConversationUpdated,
  emitMessageCreated,
  emitParticipantsUpdated,
  getOnlineUserIds,
  sendPresenceSnapshot,
};
