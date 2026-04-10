export function resolveAuthContext(req, _res, next) {
  if (!req.auth) {
    const error = new Error('Authentication context missing');
    error.statusCode = 401;
    return next(error);
  }

  req.authContext = {
    userId: req.auth.userId,
    orgId: req.auth.orgId,
    roles: Array.isArray(req.auth.roles) ? req.auth.roles : [],
    isSuperadmin: Array.isArray(req.auth.roles) && req.auth.roles.includes('superadmin'),
    provider: req.auth.provider,
    email: req.auth.email || null
  };

  return next();
}
