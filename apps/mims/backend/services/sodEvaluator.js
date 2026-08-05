'use strict';

/**
 * sodEvaluator.js — segregation-of-duties evaluation over a COMBINED privilege set.
 *
 * PAUD-4 item 1 (approved by Rohith 2026-08-03). The existing check in
 * routes/admin/accessConfigurations.js evaluated one group's privileges at a
 * time, and validateAccessConfiguration() looped group by group. Neither noticed
 * a user who held one side of a conflict through group A and the other through
 * group B — which is the ordinary way a real person accumulates access.
 *
 * Pure functions, no database. The callers supply the privileges; this decides
 * whether they conflict.
 */

function normalizeSeverity(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * findSodConflicts — every active rule where BOTH sides appear in `privilegeKeys`.
 *
 * Order-independent: a rule matches whichever way round its two privileges are
 * stored. Duplicate privileges (the same key granted by two groups) collapse.
 */
function findSodConflicts(privilegeKeys = [], sodRules = []) {
  const held = new Set((privilegeKeys || []).filter(Boolean));
  if (!held.size) return [];

  return (sodRules || [])
    .filter((rule) => rule && rule.is_active)
    .filter((rule) => held.has(rule.first_privilege) && held.has(rule.conflicting_privilege))
    .map((rule) => ({
      rule_key: rule.rule_key,
      first_privilege: rule.first_privilege,
      conflicting_privilege: rule.conflicting_privilege,
      severity: rule.severity || 'warning',
    }));
}

/**
 * hasBlockingSodConflict — only 'block' severity stops an action. 'warning'
 * severity is reported and allowed through, which is the behaviour the
 * single-group check already had; this keeps it consistent.
 */
function hasBlockingSodConflict(conflicts = []) {
  return (conflicts || []).some((c) => normalizeSeverity(c.severity) === 'block');
}

/** Human-readable message for an API error or a validation issue. */
function describeSodConflict(conflict) {
  return `Segregation of Duties conflict: "${conflict.first_privilege}" and "${conflict.conflicting_privilege}" cannot be held by the same person.`;
}

module.exports = { findSodConflicts, hasBlockingSodConflict, describeSodConflict };
