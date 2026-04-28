'use strict';
const pool = require('../database/db');

// ── AC-T3: In-process workflow rules cache ────────────────────────────────────
// Two-tier cache: orgRuleCount (org-level rule existence) + transition results
// TTL: 5 minutes. Invalidated by calling invalidateWorkflowRulesCache().
const _wfCache = new Map();
const WF_CACHE_TTL_MS = 5 * 60 * 1000;

function _wfGet(key) {
  const e = _wfCache.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) { _wfCache.delete(key); return undefined; }
  return e.value;
}

function _wfSet(key, value) {
  _wfCache.set(key, { value, expiresAt: Date.now() + WF_CACHE_TTL_MS });
}

/** Called by siteConfig.js after any workflow_rules write to flush stale entries. */
function invalidateWorkflowRulesCache(orgId) {
  if (orgId) {
    // Remove all keys prefixed with this org
    for (const k of _wfCache.keys()) {
      if (k.startsWith(`${orgId}:`)) _wfCache.delete(k);
    }
  } else {
    _wfCache.clear();
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
  const cached = _wfGet(transKey);
  if (cached !== undefined) return cached;

  // Check if any active rules apply to this org (via site scoping or global)
  const orgCountKey = `${orgId}:__count__`;
  let cnt = _wfGet(orgCountKey);
  if (cnt === undefined) {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM workflow_rules wr
       WHERE wr.is_active = 1
         AND (wr.site_id IS NULL OR wr.site_id IN (SELECT id FROM sites WHERE org_id = ?))`,
      [orgId]
    );
    cnt = row.cnt;
    _wfSet(orgCountKey, cnt);
  }

  if (!cnt) {
    _wfSet(transKey, { allowed: true });
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
    _wfSet(transKey, { allowed: true });
    return { allowed: true };
  }

  // Get state names for error message
  const [[fromState]] = await pool.query('SELECT name FROM workflow_states WHERE id = ? LIMIT 1', [fromStateId]);
  const [[toState]] = await pool.query('SELECT name FROM workflow_states WHERE id = ? LIMIT 1', [toStateId]);
  const from = fromState?.name || `State ${fromStateId}`;
  const to = toState?.name || `State ${toStateId}`;

  const result = { allowed: false, reason: `Transition from "${from}" to "${to}" is not permitted by workflow rules.` };
  _wfSet(transKey, result);
  return result;
}

module.exports = { checkTransitionAllowed, invalidateWorkflowRulesCache };
