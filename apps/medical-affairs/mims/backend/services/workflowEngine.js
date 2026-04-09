'use strict';
const pool = require('../database/db');

/**
 * checkTransitionAllowed(orgId, fromStateId, toStateId)
 * Returns { allowed: true } or { allowed: false, reason: '...' }
 * If no workflow rules apply to this org, allows all transitions (open system).
 */
async function checkTransitionAllowed(orgId, fromStateId, toStateId) {
  if (!toStateId || fromStateId === toStateId) return { allowed: true };
  if (!fromStateId) return { allowed: true };

  // Check if any active rules apply to this org (via site scoping or global)
  const [[{ cnt }]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM workflow_rules wr
     WHERE wr.is_active = 1
       AND (wr.site_id IS NULL OR wr.site_id IN (SELECT id FROM sites WHERE org_id = ?))`,
    [orgId]
  );
  if (!cnt) return { allowed: true }; // No rules = open system

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
  if (rules.length > 0) return { allowed: true };

  // Get state names for error message
  const [[fromState]] = await pool.query('SELECT name FROM workflow_states WHERE id = ? LIMIT 1', [fromStateId]);
  const [[toState]] = await pool.query('SELECT name FROM workflow_states WHERE id = ? LIMIT 1', [toStateId]);
  const from = fromState?.name || `State ${fromStateId}`;
  const to = toState?.name || `State ${toStateId}`;

  return { allowed: false, reason: `Transition from "${from}" to "${to}" is not permitted by workflow rules.` };
}

module.exports = { checkTransitionAllowed };
