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

// The same two things isPlatformAdmin() reads at sign-in, in SQL (users alias `u`):
// the platform_admin role, or the platform-admin console permission.
const PLATFORM_ADMIN_CONSOLE_SQL =
  `u.id IN (SELECT ump.user_id FROM user_module_permissions ump WHERE ump.module = '${PRIMARY_PLATFORM_ADMIN_MODULE}' AND ump.can_access = 1)`;
const PLATFORM_ADMIN_SQL = `(u.role = 'platform_admin' OR ${PLATFORM_ADMIN_CONSOLE_SQL})`;

const LAST_PLATFORM_ADMIN_ERROR =
  'This is the last active platform admin. Make another user a platform admin before demoting or deactivating this one.';

// Break-glass (2026-09-23): true when a change would leave no active platform admin,
// after which the only way back in is a direct database write. `deactivate` lists
// users being deactivated or disabled, `dropRole` users whose role leaves
// platform_admin, `dropConsole` users losing the console permission. `db` is the
// pool or a connection.
async function leavesNoActivePlatformAdmin(db, { deactivate = [], dropRole = [], dropConsole = [] }) {
  // No user has id 0; it keeps `IN (?)` valid when a list is empty.
  const ids = (list) => {
    const clean = [...new Set(list.map(Number).filter(Number.isInteger))];
    return clean.length ? clean : [0];
  };
  const [[counts]] = await db.query(
    `SELECT COALESCE(SUM(${PLATFORM_ADMIN_SQL}), 0) AS active_now,
            COALESCE(SUM(u.id NOT IN (?) AND (
              (u.role = 'platform_admin' AND u.id NOT IN (?)) OR (${PLATFORM_ADMIN_CONSOLE_SQL} AND u.id NOT IN (?))
            )), 0) AS active_after
       FROM users u
      WHERE u.is_active = 1 AND u.is_disabled = 0`,
    [ids(deactivate), ids(dropRole), ids(dropConsole)]
  );
  return Number(counts.active_now) > 0 && Number(counts.active_after) === 0;
}

module.exports = {
  PRIMARY_PLATFORM_ADMIN_MODULE,
  PLATFORM_ADMIN_MODULE_KEYS,
  PLATFORM_ADMIN_CONSOLE_SQL,
  PLATFORM_ADMIN_SQL,
  LAST_PLATFORM_ADMIN_ERROR,
  leavesNoActivePlatformAdmin,
  normalizeRole,
  normalizeModules,
  hasPlatformAdminModule,
  isPlatformAdmin,
  isTenantAdmin,
  isAdminUser,
  hasGlobalAdminScope,
  getDisplayRole,
};
