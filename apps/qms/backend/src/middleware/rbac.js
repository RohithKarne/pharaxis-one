export function normalizeRoles(roles) {
  if (!Array.isArray(roles)) return [];
  const normalized = roles
    .map((role) => String(role || '').trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

export function hasAnyRole(userRoles, requiredRoles = []) {
  const required = normalizeRoles(requiredRoles);
  if (required.length === 0) return true;

  const granted = normalizeRoles(userRoles);
  if (granted.includes('superadmin')) return true;

  return required.some((role) => granted.includes(role));
}

export function assertAnyRole(req, requiredRoles = [], message = 'Insufficient permissions for this action') {
  if (hasAnyRole(req?.authContext?.roles, requiredRoles)) return;

  const error = new Error(message);
  error.statusCode = 403;
  throw error;
}
