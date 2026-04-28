const { logger } = require('../services/logger');

function notFoundHandler(req, res, next) {
  if (!req.path.startsWith('/api')) return next();
  return res.status(404).json({
    error: 'API route not found',
    request_id: req.id || null,
  });
}

function errorHandler(err, req, res, _next) {
  const status = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
  const safeMessage = status >= 500 ? 'Internal server error' : (err?.message || 'Request failed');

  logger.error({
    err,
    request_id: req.id || null,
    route: req.originalUrl,
    method: req.method,
    user_id: req.user?.userId ?? null,
    org_id: req.user?.orgId ?? null,
  }, 'Unhandled API error');

  if (res.headersSent) return;
  res.status(status).json({
    error: safeMessage,
    request_id: req.id || null,
  });
}

module.exports = { notFoundHandler, errorHandler };
