const jwt = require('jsonwebtoken')

const isProductionLike = !['development', 'test'].includes(process.env.NODE_ENV || 'development')
const DEV_SUPERADMIN_TOKEN = 'dev-ai-agent-superadmin-token-change-in-prod'

function readBearerOrCookie(req, cookieName) {
  const cookieHeader = req.headers.cookie || ''
  const cookie = cookieHeader
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${cookieName}=`))
  if (cookie) return decodeURIComponent(cookie.slice(cookieName.length + 1))

  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  return token && token !== 'null' && token !== 'undefined' ? token : null
}

function authenticate(req, res, next) {
  const token = readBearerOrCookie(req, 'ai_agent_token')
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    req.user = { userId: decoded.userId, orgId: decoded.orgId, role: decoded.role }
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

function authenticateSuperadmin(req, res, next) {
  const token = readBearerOrCookie(req, 'ai_agent_superadmin_token')
  if (!token) return res.status(401).json({ error: 'Superadmin authentication required' })

  const configuredToken = process.env.AI_AGENT_SUPERADMIN_TOKEN || (!isProductionLike ? DEV_SUPERADMIN_TOKEN : '')
  if (configuredToken && token === configuredToken) {
    req.superadmin = { auth: 'static-token' }
    return next()
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'superadmin') {
      return res.status(403).json({ error: 'Superadmin access required' })
    }
    req.superadmin = { userId: decoded.userId, role: decoded.role }
    return next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired superadmin token' })
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' })
  }
  next()
}

module.exports = { authenticate, authenticateSuperadmin, requireAdmin }
