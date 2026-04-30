const crypto = require('crypto')
const { logInfo, logWarn } = require('../services/logger')

function attachRequestContext(req, res, next) {
  const incomingRequestId = req.headers['x-request-id']
  const requestId = incomingRequestId && String(incomingRequestId).trim()
    ? String(incomingRequestId).trim()
    : crypto.randomUUID()
  const startNs = process.hrtime.bigint()

  req.requestId = requestId
  res.setHeader('X-Request-Id', requestId)

  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startNs) / 1_000_000
    const payload = {
      request_id: requestId,
      method: req.method,
      path: req.originalUrl,
      status_code: res.statusCode,
      duration_ms: Number(elapsedMs.toFixed(2)),
      ip: req.ip
    }
    if (res.statusCode >= 500) {
      logWarn('http_request_failed', payload)
      return
    }
    logInfo('http_request', payload)
  })

  next()
}

module.exports = {
  attachRequestContext
}
