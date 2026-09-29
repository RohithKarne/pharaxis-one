const { logger } = require('../services/logger');

function notFoundHandler(req, res, next) {
  // Full path: mounted as app.use('/api', …) req.path is relative ('/x'), so the
  // old check never matched there and every unknown /api/* fell through to the
  // SPA fallback — 200 + index.html instead of a 404 (T11 / M-64).
  const fullPath = String(req.originalUrl || '').split('?')[0];
  if (!fullPath.startsWith('/api') && !fullPath.startsWith('/oauth')) return next();
  return res.status(404).json({
    error: 'API route not found',
    request_id: req.id || null,
  });
}

function errorHandler(err, req, res, _next) {
  // An upload multer refuses (too large, too many files, unexpected field) arrives
  // here with no status code and used to go out as a 500. The request is at fault,
  // not the server: 413 for a file over the limit, 400 for the rest.
  const multerStatus = err?.name === 'MulterError' ? (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400) : null;
  const status = multerStatus || (Number.isInteger(err?.statusCode) ? err.statusCode : 500);
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
