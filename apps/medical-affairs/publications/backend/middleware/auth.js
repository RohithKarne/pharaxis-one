const jwt = require('jsonwebtoken')

function requireAuth(req, _res, next) {
  const rawHeader = req.headers.authorization || ''
  const tokenFromHeader = rawHeader.startsWith('Bearer ') ? rawHeader.slice(7) : null
  const tokenFromQuery = typeof req.query?.token === 'string' ? req.query.token.trim() : null
  const token = tokenFromHeader || tokenFromQuery || null

  if (!token) {
    return next(Object.assign(new Error('Authorization token is required'), { statusCode: 401 }))
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'publications_local_dev_secret_change_me')
    req.user = {
      id: Number(payload.sub),
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId ? Number(payload.tenantId) : null,
      isSuperadmin: Boolean(payload.isSuperadmin)
    }
    return next()
  } catch (_error) {
    return next(Object.assign(new Error('Invalid or expired token'), { statusCode: 401 }))
  }
}

module.exports = {
  requireAuth
}
