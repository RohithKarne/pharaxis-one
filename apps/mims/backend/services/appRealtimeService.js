'use strict';

// ── AC-T14: Redis pub/sub for cross-process WebSocket fan-out ─────────────────
// Each Node process maintains its own WebSocket connection registry (in-process Maps).
// When emitDataSync / emitNotificationSync is called on process A, it:
//   1. Broadcasts directly to all local sockets on process A
//   2. Publishes to the 'mims:realtime' Redis channel (includes _pid to prevent echo)
// The subscriber on every OTHER process receives the message and broadcasts to its
// local sockets.  If Redis is unavailable, step 2 is a no-op and the system falls
// back to in-process delivery only (correct for single-process deployments).

const WebSocket = require('ws');
const { URL } = require('url');

const { readCookie, validateAccessToken } = require('../middleware/auth');
const { logger } = require('./logger');
const redis = require('./redisClient');

const REALTIME_CHANNEL = 'mims:realtime';
const _PID = process.pid;

let wss = null;
let _subscriber = null;

const socketState = new Map();
const userSockets = new Map();
const orgSockets  = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  const requestUrl  = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
  const tokenFromQuery = requestUrl.searchParams.get('token');
  const token = tokenFromQuery || readCookie({ headers: { cookie: request.headers.cookie || '' } }, 'mims_token');
  return validateAccessToken(token);
}

function unregisterSocket(ws) {
  const state = socketState.get(ws);
  if (!state) return;
  removeSocketFromIndex(userSockets, state.user?.userId, ws);
  removeSocketFromIndex(orgSockets,  state.user?.orgId,  ws);
  socketState.delete(ws);
}

// ── Local broadcast (same process) ───────────────────────────────────────────

function broadcastToUsers(userIds, payload) {
  const ids = [...new Set((userIds || []).map((v) => Number(v)).filter(Boolean))];
  for (const userId of ids) {
    const sockets = userSockets.get(userId);
    if (!sockets) continue;
    for (const ws of sockets) safeSend(ws, payload);
  }
}

function broadcastToOrgs(orgIds, payload) {
  const ids = [...new Set((orgIds || []).map((v) => Number(v)).filter(Boolean))];
  for (const orgId of ids) {
    const sockets = orgSockets.get(orgId);
    if (!sockets) continue;
    for (const ws of sockets) safeSend(ws, payload);
  }
}

// ── Redis subscriber — fan-out from other processes ───────────────────────────

function _handleRealtimeMessage(raw) {
  try {
    const msg = JSON.parse(raw);
    // Skip our own published messages — already broadcast locally in emitDataSync
    if (msg._pid === _PID) return;

    if (msg.type === 'data_sync') {
      if (msg.userIds?.length) broadcastToUsers(msg.userIds, msg.message);
      if (msg.orgIds?.length)  broadcastToOrgs(msg.orgIds,  msg.message);
    } else if (msg.type === 'notification_sync') {
      if (msg.userId) broadcastToUsers([msg.userId], msg.message);
    }
  } catch (_) {}
}

async function _setupRealtimeSubscriber() {
  try {
    _subscriber = redis.createSubscriber();

    _subscriber.on('message', (channel, raw) => {
      if (channel === REALTIME_CHANNEL) _handleRealtimeMessage(raw);
    });

    _subscriber.on('error', (err) => {
      logger.warn({ err: err.message }, 'appRealtimeService: Redis subscriber error — cross-process sync degraded');
    });

    await _subscriber.subscribe(REALTIME_CHANNEL);
    logger.info({ channel: REALTIME_CHANNEL, pid: _PID }, 'appRealtimeService: Redis subscriber active');
  } catch (err) {
    logger.warn({ err: err.message }, 'appRealtimeService: Redis subscriber setup failed — in-process only');
    _subscriber = null;
  }
}

// ── WebSocket server ──────────────────────────────────────────────────────────

function attachAppRealtime(server) {
  if (wss) return wss;
  wss = new WebSocket.Server({ noServer: true });

  // Start Redis cross-process subscriber
  _setupRealtimeSubscriber();

  server.on('upgrade', async (request, socket, head) => {
    if (!String(request.url || '').startsWith('/api/mobile-sync/ws')) return;

    try {
      const user = await handleSocketAuth(request);
      wss.handleUpgrade(request, socket, head, (ws) => {
        socketState.set(ws, { user });
        addSocketToIndex(userSockets, user.userId, ws);
        addSocketToIndex(orgSockets,  user.orgId,  ws);

        safeSend(ws, {
          type: 'ready',
          user: {
            userId: user.userId,
            email:  user.email,
            role:   user.role,
            orgId:  user.orgId,
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

// ── Public emit API ───────────────────────────────────────────────────────────

function emitDataSync({ userIds = [], orgIds = [], domains = [], reason = 'updated', payload = null }) {
  const message = {
    type:    'sync.hint',
    domains: [...new Set((domains || []).map((v) => String(v || '').trim()).filter(Boolean))],
    reason,
    payload,
    at:      new Date().toISOString(),
  };

  // 1. Broadcast to sockets on this process immediately
  if (userIds.length) broadcastToUsers(userIds, message);
  if (orgIds.length)  broadcastToOrgs(orgIds,  message);

  // 2. Publish cross-process via Redis so other processes fan out to their sockets
  redis.publish(REALTIME_CHANNEL, {
    _pid: _PID,
    type: 'data_sync',
    userIds,
    orgIds,
    message,
  }).catch(() => {});
}

function emitNotificationSync(userId, notification) {
  if (!userId || !notification) return;
  const message = {
    type:         'notification.created',
    notification,
    at:           new Date().toISOString(),
  };

  // 1. Broadcast locally
  broadcastToUsers([userId], message);

  // 2. Cross-process fan-out
  redis.publish(REALTIME_CHANNEL, {
    _pid:    _PID,
    type:    'notification_sync',
    userId:  Number(userId),
    message,
  }).catch(() => {});
}

module.exports = {
  attachAppRealtime,
  emitDataSync,
  emitNotificationSync,
};
