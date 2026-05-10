'use strict';
/**
 * redisClient.js — Shared Redis connection + session cache helpers
 *
 * Gracefully degrades: if Redis is unavailable, all cache operations are no-ops
 * and the app falls back to direct DB checks.
 *
 * Session cache TTL: 60s (configurable via SESSION_CACHE_TTL_SECONDS).
 * On logout/force-logout: call sessionCacheInvalidate(token) to revoke immediately.
 *
 * Workflow rule cache TTL: 5min (mirrors in-process TTL, now cross-process safe).
 */

const Redis = require('ioredis');
const { logger } = require('./logger');

const REDIS_URL              = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const SESSION_CACHE_TTL      = parseInt(process.env.SESSION_CACHE_TTL_SECONDS   || '60',  10);
const WORKFLOW_CACHE_TTL     = parseInt(process.env.WORKFLOW_CACHE_TTL_SECONDS  || '300', 10);

// ── Singleton client ──────────────────────────────────────────────────────────
let _client = null;
let _ready  = false;

function getClient() {
  if (_client) return _client;

  _client = new Redis(REDIS_URL, {
    maxRetriesPerRequest:  1,
    enableReadyCheck:      false,
    lazyConnect:           true,
    retryStrategy: (times) => {
      if (times > 3) return null; // stop retrying after 3 attempts — degrade gracefully
      return Math.min(times * 200, 1000);
    },
  });

  _client.on('ready',  ()    => { _ready = true;  logger.info({ url: REDIS_URL }, 'Redis connected'); });
  _client.on('error',  (err) => { _ready = false;  logger.warn({ err: err.message }, 'Redis error — cache disabled, DB fallback active'); });
  _client.on('close',  ()    => { _ready = false; });

  _client.connect().catch(() => {}); // non-fatal — server starts regardless
  return _client;
}

function isReady() { return _ready; }

// ── Session cache ─────────────────────────────────────────────────────────────

async function sessionCacheGet(token) {
  if (!_ready) return null;
  try {
    const raw = await _client.get(`mims:session:${token}`);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

async function sessionCacheSet(token, userData) {
  if (!_ready) return;
  try {
    // Store a clean copy — no circular refs, no functions
    const payload = {
      userId:               userData.userId,
      email:                userData.email,
      role:                 userData.role,
      orgId:                userData.orgId,
      siteId:               userData.siteId,
      passwordResetRequired: userData.passwordResetRequired ?? false,
    };
    await _client.setex(`mims:session:${token}`, SESSION_CACHE_TTL, JSON.stringify(payload));
  } catch (_) {}
}

/** Call on logout or force-logout to revoke the cached session immediately. */
async function sessionCacheInvalidate(token) {
  if (!_ready || !token) return;
  try { await _client.del(`mims:session:${token}`); } catch (_) {}
}

// ── Workflow rule cache ───────────────────────────────────────────────────────

/**
 * Cursor-based key scan — non-blocking alternative to KEYS.
 * Iterates until cursor returns to '0', collecting all matching keys.
 * COUNT 100 is a hint to Redis, not a hard limit per batch.
 */
async function _scanKeys(pattern) {
  const result = [];
  let cursor = '0';
  do {
    const [nextCursor, keys] = await _client.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length) result.push(...keys);
  } while (cursor !== '0');
  return result;
}

async function workflowCacheGet(key) {
  if (!_ready) return null;
  try {
    const raw = await _client.get(`mims:wf:${key}`);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

async function workflowCacheSet(key, value) {
  if (!_ready) return;
  try {
    await _client.setex(`mims:wf:${key}`, WORKFLOW_CACHE_TTL, JSON.stringify(value));
  } catch (_) {}
}

async function workflowCacheInvalidate(orgId) {
  if (!_ready) return;
  try {
    // Use cursor-based SCAN (non-blocking) instead of KEYS (O(N) blocking scan).
    const pattern = orgId ? `mims:wf:${orgId}:*` : 'mims:wf:*';
    const keys = await _scanKeys(pattern);
    if (keys.length) await _client.del(...keys);
  } catch (_) {}
}

// ── Realtime pub/sub ─────────────────────────────────────────────────────────

/**
 * Publish a realtime event to all processes.
 * channel: 'mims:realtime' (app sync) | 'mims:chat' (chat messages)
 */
async function publish(channel, payload) {
  if (!_ready) return;
  try { await _client.publish(channel, JSON.stringify(payload)); } catch (_) {}
}

/**
 * Create a dedicated subscriber client (ioredis subscriber must be a separate instance).
 * Returns a new Redis instance in subscribe mode.
 */
function createSubscriber() {
  const sub = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // retry indefinitely for subscriber
    enableReadyCheck:     false,
    lazyConnect:          true,
    retryStrategy: (times) => Math.min(times * 500, 5000),
  });
  sub.connect().catch(() => {});
  return sub;
}

module.exports = {
  getClient,
  isReady,
  sessionCacheGet,
  sessionCacheSet,
  sessionCacheInvalidate,
  workflowCacheGet,
  workflowCacheSet,
  workflowCacheInvalidate,
  publish,
  createSubscriber,
  SESSION_CACHE_TTL,
  WORKFLOW_CACHE_TTL,
};
