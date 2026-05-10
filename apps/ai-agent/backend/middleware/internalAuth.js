const INTERNAL_TOKEN = String(process.env.AI_AGENT_INTERNAL_TOKEN || '').trim()
const jwt = require('jsonwebtoken')
const INTERNAL_JWT_SECRET = String(process.env.AI_AGENT_INTERNAL_JWT_SECRET || '').trim()

if (!INTERNAL_TOKEN) {
  if (!INTERNAL_JWT_SECRET) {
    throw new Error('AI_AGENT_INTERNAL_TOKEN is required when AI_AGENT_INTERNAL_JWT_SECRET is not configured.')
  }
}

function internalAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Internal service authentication required' })
  }
  const token = header.split(' ')[1]
  if (INTERNAL_JWT_SECRET) {
    try {
      const decoded = jwt.verify(token, INTERNAL_JWT_SECRET)
      const orgId = Number(decoded.orgId || decoded.org_id)
      if (!Number.isInteger(orgId) || orgId <= 0) {
        return res.status(400).json({ error: 'Valid orgId claim required in internal JWT' })
      }
      req.user = { orgId, role: 'admin', auth: 'internal-jwt' }
      return next()
    } catch {
      return res.status(401).json({ error: 'Invalid internal JWT token' })
    }
  }

  if (token !== INTERNAL_TOKEN) {
    return res.status(401).json({ error: 'Invalid internal service token' })
  }
  const orgId = req.headers['x-org-id']
  if (!orgId) {
    return res.status(400).json({ error: 'X-Org-Id header required' })
  }
  req.user = { orgId: Number(orgId), role: 'admin', auth: 'internal-shared-token' }
  next()
}

module.exports = { internalAuth }
