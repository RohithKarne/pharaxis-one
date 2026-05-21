'use strict';

/**
 * changeControlService.js — Division-level change-control enforcement (P1-E).
 *
 * Division Parameters > General > "Change Control / Logging Rules" stores 17
 * flags (cc_*). This service reads those flags for an org and provides small,
 * additive guards the case routes call before mutating data.
 *
 * Design notes:
 * - All flags default OFF, so enforcement only bites when an admin enables it
 *   for their division — no behaviour change for orgs that don't configure it.
 * - "Require a reason" guards check for a non-empty `reason` in the request.
 * - "Require a password" guards re-verify the user's password (electronic
 *   signature) using the same bcrypt-compare pattern the workflow-rule path uses.
 */

let bcrypt;
try { bcrypt = require('bcryptjs'); } catch (_) { bcrypt = require('bcrypt'); }
const pool = require('../database/db');

// Cached column list so we only ever SELECT real cc_ columns.
const CC_FLAGS = [
  'cc_reason_delete_record', 'cc_reason_change_case', 'cc_reason_refer_case',
  'cc_password_close_case', 'cc_reason_reopen_case', 'cc_password_close_ae',
  'cc_password_close_pc', 'cc_reason_change_letter', 'cc_reason_reopen_letter',
  'cc_reason_reopen_pc', 'cc_reason_reopen_ae', 'cc_reason_change_ae',
  'cc_reason_delete_ae', 'cc_reason_change_pc', 'cc_reason_change_date_received',
  'cc_reason_change_first_response', 'cc_reason_escalation',
];

/** Load the change-control flags for an org. Returns {} if no row. */
async function getRules(orgId) {
  if (!orgId) return {};
  try {
    const [[row]] = await pool.execute(
      `SELECT ${CC_FLAGS.join(', ')} FROM division_parameters WHERE org_id = ? LIMIT 1`,
      [orgId]
    );
    return row || {};
  } catch (_) {
    // If the table/columns aren't present yet, treat as no rules (fail-open by design).
    return {};
  }
}

/** Verify a user's password for "require password" rules. */
async function verifyPassword(userId, password) {
  if (!password) return false;
  const [[user]] = await pool.execute('SELECT password FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!user?.password) return false;
  return bcrypt.compare(String(password), user.password);
}

/**
 * Check a set of reason-required flags. `checks` is an array of
 * { flag, when } — `when` (default true) lets the caller scope the check to a
 * specific condition (e.g. only when a field is changing). Returns an error
 * object { status, error, code } on the first violation, or null if all pass.
 */
function requireReasons(rules, reason, checks) {
  const hasReason = Boolean(String(reason || '').trim());
  for (const { flag, when = true, label } of checks) {
    if (when && rules[flag] && !hasReason) {
      return {
        status: 422,
        code: 'REASON_REQUIRED',
        error: `A reason is required: ${label || flag}.`,
      };
    }
  }
  return null;
}

module.exports = { getRules, verifyPassword, requireReasons, CC_FLAGS };
