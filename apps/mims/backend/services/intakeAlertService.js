'use strict';

/**
 * intakeAlertService — bridge row 7: MIMS tells its own people about work that arrives
 * from connected systems, and about side-effect hand-offs running out of time.
 *
 * - A side-effect (AE) or complaint (PC) case sent in by a portal lands unassigned; the
 *   organisation's case supervisors (admins and case admins) get an in-app notice.
 * - An open AE case whose hand-off to the safety system has not been started, and
 *   whose hand-off deadline (computeAeHandoffClock) is two days away or less, notifies
 *   the case owner — or the supervisors when nobody owns it — once per case.
 * Uses the existing notification centre; never throws into the caller.
 */

const pool = require('../database/db');
const { createNotifications } = require('./notificationCenterService');
const { logger } = require('./logger');

/** Active people in an organisation who look after the case queue. */
async function getCaseSupervisors(orgId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id FROM users u
       JOIN user_org_access a ON a.user_id = u.id AND a.org_id = ? AND a.is_active = 1
      WHERE u.is_active = 1 AND COALESCE(u.is_disabled, 0) = 0
        AND (a.role_at_org = 'admin' OR u.role = 'admin' OR u.case_admin = 1)`, [orgId]);
  return rows.map(r => r.id);
}

async function notifyIntakeArrival({ orgId, caseId, caseNumber, caseType, sourceName }) {
  if (!['AE', 'PC'].includes(caseType)) return;
  try {
    const users = await getCaseSupervisors(orgId);
    if (!users.length) {
      logger.warn({ org_id: orgId, case_id: caseId }, 'intake alert: organisation has no case supervisor to notify');
      return;
    }
    await createNotifications(users, {
      category: 'intake',
      severity: caseType === 'AE' ? 'warning' : 'info',
      title: `${caseType === 'AE' ? 'New side-effect report' : 'New product complaint'} from ${sourceName}: ${caseNumber}`,
      message: 'It arrived unassigned. Open it to assign an owner.',
      linkUrl: `/cases/${caseId}`,
      metadata: { case_id: caseId, source: sourceName },
      eventKey: `intake:${caseId}`,
    });
  } catch (err) {
    logger.error({ err, case_id: caseId }, 'intake alert failed');
  }
}

async function sweepAeHandoffDeadlines() {
  const { computeAeHandoffClock } = require('./caseGovernanceService');
  const [cases] = await pool.execute(
    `SELECT c.id, c.org_id, c.case_number, c.case_owner_id
       FROM cases c
       LEFT JOIN workflow_states ws ON ws.id = c.status_id
      WHERE c.case_type = 'AE' AND c.is_deleted = 0 AND COALESCE(ws.is_closed, 0) = 0
        AND NOT EXISTS (SELECT 1 FROM case_ae_transmissions t WHERE t.case_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.event_key = CONCAT('ae-handoff-due:', c.id))
      ORDER BY c.id DESC LIMIT 500`);
  const soon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  let notified = 0;
  for (const c of cases) {
    try {
      const clock = await computeAeHandoffClock(c.id);
      if (!clock?.dueDate || clock.dueDate > soon) continue;
      const users = c.case_owner_id ? [c.case_owner_id] : await getCaseSupervisors(c.org_id);
      if (!users.length) continue;
      const overdue = clock.dueDate < new Date().toISOString().slice(0, 10);
      await createNotifications(users, {
        category: 'transmission_sla',
        severity: overdue ? 'critical' : 'warning',
        title: `${c.case_number || `Case ${c.id}`}: side-effect hand-off ${overdue ? 'overdue' : 'due soon'}`,
        message: `Due ${clock.dueDate} (${clock.reason}, counted from the ${clock.from}). No hand-off to the safety system has been started.`,
        linkUrl: `/cases/${c.id}`,
        metadata: { case_id: c.id, due_date: clock.dueDate, priority: clock.priority },
        requiresAcknowledgement: overdue,
        eventKey: `ae-handoff-due:${c.id}`,
      });
      notified++;
    } catch (err) {
      logger.error({ err, case_id: c.id }, 'AE hand-off deadline check failed');
    }
  }
  return notified;
}

module.exports = { getCaseSupervisors, notifyIntakeArrival, sweepAeHandoffDeadlines };
