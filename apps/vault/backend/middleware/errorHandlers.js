const { logError } = require('../services/logger')

function notFoundHandler(req, res) {
  return res.status(404).json({
    error: 'Endpoint not found'
  })
}

function globalErrorHandler(error, req, res, _next) {
  const requestId = req.requestId || null
  const statusCode = Number(error?.statusCode) >= 400 && Number(error?.statusCode) < 600
    ? Number(error.statusCode)
    : 500
  logError('unhandled_request_error', {
    request_id: requestId,
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    error
  })

  if (res.headersSent) return

  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Server error' : (error?.message || 'Request failed'),
    request_id: requestId
  })
}

module.exports = {
  notFoundHandler,
  globalErrorHandler
}
