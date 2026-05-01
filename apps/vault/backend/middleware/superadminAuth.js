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

function authenticateSuperadmin(req, res, next) {
  const token = readCookie(req, 'vault_superadmin_token') || readBearer(req)
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const decoded = jwt.verify(token, process.env.SUPERADMIN_JWT_SECRET)
    req.superadmin = { superadminId: decoded.superadminId }
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

module.exports = { authenticateSuperadmin }
