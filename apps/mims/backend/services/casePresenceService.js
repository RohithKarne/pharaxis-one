'use strict';

/**
 * casePresenceService.js — WebSocket presence layer for case rooms.
 *
 * Wave 0 piece #3. Powers:
 *   - Theme 5 (real-time collab, trimmed) — who's viewing this case, @-mentions, field threads
 *   - Theme 9 (compliance) — soft-lock warning when another user is editing a locked field
 *   - Audit chip "currently viewed by" indicator
 *
 * Endpoint: /api/cases/ws?token=<JWT>&caseId=<id>
 * Mirrors the chatRealtimeService pattern (Redis cross-process fanout).
 *
 * Message protocol (client → server):
 *   { type: 'join',   caseId }
 *   { type: 'leave',  caseId }
 *   { type: 'focus',  caseId, field }   — claim a field-level editing focus
 *   { type: 'blur',   caseId, field }   — release a field-level focus
 *   { type: 'typing', caseId, field }   — heartbeat while typing (5s decay)
 *
 * Server → client broadcasts:
 *   { type: 'presence.snapshot', caseId, users:    [{userId,name,initials}] }
 *   { type: 'presence.joined',   caseId, user:     {...} }
 *   { type: 'presence.left',     caseId, userId }
 *   { type: 'presence.focus',    caseId, userId, field }
 *   { type: 'presence.blur',     caseId, userId, field }
 *   { type: 'presence.typing',   caseId, userId, field, expiresAt }
 */

const WebSocket = require('ws');
const { URL }   = require('url');
const { readCookie, validateAccessToken } = require('../middleware/auth');
const { logger } = require('./logger');
const redis = require('./redisClient');

const CHANNEL  = 'mims:case-presence';
const _PID     = process.pid;
const FOCUS_TTL_MS  = 30_000;  // an idle focus auto-releases after 30s
const TYPING_TTL_MS =  6_000;  // typing pulse decays in 6s

let wss = null;
let _subscriber = null;

// state: caseId → { users: Map<userId, {ws, info, lastSeen}>, focus: Map<field, {userId, until}>, typing: Map<userId+field, {until}> }
const rooms       = new Map();
const socketState = new Map(); // ws → { user, joinedCaseIds: Set<number> }

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeSend(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  try { ws.send(JSON.stringify(payload)); } catch (_) {}
}

function getRoom(caseId) {
  const id = Number(caseId || 0);
  if (!id) return null;
  if (!rooms.has(id)) {
    rooms.set(id, { users: new Map(), focus: new Map(), typing: new Map() });
  }
  return rooms.get(id);
}

function snapshotUsers(room) {
  return [...room.users.values()].map(u => u.info);
}

function broadcastToRoom(caseId, payload, exceptWs = null) {
  const room = rooms.get(Number(caseId || 0));
  if (!room) return;
  for (const u of room.users.values()) {
    if (u.ws === exceptWs) continue;
    safeSend(u.ws, payload);
  }
}

async function handleSocketAuth(request) {
  const url   = new URL(request.url, `http://${request.headers.host || '127.0.0.1'}`);
  const token = url.searchParams.get('token')
            || readCookie({ headers: { cookie: request.headers.cookie || '' } }, 'mims_token');
  return validateAccessToken(token);
}

function userInfoFor(user) {
  return {
    userId:   Number(user.userId),
    name:     user.name || user.email || `User ${user.userId}`,
    email:    user.email || null,
    initials: (user.name || user.email || '?').slice(0, 2).toUpperCase(),
    orgId:    user.orgId ?? null,
  };
}

// ── Join / Leave ──────────────────────────────────────────────────────────────

