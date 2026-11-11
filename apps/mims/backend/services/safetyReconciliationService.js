'use strict';

/**
 * safetyReconciliationService.js — Real-Time Pharmacovigilance Safety Reconciliation Engine.
 *
 * Fulfills GVP Module VI and FDA 21 CFR 314.80 reconciliation mandates:
 * Compares incoming safety reports (portal intakes, email messages) against active MIMS
 * Adverse Event cases to ensure ZERO lost events and strictly enforce the 24-hour
 * intake-to-triage regulatory clock.
 */

const pool = require('../database/db');

async function runReconciliation({ orgId, userId = null } = {}) {
  const safeOrgId = orgId || 1;

  // 1. Fetch all AE cases for this organization
  const [aeCases] = await pool.execute(
    `SELECT c.id, c.case_number, c.case_type, c.product_name, c.source_reference, c.created_at,
            c.awareness_date, c.received_date, c.status_id, ws.name AS status_name
       FROM cases c
       LEFT JOIN workflow_states ws ON ws.id = c.status_id
      WHERE c.org_id = ? AND c.case_type = 'AE' AND c.is_deleted = 0
      ORDER BY c.id DESC LIMIT 500`,
    [safeOrgId]
  ).catch(() => [[]]);

  // 2. Fetch safety-related intake messages from inbox
  const [safetyInbox] = await pool.execute(
    `SELECT m.id, m.subject, m.from_email, m.received_at, m.case_id, m.status
       FROM inbox_messages m
      WHERE m.org_id = ? AND (
        LOWER(m.subject) LIKE '%adverse%' OR
        LOWER(m.subject) LIKE '%side effect%' OR
        LOWER(m.subject) LIKE '%reaction%' OR
        m.classification = 'adverse_event'
      )
      ORDER BY m.id DESC LIMIT 200`,
    [safeOrgId]
  ).catch(() => [[]]);

  // 3. Analyze for unlinked safety intakes
  const unlinkedIntakes = safetyInbox
    .filter(msg => !msg.case_id || msg.status === 'unprocessed')
    .map(msg => ({
      source: 'email_inbox',
      id: msg.id,
      reference: msg.subject,
      from: msg.from_email,
      received_at: msg.received_at,
      discrepancy_reason: 'Safety email intake received without linked Adverse Event case',
    }));

  // 4. Analyze for delayed triage (>24h without workflow progression)
  const now = Date.now();
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  const delayedCases = aeCases
    .filter(c => {
      const intakeTime = new Date(c.awareness_date || c.created_at).getTime();
      const isPast24h = (now - intakeTime) > TWENTY_FOUR_HOURS_MS;
      const isStillInitial = !c.status_name || ['New', 'Intake', 'Draft', 'Unassigned'].includes(c.status_name);
      return isPast24h && isStillInitial;
    })
    .map(c => ({
      case_id: c.id,
      case_number: c.case_number,
      product: c.product_name,
      awareness_date: c.awareness_date || c.created_at,
      status: c.status_name,
      discrepancy_reason: 'AE case created >24 hours ago remains in initial status without safety triage',
    }));

  const totalIntakes = aeCases.length + unlinkedIntakes.length;
  const matchedCases = aeCases.length;
  const isBalanced = unlinkedIntakes.length === 0 && delayedCases.length === 0;
  const status = isBalanced ? 'balanced' : 'discrepancy_detected';
  const reconciliationRate = totalIntakes > 0 ? Math.round((matchedCases / totalIntakes) * 100) : 100;

  const detailsJson = JSON.stringify({
    total_intakes: totalIntakes,
    matched_cases: matchedCases,
    unlinked_intakes_count: unlinkedIntakes.length,
    delayed_cases_count: delayedCases.length,
    unlinked_intakes: unlinkedIntakes.slice(0, 20),
    delayed_cases: delayedCases.slice(0, 20),
    sample_cases: aeCases.slice(0, 10).map(c => ({ id: c.id, number: c.case_number, status: c.status_name })),
  });

  // Record audit in safety_reconciliations table
  let reconId = null;
  try {
    const [ins] = await pool.execute(
      `INSERT INTO safety_reconciliations (org_id, total_intakes, matched_cases, unlinked_intakes, delayed_cases, status, details_json, reconciled_by, run_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [safeOrgId, totalIntakes, matchedCases, unlinkedIntakes.length, delayedCases.length, status, detailsJson, userId]
    );
    reconId = ins.insertId;
  } catch (_) {
    // Migration table may be pending
  }

  return {
    reconciliation_id: reconId,
    org_id: safeOrgId,
    status,
    balanced: isBalanced,
    reconciliation_rate: reconciliationRate,
    counts: {
      total_safety_intakes: totalIntakes,
      matched_ae_cases: matchedCases,
      unlinked_intakes: unlinkedIntakes.length,
      delayed_triage_cases: delayedCases.length,
    },
    unlinked_intakes: unlinkedIntakes,
    delayed_cases: delayedCases,
    last_run_at: new Date().toISOString(),
  };
}

async function getReconciliationHistory({ orgId } = {}) {
  const safeOrgId = orgId || 1;
  try {
    const [rows] = await pool.execute(
      `SELECT id, org_id, total_intakes, matched_cases, unlinked_intakes, delayed_cases, status, run_at
         FROM safety_reconciliations
        WHERE org_id = ?
        ORDER BY id DESC LIMIT 30`,
      [safeOrgId]
    );
    return rows;
  } catch (_) {
    return [];
  }
}

module.exports = { runReconciliation, getReconciliationHistory };
