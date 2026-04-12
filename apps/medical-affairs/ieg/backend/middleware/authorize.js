function requireRoles(roles) {
  const allowed = new Set(roles)
  return (req, res, next) => {
    const role = req.auth?.role
    if (!role || !allowed.has(role)) {
      return res.status(403).json({ error: 'Role not permitted' })
    }
    return next()
  }
}

function requireModuleAccess(moduleKey) {
  return (req, res, next) => {
    const modules = req.auth?.modules || []
    if (!modules.includes(moduleKey) && !req.auth?.isSuperadmin) {
      return res.status(403).json({ error: `Module access denied for ${moduleKey}` })
    }
    return next()
  }
}

module.exports = {
  requireRoles,
  requireModuleAccess
}
