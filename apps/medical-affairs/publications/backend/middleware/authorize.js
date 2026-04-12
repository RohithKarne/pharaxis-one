function authorizeRoles(roles = []) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(Object.assign(new Error('Authentication required'), { statusCode: 401 }))
    }

    if (req.user.isSuperadmin) {
      return next()
    }

    if (!roles.includes(req.user.role)) {
      return next(Object.assign(new Error('Forbidden'), { statusCode: 403 }))
    }

    return next()
  }
}

module.exports = {
  authorizeRoles
}
