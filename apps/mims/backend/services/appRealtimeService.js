'use strict';

const WebSocket = require('ws');
const { URL } = require('url');

const { readCookie, validateAccessToken } = require('../middleware/auth');
const { logger } = require('./logger');

let wss = null;

const socketState = new Map();
const userSockets = new Map();
const orgSockets = new Map();

function safeSend(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch (_) {
    // best-effort only
  }
}

function ensureSocketSet(map, key) {
  const normalized = Number(key || 0);
  if (!normalized) return null;
  if (!map.has(normalized)) map.set(normalized, new Set());
  return map.get(normalized);
}

function addSocketToIndex(map, key, ws) {
  const set = ensureSocketSet(map, key);
  if (!set) return;
  set.add(ws);
}

function removeSocketFromIndex(map, key, ws) {
  const normalized = Number(key || 0);
  if (!normalized) return;
  const set = map.get(normalized);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) map.delete(normalized);
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
  removeSocketFromIndex(userSockets, state.user?.userId, ws);
  removeSocketFromIndex(orgSockets, state.user?.orgId, ws);
  socketState.delete(ws);
}

function attachAppRealtime(server) {
  if (wss) return wss;
  wss = new WebSocket.Server({ noServer: true });

  server.on('upgrade', async (request, socket, head) => {
    if (!String(request.url || '').startsWith('/api/mobile-sync/ws')) return;

    try {
      const user = await handleSocketAuth(request);
      wss.handleUpgrade(request, socket, head, (ws) => {
        socketState.set(ws, { user });
        addSocketToIndex(userSockets, user.userId, ws);
        addSocketToIndex(orgSockets, user.orgId, ws);

        safeSend(ws, {
          type: 'ready',
          user: {
            userId: user.userId,
            email: user.email,
            role: user.role,
            orgId: user.orgId,
            siteId: user.siteId,
          },
        });

        ws.on('close', () => unregisterSocket(ws));
        ws.on('error', () => unregisterSocket(ws));
      });
    } catch (err) {
      logger.warn({ err, route: '/api/mobile-sync/ws' }, 'Rejected mobile sync websocket connection');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  return wss;
}

function broadcastToUsers(userIds, payload) {
  const ids = [...new Set((userIds || []).map((value) => Number(value)).filter(Boolean))];
  for (const userId of ids) {
    const sockets = userSockets.get(userId);
    if (!sockets) continue;
    for (const ws of sockets) safeSend(ws, payload);
  }
}

function broadcastToOrgs(orgIds, payload) {
  const ids = [...new Set((orgIds || []).map((value) => Number(value)).filter(Boolean))];
  for (const orgId of ids) {
    const sockets = orgSockets.get(orgId);
    if (!sockets) continue;
    for (const ws of sockets) safeSend(ws, payload);
  }
}

function emitDataSync({ userIds = [], orgIds = [], domains = [], reason = 'updated', payload = null }) {
  const message = {
    type: 'sync.hint',
    domains: [...new Set((domains || []).map((value) => String(value || '').trim()).filter(Boolean))],
    reason,
    payload,
    at: new Date().toISOString(),
  };
  if (userIds.length) broadcastToUsers(userIds, message);
  if (orgIds.length) broadcastToOrgs(orgIds, message);
}

function emitNotificationSync(userId, notification) {
  if (!userId || !notification) return;
  broadcastToUsers([userId], {
    type: 'notification.created',
    notification,
    at: new Date().toISOString(),
  });
}

module.exports = {
  attachAppRealtime,
  emitDataSync,
  emitNotificationSync,
};
