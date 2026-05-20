const PRIMARY_PLATFORM_ADMIN_MODULE = 'platform_admin_console'
const LEGACY_PLATFORM_ADMIN_MODULE = 'superadmin_console'
const PLATFORM_ADMIN_MODULE_KEYS = [PRIMARY_PLATFORM_ADMIN_MODULE, LEGACY_PLATFORM_ADMIN_MODULE]

function readRole(subject) {
  if (typeof subject === 'string') return String(subject || '').trim().toLowerCase()
  return String(subject?.role || '').trim().toLowerCase()
}

function readModules(subject) {
  const raw = Array.isArray(subject)
    ? subject
    : Array.isArray(subject?.modules)
      ? subject.modules
      : []
  return raw.map((moduleKey) => String(moduleKey || '').trim()).filter(Boolean)
}

export function hasPlatformAdminModule(subject) {
  const modules = readModules(subject)
  return PLATFORM_ADMIN_MODULE_KEYS.some((moduleKey) => modules.includes(moduleKey))
}

export function isPlatformAdmin(subject) {
  if (subject?.platformAdmin === true) return true
  return readRole(subject) === 'superadmin' || hasPlatformAdminModule(subject)
}

export function isTenantAdmin(subject) {
  return readRole(subject) === 'admin' && !isPlatformAdmin(subject)
}

export function isAdminUser(subject) {
  return isPlatformAdmin(subject) || readRole(subject) === 'admin'
}

export function hasGlobalAdminScope(subject) {
  return isPlatformAdmin(subject)
}

export function formatAdminRoleLabel(subject) {
  if (isPlatformAdmin(subject)) return 'Platform Admin'
  const role = readRole(subject)
  if (role === 'admin') return 'Administrator'
  if (role === 'agent') return 'MI Agent'
  if (role === 'reviewer') return 'Reviewer'
  if (role === 'content_manager') return 'Content Manager'
  return role || 'User'
}

export function getDisplayRole(subject) {
  return isPlatformAdmin(subject) ? 'admin' : readRole(subject)
}