function joinRoom(ws, caseId) {
  const state = socketState.get(ws);
  if (!state) return;
  const id = Number(caseId || 0);
  if (!id) return;
  const room = getRoom(id);
  const info = userInfoFor(state.user);
  room.users.set(info.userId, { ws, info, lastSeen: Date.now() });
  state.joinedCaseIds.add(id);
  // notify joiner with the current snapshot
  safeSend(ws, { type: 'presence.snapshot', caseId: id, users: snapshotUsers(room) });
  // notify the rest
  broadcastToRoom(id, { type: 'presence.joined', caseId: id, user: info }, ws);
  // cross-process
  publishEvent({ type: 'joined', caseId: id, user: info });
}

function leaveRoom(ws, caseId) {
  const state = socketState.get(ws);
  if (!state) return;
  const id = Number(caseId || 0);
  const room = rooms.get(id);
  if (!room) return;
  const userId = Number(state.user.userId);
  room.users.delete(userId);
  // release any focus held by this user
  for (const [field, f] of [...room.focus.entries()]) {
    if (f.userId === userId) {
      room.focus.delete(field);
      broadcastToRoom(id, { type: 'presence.blur', caseId: id, userId, field });
    }
  }
  state.joinedCaseIds.delete(id);
  broadcastToRoom(id, { type: 'presence.left', caseId: id, userId });
  publishEvent({ type: 'left', caseId: id, userId });
  if (room.users.size === 0) rooms.delete(id);
}

function setFocus(ws, caseId, field) {
  const state = socketState.get(ws);
  if (!state || !field) return;
  const room = rooms.get(Number(caseId || 0));
  if (!room) return;
  const userId = Number(state.user.userId);
  const until  = Date.now() + FOCUS_TTL_MS;
  room.focus.set(field, { userId, until });
  const payload = { type: 'presence.focus', caseId: Number(caseId), userId, field };
  broadcastToRoom(caseId, payload);
  publishEvent({ ...payload, type: 'focus' });
}

function clearFocus(ws, caseId, field) {
  const state = socketState.get(ws);
  if (!state || !field) return;
  const room = rooms.get(Number(caseId || 0));
  if (!room) return;
  const userId = Number(state.user.userId);
  const held = room.focus.get(field);
  if (held && held.userId === userId) room.focus.delete(field);
  const payload = { type: 'presence.blur', caseId: Number(caseId), userId, field };
  broadcastToRoom(caseId, payload);
  publishEvent({ ...payload, type: 'blur' });
}

function pulseTyping(ws, caseId, field) {
  const state = socketState.get(ws);
  if (!state || !field) return;
  const room = rooms.get(Number(caseId || 0));
  if (!room) return;
  const userId = Number(state.user.userId);
  const until  = Date.now() + TYPING_TTL_MS;
  room.typing.set(`${userId}:${field}`, { until });
  const payload = {
    type: 'presence.typing', caseId: Number(caseId), userId, field, expiresAt: until,
  };
  broadcastToRoom(caseId, payload, ws);
  publishEvent({ ...payload, type: 'typing' });
}

// ── Sweeper — expire stale focus / typing every 5s ────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [caseId, room] of rooms.entries()) {
    for (const [field, f] of [...room.focus.entries()]) {
      if (f.until < now) {
        room.focus.delete(field);
        broadcastToRoom(caseId, { type: 'presence.blur', caseId, userId: f.userId, field });
      }
    }
    for (const [key, t] of [...room.typing.entries()]) {
      if (t.until < now) room.typing.delete(key);
    }
  }
}, 5000).unref?.();

// ── Unregister ────────────────────────────────────────────────────────────────

function unregisterSocket(ws) {
  const state = socketState.get(ws);
  if (!state) return;
  for (const id of [...state.joinedCaseIds]) leaveRoom(ws, id);
  socketState.delete(ws);
}

// ── Redis fan-out ─────────────────────────────────────────────────────────────

function publishEvent(evt) {
  redis.publish(CHANNEL, { _pid: _PID, ...evt }).catch(() => {});
}

