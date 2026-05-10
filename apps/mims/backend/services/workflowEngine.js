'use strict';
const pool  = require('../database/db');
const redis = require('./redisClient');

// ── AC-T3: Workflow rules cache — Redis-backed, cross-process safe ────────────
// Redis is the primary cache (shared across all processes).
// In-process Map is a fallback for when Redis is not yet connected at startup.
// TTL: 5 minutes (WORKFLOW_CACHE_TTL from redisClient, default 300s).
// Invalidated cross-process by calling invalidateWorkflowRulesCache().

const _local       = new Map();
const LOCAL_TTL_MS = 5 * 60 * 1000;

function _localGet(key) {
  const e = _local.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) { _local.delete(key); return undefined; }
  return e.value;
}

function _localSet(key, value) {
  _local.set(key, { value, expiresAt: Date.now() + LOCAL_TTL_MS });
}

async function _wfGet(key) {
  const fromRedis = await redis.workflowCacheGet(key); // null on miss or Redis down
  if (fromRedis !== null) return fromRedis;
  const fromLocal = _localGet(key);
  return fromLocal !== undefined ? fromLocal : undefined;
}

async function _wfSet(key, value) {
  await redis.workflowCacheSet(key, value); // cross-process
  _localSet(key, value);                    // local fallback
}

/** Called by siteConfig.js after any workflow_rules write to flush stale entries. */
async function invalidateWorkflowRulesCache(orgId) {
  await redis.workflowCacheInvalidate(orgId); // clears Redis keys across all processes
  if (orgId) {
    for (const k of _local.keys()) {
      if (k.startsWith(`${orgId}:`)) _local.delete(k);
    }
  } else {
    _local.clear();
  }
}

/**
 * checkTransitionAllowed(orgId, fromStateId, toStateId)
 * Returns { allowed: true } or { allowed: false, reason: '...' }
 * If no workflow rules apply to this org, allows all transitions (open system).
 */
async function checkTransitionAllowed(orgId, fromStateId, toStateId) {
  if (!toStateId || fromStateId === toStateId) return { allowed: true };
  if (!fromStateId) return { allowed: true };

  const transKey = `${orgId}:${fromStateId}:${toStateId}`;
  const cached = await _wfGet(transKey);
  if (cached !== undefined) return cached;

  // Check if any active rules apply to this org (via site scoping or global)
  const orgCountKey = `${orgId}:__count__`;
  let cnt = await _wfGet(orgCountKey);
  if (cnt === undefined) {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM workflow_rules wr
       WHERE wr.is_active = 1
         AND (wr.site_id IS NULL OR wr.site_id IN (SELECT id FROM sites WHERE org_id = ?))`,
      [orgId]
    );
    cnt = row.cnt;
    await _wfSet(orgCountKey, cnt);
  }

  if (!cnt) {
    await _wfSet(transKey, { allowed: true });
    return { allowed: true }; // No rules = open system
  }

  // Check if a rule explicitly allows this transition
  const [rules] = await pool.query(
    `SELECT id FROM workflow_rules
     WHERE is_active = 1
       AND from_state_id = ?
       AND to_state_id = ?
       AND (site_id IS NULL OR site_id IN (SELECT id FROM sites WHERE org_id = ?))
     LIMIT 1`,
    [fromStateId, toStateId, orgId]
  );

  if (rules.length > 0) {
    await _wfSet(transKey, { allowed: true });
    return { allowed: true };
  }

  // Get state names for error message
  const [[fromState]] = await pool.query('SELECT name FROM workflow_states WHERE id = ? LIMIT 1', [fromStateId]);
  const [[toState]]   = await pool.query('SELECT name FROM workflow_states WHERE id = ? LIMIT 1', [toStateId]);
  const from = fromState?.name || `State ${fromStateId}`;
  const to   = toState?.name   || `State ${toStateId}`;

  const result = { allowed: false, reason: `Transition from "${from}" to "${to}" is not permitted by workflow rules.` };
  await _wfSet(transKey, result);
  return result;
}

module.exports = { checkTransitionAllowed, invalidateWorkflowRulesCache };
