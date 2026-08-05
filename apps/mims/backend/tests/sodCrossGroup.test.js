'use strict';

/**
 * PAUD-4 item 1 — segregation of duties across groups.
 *
 * The original check looked at ONE group's privilege set at a time. A person in
 * a "draft" group and an "approve" group held both sides of a block-severity
 * conflict and nothing objected — so the honest answer to "can one person write
 * the rules and approve the work?" was yes.
 *
 * These tests cover the detection logic on a user's COMBINED privileges.
 */

const {
  findSodConflicts,
  hasBlockingSodConflict,
} = require('../services/sodEvaluator');

const RULES = [
  { first_privilege: 'mi.response.draft',  conflicting_privilege: 'mi.response.approve', severity: 'block',   is_active: 1, rule_key: 'draft_vs_approve' },
  { first_privilege: 'admin.access.manage', conflicting_privilege: 'case.close',         severity: 'warning', is_active: 1, rule_key: 'admin_vs_close' },
  { first_privilege: 'a.retired',           conflicting_privilege: 'b.retired',          severity: 'block',   is_active: 0, rule_key: 'inactive_rule' },
];

describe('findSodConflicts — combined privileges', () => {
  test('THE DEFECT: catches both sides held across two different groups', () => {
    const conflicts = findSodConflicts(
      ['mi.response.draft', 'mi.response.approve'],
      RULES
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].rule_key).toBe('draft_vs_approve');
    expect(conflicts[0].severity).toBe('block');
  });

  test('clean when only one side of the rule is held', () => {
    expect(findSodConflicts(['mi.response.draft'], RULES)).toEqual([]);
    expect(findSodConflicts(['mi.response.approve'], RULES)).toEqual([]);
  });

  test('reports warning-severity conflicts too, without blocking on them', () => {
    const conflicts = findSodConflicts(['admin.access.manage', 'case.close'], RULES);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].severity).toBe('warning');
    expect(hasBlockingSodConflict(conflicts)).toBe(false);
  });

  test('ignores rules that have been deactivated', () => {
    expect(findSodConflicts(['a.retired', 'b.retired'], RULES)).toEqual([]);
  });

  test('detects the conflict regardless of which side is listed first', () => {
    const reversed = [{ first_privilege: 'mi.response.approve', conflicting_privilege: 'mi.response.draft', severity: 'block', is_active: 1, rule_key: 'r' }];
    expect(findSodConflicts(['mi.response.draft', 'mi.response.approve'], reversed)).toHaveLength(1);
  });

  test('deduplicates a privilege granted by more than one group', () => {
    const conflicts = findSodConflicts(
      ['mi.response.draft', 'mi.response.draft', 'mi.response.approve'],
      RULES
    );
    expect(conflicts).toHaveLength(1);
  });

  test('empty or missing input is clean, not a crash', () => {
    expect(findSodConflicts([], RULES)).toEqual([]);
    expect(findSodConflicts(undefined, undefined)).toEqual([]);
  });
});

describe('hasBlockingSodConflict', () => {
  test('true only when a block-severity conflict is present', () => {
    expect(hasBlockingSodConflict(findSodConflicts(['mi.response.draft', 'mi.response.approve'], RULES))).toBe(true);
    expect(hasBlockingSodConflict([])).toBe(false);
  });

  test('severity comparison is case-insensitive', () => {
    const rules = [{ first_privilege: 'x', conflicting_privilege: 'y', severity: 'BLOCK', is_active: 1, rule_key: 'r' }];
    expect(hasBlockingSodConflict(findSodConflicts(['x', 'y'], rules))).toBe(true);
  });
});
