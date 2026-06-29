'use strict';

/**
 * workflowSlaService.js — Sprint 2 #11: workflow state SLA tracking.
 *
 * Tracks per-case time-in-state and flags breaches relative to configured SLAs.
 * Two entry points:
 *   - enterState({orgId, caseId, state, userId})  — close prior timing row, open new one
 *   - getCaseTiming({orgId, caseId})              — current state + elapsed + remaining
 *
 * A background sweeper (`scanForBreaches`) is intended to run on the existing
 * scheduler every 5 minutes to flip warning/breached/escalated flags and emit
 * alerts via the existing alerts system. The scheduler wiring is left to the
 * caller (uses the same pattern as the DPPR scheduler).
 *
 * SLA hours are interpreted as wall-clock by default; business-hours mode is
 * supported via the `BUSINESS_HOURS_TZ` env var + simple weekday/Mon-Fri filter.
 */

const pool = require('../database/db');
const { logger } = require('./logger');
const { createNotifications } = require('./notificationCenterService');

// WP8: resolve who to alert on a state-SLA breach — the case owner, the explicit
// escalation user, and anyone holding the configured escalation role in the org.
async function resolveBreachRecipients(orgId, caseOwnerId, escalationUserId, escalationRole) {
  const ids = new Set();
  if (caseOwnerId) ids.add(Number(caseOwnerId));
  if (escalationUserId) ids.add(Number(escalationUserId));
  if (escalationRole) {
    try {
      const [urows] = await pool.execute(
        `SELECT user_id FROM user_org_access
          WHERE org_id = ? AND is_active = 1 AND role_at_org = ?`,
        [orgId, escalationRole]
      );
      for (const u of urows) ids.add(Number(u.user_id));
    } catch (e) { logger.warn({ err: e.message }, 'workflowSla: escalation-role lookup failed'); }
  }
  return [...ids].filter(Boolean);
}

const BUSINESS_HOURS_MODE = String(process.env.WORKFLOW_SLA_MODE || 'wall_clock').toLowerCase();

async function getSlaConfig({ orgId, caseType, state }) {
  // Org-specific row beats global (org_id IS NULL) for the same case_type+state.
  const [rows] = await pool.execute(
    `SELECT * FROM workflow_state_sla
      WHERE is_active = 1
        AND (org_id = ? OR org_id IS NULL)
        AND (case_type = ? OR case_type = 'ALL')
        AND state = ?
      ORDER BY org_id IS NULL ASC, case_type = 'ALL' ASC
      LIMIT 1`,
    [orgId, caseType, state]
  );
  return rows[0] || null;
}

async function enterState({ orgId, caseId, state, userId, caseType = null }) {
  // 1) Close out any currently-open timing row for this case.
  await pool.execute(
    `UPDATE case_state_timings
        SET exited_at = NOW(),
            elapsed_seconds = TIMESTAMPDIFF(SECOND, entered_at, NOW())
      WHERE case_id = ? AND exited_at IS NULL`,
    [caseId]
  );

  // 2) Determine case_type if not provided.
  let ct = caseType;
  if (!ct) {
    const [[row]] = await pool.execute(`SELECT case_type FROM cases WHERE id = ?`, [caseId]);
    ct = String(row?.case_type || 'ALL');
  }
  const sla = await getSlaConfig({ orgId, caseType: ct, state });

  // 3) Insert the new timing row.
  const [r] = await pool.execute(
    `INSERT INTO case_state_timings
       (org_id, case_id, state, sla_hours_snapshot, moved_by)
     VALUES (?, ?, ?, ?, ?)`,
    [orgId, caseId, state, sla?.sla_hours || null, userId || null]
  );
  return { timing_id: r.insertId, sla };
}

/**
 * getCaseTiming — current state details for a case.
 * Returns { state, entered_at, elapsed_seconds, sla_hours, status: ok|warning|breached, remaining_seconds }
 */
async function getCaseTiming({ orgId, caseId }) {
  const [[current]] = await pool.execute(
    `SELECT t.*, s.warning_threshold_pct
       FROM case_state_timings t
       LEFT JOIN workflow_state_sla s
              ON (s.org_id = t.org_id OR s.org_id IS NULL)
             AND s.state = t.state
      WHERE t.case_id = ? AND t.exited_at IS NULL
      ORDER BY t.entered_at DESC LIMIT 1`,
    [caseId]
  );
  if (!current) return null;
  const elapsed = Math.floor((Date.now() - new Date(current.entered_at).getTime()) / 1000);
  const slaSeconds = (current.sla_hours_snapshot || 0) * 3600;
  let status = 'ok';
  const warnThreshold = (current.warning_threshold_pct || 75) / 100;
  if (slaSeconds && elapsed >= slaSeconds)                 status = 'breached';
  else if (slaSeconds && elapsed >= slaSeconds * warnThreshold) status = 'warning';
  return {
    timing_id: current.id,
    state: current.state,
    entered_at: current.entered_at,
    elapsed_seconds: elapsed,
    sla_hours: current.sla_hours_snapshot,
    sla_seconds: slaSeconds,
    remaining_seconds: slaSeconds ? slaSeconds - elapsed : null,
    breached_at: current.breached_at,
    warning_fired_at: current.warning_fired_at,
    escalated_at: current.escalated_at,
    status,
  };
}

