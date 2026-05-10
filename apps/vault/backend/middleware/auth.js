const jwt = require('jsonwebtoken')

function readCookie(req, name) {
  const cookieHeader = req.headers.cookie || ''
  const cookie = cookieHeader
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : null
}

function readBearer(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  return token && token !== 'null' && token !== 'undefined' ? token : null
}

function authenticate(req, res, next) {
  const token = readCookie(req, 'vault_token') || readBearer(req)
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (req.org?.id && Number(req.org.id) !== Number(decoded.orgId)) {
      return res.status(403).json({ error: 'Tenant context mismatch' })
    }
    req.user = { userId: decoded.userId, orgId: decoded.orgId, role: decoded.role }
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

module.exports = { authenticate }