function _applyRemoteEvent(msg) {
  if (msg._pid === _PID) return;
  const room = rooms.get(Number(msg.caseId || 0));
  if (!room && msg.type !== 'snapshot') {
    // Nobody local in this room — ignore.
    return;
  }
  if (msg.type === 'joined') {
    broadcastToRoom(msg.caseId, { type: 'presence.joined', caseId: msg.caseId, user: msg.user });
  } else if (msg.type === 'left') {
    broadcastToRoom(msg.caseId, { type: 'presence.left',   caseId: msg.caseId, userId: msg.userId });
  } else if (msg.type === 'focus') {
    broadcastToRoom(msg.caseId, { type: 'presence.focus',  caseId: msg.caseId, userId: msg.userId, field: msg.field });
  } else if (msg.type === 'blur') {
    broadcastToRoom(msg.caseId, { type: 'presence.blur',   caseId: msg.caseId, userId: msg.userId, field: msg.field });
  } else if (msg.type === 'typing') {
    broadcastToRoom(msg.caseId, {
      type: 'presence.typing', caseId: msg.caseId, userId: msg.userId, field: msg.field, expiresAt: msg.expiresAt,
    });
  }
}

async function _setupSubscriber() {
  try {
    _subscriber = redis.createSubscriber();
    _subscriber.on('message', (channel, raw) => {
      if (channel !== CHANNEL) return;
      try { _applyRemoteEvent(JSON.parse(raw)); } catch (_) {}
    });
    _subscriber.on('error', (err) => {
      logger.warn({ err: err.message }, 'casePresenceService: Redis subscriber error');
    });
    await _subscriber.subscribe(CHANNEL);
    logger.info({ channel: CHANNEL, pid: _PID }, 'casePresenceService: Redis subscriber active');
  } catch (err) {
    logger.warn({ err: err.message }, 'casePresenceService: subscriber setup failed — in-process only');
    _subscriber = null;
  }
}

// ── WebSocket server ──────────────────────────────────────────────────────────

function attachCasePresence(server) {
  if (wss) return wss;
  wss = new WebSocket.Server({ noServer: true });
  _setupSubscriber();

  server.on('upgrade', async (request, socket, head) => {
    if (!String(request.url || '').startsWith('/api/cases/ws')) return;
    try {
      const user = await handleSocketAuth(request);
      wss.handleUpgrade(request, socket, head, (ws) => {
        socketState.set(ws, { user, joinedCaseIds: new Set() });
        safeSend(ws, { type: 'ready', user: userInfoFor(user) });

        ws.on('message', (raw) => {
          let payload; try { payload = JSON.parse(String(raw || '{}')); } catch { return; }
          switch (payload.type) {
            case 'join':   return joinRoom(ws,  payload.caseId);
            case 'leave':  return leaveRoom(ws, payload.caseId);
            case 'focus':  return setFocus(ws,  payload.caseId, payload.field);
            case 'blur':   return clearFocus(ws, payload.caseId, payload.field);
            case 'typing': return pulseTyping(ws, payload.caseId, payload.field);
            case 'ping':   return safeSend(ws, { type: 'pong', t: Date.now() });
          }
        });
        ws.on('close', () => unregisterSocket(ws));
        ws.on('error', () => unregisterSocket(ws));
      });
    } catch (err) {
      logger.warn({ err, route: '/api/cases/ws' }, 'Rejected case-presence websocket');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  return wss;
}

// Public — readers (used by HTTP endpoints for the audit chip "currently viewed by")
function getRoomUsers(caseId) {
  const room = rooms.get(Number(caseId || 0));
  return room ? snapshotUsers(room) : [];
}

function getRoomFocus(caseId) {
  const room = rooms.get(Number(caseId || 0));
  if (!room) return [];
  return [...room.focus.entries()].map(([field, f]) => ({ field, userId: f.userId, until: f.until }));
}

module.exports = {
  attachCasePresence,
  getRoomUsers,
  getRoomFocus,
};