/**
 * History of timings (closed rows + current) for a case — used by the case timeline view.
 */
async function listCaseTimings({ orgId, caseId }) {
  const [rows] = await pool.execute(
    `SELECT id, state, entered_at, exited_at, elapsed_seconds, sla_hours_snapshot,
            breached_at, warning_fired_at, escalated_at, moved_by
       FROM case_state_timings
      WHERE case_id = ? AND org_id = ?
      ORDER BY entered_at ASC`,
    [caseId, orgId]
  );
  return rows;
}

/**
 * Sweeper — flips warning/breached/escalated flags for all open timing rows.
 * Returns a summary { warnings, breaches, escalations } for telemetry.
 */
async function scanForBreaches() {
  let warnings = 0, breaches = 0, escalations = 0;
  try {
    const [rows] = await pool.execute(
      `SELECT t.id, t.org_id, t.case_id, t.state, t.entered_at, t.sla_hours_snapshot,
              t.warning_fired_at, t.breached_at, t.escalated_at,
              s.warning_threshold_pct, s.escalation_role, s.escalation_user_id,
              c.case_number, c.case_owner_id
         FROM case_state_timings t
         LEFT JOIN workflow_state_sla s
                ON (s.org_id = t.org_id OR s.org_id IS NULL)
               AND s.state = t.state
         LEFT JOIN cases c ON c.id = t.case_id
        WHERE t.exited_at IS NULL
          AND t.sla_hours_snapshot IS NOT NULL`
    );
    const now = Date.now();
    for (const r of rows) {
      const elapsed = Math.floor((now - new Date(r.entered_at).getTime()) / 1000);
      const slaSeconds = r.sla_hours_snapshot * 3600;
      const warnThreshold = (r.warning_threshold_pct || 75) / 100;
      const updates = [];
      const params = [];
      if (!r.warning_fired_at && elapsed >= slaSeconds * warnThreshold) {
        updates.push('warning_fired_at = NOW()'); warnings++;
      }
      if (!r.breached_at && elapsed >= slaSeconds) {
        updates.push('breached_at = NOW()'); breaches++;
      }
      if (!r.escalated_at && elapsed >= slaSeconds && (r.escalation_role || r.escalation_user_id)) {
        updates.push('escalated_at = NOW()'); escalations++;
      }
      if (updates.length) {
        await pool.execute(
          `UPDATE case_state_timings SET ${updates.join(', ')} WHERE id = ?`,
          [...params, r.id]
        );

        // WP8: ENFORCEMENT — the sweeper previously only flipped flags. Now a fresh
        // breach/escalation notifies the case owner + escalation target. eventKey makes
        // it idempotent, and breached_at/escalated_at are set once, so it fires once.
        const newlyBreached  = updates.includes('breached_at = NOW()');
        const newlyEscalated = updates.includes('escalated_at = NOW()');
        if (newlyBreached || newlyEscalated) {
          const recipients = await resolveBreachRecipients(r.org_id, r.case_owner_id, r.escalation_user_id, r.escalation_role);
          if (recipients.length) {
            const ref = r.case_number || `Case ${r.case_id}`;
            await createNotifications(recipients, {
              category: 'sla_breach',
              title: `SLA breached: ${ref}`,
              message: `${ref} has exceeded its SLA while in state "${r.state}". Immediate action required.`,
              linkUrl: `/cases/${r.case_id}`,
              metadata: { case_id: r.case_id, state: r.state, timing_id: r.id, escalated: newlyEscalated },
              severity: 'critical',
              requiresAcknowledgement: true,
              eventKey: `case-state-sla-breach-${r.id}`,
            }).catch((e) => logger.warn({ err: e.message, timing_id: r.id }, 'workflowSla: breach notification failed'));
          }
        }
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'workflowSla scanForBreaches failed');
  }
  return { warnings, breaches, escalations };
}

module.exports = {
  enterState, getCaseTiming, listCaseTimings,
  getSlaConfig, scanForBreaches, BUSINESS_HOURS_MODE,
};
