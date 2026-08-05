'use strict';

/**
 * PAUD-4 item 2 — bulk user provisioning.
 *
 * The Super User question was "can I set up forty new people at once, or is it
 * one at a time?" MIMS had only a single-user POST. These tests cover the batch
 * validation that runs BEFORE anything is written.
 *
 * The design decision under test: a batch is validated in full and applied
 * all-or-nothing. User provisioning is access control, and a half-applied access
 * change is the state you least want to be uncertain about.
 */

const {
  MAX_BULK_USERS,
  validateBulkUserRows,
} = require('../services/bulkUserProvisioningService');

const ok = (over = {}) => ({
  user_id: 'jdoe', name: 'Jane Doe', email: 'jane@example.com',
  security_group_id: 3, tenant_ids: [1], ...over,
});

describe('validateBulkUserRows — shape', () => {
  test('accepts a clean batch', () => {
    const r = validateBulkUserRows([ok(), ok({ user_id: 'bsmith', email: 'b@example.com' })]);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  test('rejects an empty batch rather than silently doing nothing', () => {
    const r = validateBulkUserRows([]);
    expect(r.valid).toBe(false);
    expect(r.errors[0].reason).toMatch(/no users/i);
  });

  test('rejects a batch larger than the cap', () => {
    const rows = Array.from({ length: MAX_BULK_USERS + 1 }, (_, i) =>
      ok({ user_id: `u${i}`, email: `u${i}@example.com` }));
    const r = validateBulkUserRows(rows);
    expect(r.valid).toBe(false);
    expect(r.errors[0].reason).toMatch(/at most/i);
  });
});

describe('validateBulkUserRows — per-row required fields', () => {
  test.each([
    ['user_id',           { user_id: '' }],
    ['name',              { name: '  ' }],
    ['email',             { email: '' }],
    ['security_group_id', { security_group_id: null }],
  ])('reports a missing %s against its row number', (field, override) => {
    const r = validateBulkUserRows([ok(), ok(override)]);
    expect(r.valid).toBe(false);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].row).toBe(2);
    expect(r.errors[0].reason).toContain(field);
  });

  test('requires at least one tenant', () => {
    const r = validateBulkUserRows([ok({ tenant_ids: [] })]);
    expect(r.valid).toBe(false);
    expect(r.errors[0].reason).toMatch(/tenant/i);
  });

  test('collects every bad row, not just the first', () => {
    const r = validateBulkUserRows([ok({ user_id: '' }), ok({ email: '' }), ok({ name: '' })]);
    expect(r.errors).toHaveLength(3);
    expect(r.errors.map((e) => e.row)).toEqual([1, 2, 3]);
  });
});

describe('validateBulkUserRows — duplicates inside the batch', () => {
  test('catches a repeated user_id before anything is written', () => {
    const r = validateBulkUserRows([ok(), ok({ email: 'other@example.com' })]);
    expect(r.valid).toBe(false);
    expect(r.errors[0].reason).toMatch(/duplicate user_id/i);
    expect(r.errors[0].row).toBe(2);
  });

  test('catches a repeated email regardless of case or padding', () => {
    const r = validateBulkUserRows([ok(), ok({ user_id: 'other', email: '  JANE@EXAMPLE.COM ' })]);
    expect(r.valid).toBe(false);
    expect(r.errors[0].reason).toMatch(/duplicate email/i);
  });
});

describe('normalizeBulkUserRow', () => {
  const { normalizeBulkUserRow } = require('../services/bulkUserProvisioningService');

  test('trims and lowercases the email, trims the rest', () => {
    const n = normalizeBulkUserRow(ok({ user_id: '  jdoe ', name: ' Jane ', email: ' JANE@Example.COM ' }));
    expect(n.user_id).toBe('jdoe');
    expect(n.name).toBe('Jane');
    expect(n.email).toBe('jane@example.com');
  });

  test('coerces the optional flags to 0/1 rather than passing them through raw', () => {
    const n = normalizeBulkUserRow(ok({ is_primary_ref: true, case_admin: 'yes', access_admin_site: undefined }));
    expect(n.is_primary_ref).toBe(1);
    expect(n.case_admin).toBe(1);
    expect(n.access_admin_site).toBe(0);
  });
});
