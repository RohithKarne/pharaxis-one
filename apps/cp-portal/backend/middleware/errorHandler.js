const log = require('../utils/logger')

function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Route not found.' })
}

function globalErrorHandler(error, req, res, _next) {
  const status = error.statusCode || error.status || 500
  // CP-19: structured server-error log + error tracking (Sentry when configured).
  if (status >= 500) {
    log.error('request.error', { err: error, method: req.method, path: req.path, request_id: req.requestId || null })
  } else {
    // CP-88: a client error is not an incident — warn, so it neither pages anyone
    // nor reaches Sentry. But it is not nothing either. Everything that arrives
    // here with a 4xx was actively refused: a disallowed CORS origin, or
    // inputSecurity blocking an injection or prototype-pollution attempt. Logging
    // only 5xx meant those were rejected and recorded nowhere, which is the same
    // silent-failure shape as CP-19 and #543, one status code lower. SOP §37.2.
    // Name and message only, deliberately: an outsider can trigger this path at
    // will with one header, and a stack per rejection is bulk without signal —
    // the message already names the cause, and status/method/path localise it.
    log.warn('request.rejected', {
      err: { name: error.name, message: error.message },
      status, method: req.method, path: req.path, request_id: req.requestId || null
    })
  }
  const payload = {
    error: status >= 500 ? 'Server error.' : error.message,
    request_id: req.requestId || null
  }
  // SEC: only expose raw exception detail in genuine local development. Using
  // `!== 'production'` would leak internals if NODE_ENV is unset in a real deploy.
  if (process.env.NODE_ENV === 'development' && status >= 500) {
    payload.detail = error.message
  }
  res.status(status).json(payload)
}

module.exports = { notFoundHandler, globalErrorHandler }
