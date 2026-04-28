const pool = require('../database/db');
const { logger } = require('../services/logger');

function createExceptionId() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `EX-${Date.now()}-${rand}`;
}

function shouldCapture(req) {
  if (!req.originalUrl || !req.originalUrl.startsWith('/api')) return false;
  if (req.originalUrl.includes('/api/admin/service-logs')) return false;
  if (req.originalUrl.includes('/api/admin/system-activity')) return false;
  return true;
}

function captureApiExceptions(req, res, next) {
  if (!shouldCapture(req)) return next();

  const start = Date.now();
  const originalJson = res.json.bind(res);
  let sentExceptionId = null;
  let sentErrorMessage = null;

  res.json = function patchedJson(body) {
    if (res.statusCode >= 400) {
      if (!sentExceptionId) sentExceptionId = createExceptionId();
      res.setHeader('X-Exception-Id', sentExceptionId);
      sentErrorMessage = String(body?.error || body?.message || '').slice(0, 500) || 'API request failed';
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        return originalJson({
          ...body,
          exception_id: body.exception_id || sentExceptionId,
        });
      }
    }
    return originalJson(body);
  };

  res.on('finish', () => {
    if (res.statusCode < 400) return;
    const exceptionId = sentExceptionId || createExceptionId();
    const levelStatus = res.statusCode >= 500 ? 'failed' : 'warning';
    const reqId = req.id || null;
    const pathOnly = (req.originalUrl || '').split('?')[0];
    const durationMs = Date.now() - start;

    const details = {
      exception_id: exceptionId,
      request_id: reqId,
      method: req.method,
      path: pathOnly,
      status_code: res.statusCode,
      duration_ms: durationMs,
      org_id: req.user?.orgId ?? null,
      user_id: req.user?.userId ?? null,
      error: sentErrorMessage || null,
    };

    pool.execute(
      `INSERT INTO service_logs (source, service_type, description, details, status)
       VALUES (?, ?, ?, ?, ?)`,
      [
        'API Exceptions',
        'HTTP',
        `${req.method} ${pathOnly} failed (${res.statusCode})`,
        JSON.stringify(details),
        levelStatus,
      ]
    ).catch((err) => {
      logger.warn({ err }, 'Failed to persist exception log');
    });
  });

  next();
}

module.exports = { captureApiExceptions };
