function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Route not found.' })
}

function globalErrorHandler(error, req, res, _next) {
  const status = error.statusCode || error.status || 500
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
