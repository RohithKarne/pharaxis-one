const crypto = require('crypto')

function createRequestId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function attachRequestContext(req, res, next) {
  const incoming = req.headers['x-request-id']
  const requestId = incoming && String(incoming).trim() ? String(incoming).trim().slice(0, 100) : createRequestId()
  req.requestId = requestId
  res.setHeader('X-Request-Id', requestId)
  next()
}

module.exports = { attachRequestContext }
