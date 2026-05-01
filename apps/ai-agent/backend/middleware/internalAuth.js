const isProductionLike = !['development', 'test'].includes(process.env.NODE_ENV || 'development')
const INTERNAL_TOKEN = process.env.AI_AGENT_INTERNAL_TOKEN || (!isProductionLike ? 'dev-internal-token-change-in-prod' : '')

if (!INTERNAL_TOKEN) {
  throw new Error('AI_AGENT_INTERNAL_TOKEN is required outside development/test.')
}

function internalAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Internal service authentication required' })
  }
  const token = header.split(' ')[1]
  if (token !== INTERNAL_TOKEN) {
    return res.status(401).json({ error: 'Invalid internal service token' })
  }
  const orgId = req.headers['x-org-id']
  if (!orgId) {
    return res.status(400).json({ error: 'X-Org-Id header required' })
  }
  req.user = { orgId: Number(orgId), role: 'admin' }
  next()
}

module.exports = { internalAuth }
