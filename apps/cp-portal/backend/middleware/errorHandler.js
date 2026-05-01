function notFoundHandler(_req, res) {
  res.status(404).json({ error: 'Route not found.' })
}

function globalErrorHandler(error, req, res, _next) {
  const status = error.statusCode || error.status || 500
  const payload = {
    error: status >= 500 ? 'Server error.' : error.message,
    request_id: req.requestId || null
  }
  if (process.env.NODE_ENV !== 'production' && status >= 500) {
    payload.detail = error.message
  }
  res.status(status).json(payload)
}

module.exports = { notFoundHandler, globalErrorHandler }
