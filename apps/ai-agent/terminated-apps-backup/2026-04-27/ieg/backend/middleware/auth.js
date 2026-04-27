const jwt = require('jsonwebtoken')
const JWT_SECRET = process.env.JWT_SECRET || 'ieg_dev_secret_change_me'

function parseToken(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) return null
  return header.slice(7)
}

function decodeToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

function requireAuth(req, res, next) {
  try {
    const token = parseToken(req)
    if (!token) {
      return res.status(401).json({ error: 'Missing bearer token' })
    }

    const payload = decodeToken(token)
    req.auth = payload
    return next()
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

function requireInternal(req, res, next) {
  if (!req.auth || req.auth.type !== 'internal') {
    return res.status(403).json({ error: 'Internal user access required' })
  }
  return next()
}

function requireExternal(req, res, next) {
  if (!req.auth || req.auth.type !== 'external') {
    return res.status(403).json({ error: 'External user access required' })
  }
  return next()
}

module.exports = {
  requireAuth,
  requireInternal,
  requireExternal
}
