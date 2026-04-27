const { MODULE_PERMISSIONS, ROLES } = require('../constants')

function requireModule(moduleName) {
  return (req, res, next) => {
    const allowedRoles = MODULE_PERMISSIONS[moduleName] || []
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access denied for module: ${moduleName}` })
    }
    next()
  }
}

function canAccessOrg(reqUser, targetOrgId) {
  if (!targetOrgId) return false
  if (reqUser.role === ROLES.SUPER_ADMIN) return true
  return Number(reqUser.orgId) === Number(targetOrgId)
}

function assertOrgAccess(req, res, targetOrgId) {
  if (!canAccessOrg(req.user, targetOrgId)) {
    res.status(403).json({ error: 'Cross-organisation access is not allowed' })
    return false
  }
  return true
}

function canAccessClient(reqUser, targetClientId) {
  if (!targetClientId) return true
  if (reqUser.role === ROLES.SUPER_ADMIN || reqUser.role === ROLES.CRO_ADMIN) return true
  if (!reqUser.clientId) return false
  return Number(reqUser.clientId) === Number(targetClientId)
}

module.exports = {
  requireModule,
  canAccessOrg,
  assertOrgAccess,
  canAccessClient
}
