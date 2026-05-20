'use strict';

const PRIMARY_PLATFORM_ADMIN_MODULE = 'platform_admin_console';
const PLATFORM_ADMIN_MODULE_KEYS = [PRIMARY_PLATFORM_ADMIN_MODULE];

function normalizeRole(subject) {
  if (typeof subject === 'string') return String(subject || '').trim().toLowerCase();
  return String(subject?.role || '').trim().toLowerCase();
}

function normalizeModules(subject) {
  const raw = Array.isArray(subject)
    ? subject
    : Array.isArray(subject?.modules)
      ? subject.modules
      : [];
  return raw.map((moduleKey) => String(moduleKey || '').trim()).filter(Boolean);
}

function hasPlatformAdminModule(subject) {
  const modules = normalizeModules(subject);
  return PLATFORM_ADMIN_MODULE_KEYS.some((moduleKey) => modules.includes(moduleKey));
}

function isPlatformAdmin(subject) {
  if (subject?.platformAdmin === true) return true;
  return normalizeRole(subject) === 'platform_admin' || hasPlatformAdminModule(subject);
}

function isTenantAdmin(subject) {
  return normalizeRole(subject) === 'admin' && !isPlatformAdmin(subject);
}

function isAdminUser(subject) {
  return isPlatformAdmin(subject) || normalizeRole(subject) === 'admin';
}

function hasGlobalAdminScope(subject) {
  return isPlatformAdmin(subject);
}

function getDisplayRole(subject) {
  return isPlatformAdmin(subject) ? 'admin' : normalizeRole(subject);
}

module.exports = {
  PRIMARY_PLATFORM_ADMIN_MODULE,
  PLATFORM_ADMIN_MODULE_KEYS,
  normalizeRole,
  normalizeModules,
  hasPlatformAdminModule,
  isPlatformAdmin,
  isTenantAdmin,
  isAdminUser,
  hasGlobalAdminScope,
  getDisplayRole,
};
