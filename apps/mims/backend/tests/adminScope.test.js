'use strict';

const {
  normalizeRole,
  isPlatformAdmin,
  isTenantAdmin,
  isAdminUser,
  hasGlobalAdminScope,
} = require('../utils/adminScope');

describe('adminScope helpers', () => {
  test('normalizes roles from strings and user objects', () => {
    expect(normalizeRole(' SuperAdmin ')).toBe('superadmin');
    expect(normalizeRole({ role: 'ADMIN' })).toBe('admin');
    expect(normalizeRole({})).toBe('');
  });

  test('preserves current platform-admin compatibility semantics', () => {
    expect(isPlatformAdmin({ role: 'superadmin' })).toBe(true);
    expect(isPlatformAdmin({ role: 'admin' })).toBe(false);
    expect(hasGlobalAdminScope({ role: 'superadmin' })).toBe(true);
    expect(hasGlobalAdminScope({ role: 'admin' })).toBe(false);
  });

  test('treats admin and superadmin as admin users for UI/admin gates', () => {
    expect(isTenantAdmin({ role: 'admin' })).toBe(true);
    expect(isTenantAdmin({ role: 'superadmin' })).toBe(false);
    expect(isAdminUser({ role: 'admin' })).toBe(true);
    expect(isAdminUser({ role: 'superadmin' })).toBe(true);
    expect(isAdminUser({ role: 'agent' })).toBe(false);
  });
});
