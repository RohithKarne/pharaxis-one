const { logError } = require('../services/logger')

function notFoundHandler(req, res) {
  return res.status(404).json({
    error: 'Endpoint not found'
  })
}

function globalErrorHandler(error, req, res, _next) {
  const requestId = req.requestId || null
  logError('unhandled_request_error', {
    request_id: requestId,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    error
  })

  if (res.headersSent) return

  res.status(500).json({
    error: 'Server error',
    request_id: requestId
  })
}

module.exports = {
  notFoundHandler,
  globalErrorHandler
}
