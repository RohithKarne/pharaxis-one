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
    expect(normalizeRole(' Platform_Admin ')).toBe('platform_admin');
    expect(normalizeRole({ role: 'ADMIN' })).toBe('admin');
    expect(normalizeRole({})).toBe('');
  });

  test('preserves current platform-admin compatibility semantics', () => {
    expect(isPlatformAdmin({ role: 'platform_admin' })).toBe(true);
    expect(isPlatformAdmin({ role: 'admin' })).toBe(false);
    expect(hasGlobalAdminScope({ role: 'platform_admin' })).toBe(true);
    expect(hasGlobalAdminScope({ role: 'admin' })).toBe(false);
  });

  test('treats admin and platform admin as admin users for UI/admin gates', () => {
    expect(isTenantAdmin({ role: 'admin' })).toBe(true);
    expect(isTenantAdmin({ role: 'platform_admin' })).toBe(false);
    expect(isAdminUser({ role: 'admin' })).toBe(true);
    expect(isAdminUser({ role: 'platform_admin' })).toBe(true);
    expect(isAdminUser({ role: 'agent' })).toBe(false);
  });
});
