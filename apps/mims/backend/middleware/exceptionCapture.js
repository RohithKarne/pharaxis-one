const pool = require('../database/db');
const { logger } = require('../services/logger');

function createExceptionId() {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `EX-${Date.now()}-${rand}`;
}

// Database wording must not reach the screen (M-48: "Data too long for column
// 'mi_category'" shown to a user). Routes pass err.message straight through in
// hundreds of places, so it is replaced here, once. The original text is still
// written to the exception log below, under the same exception id.
const DB_ERROR = /^(Data too long for column|Data truncated for column|Out of range value for column|Incorrect \w+ value|Duplicate entry|Unknown column|Table '[^']*' doesn't exist|Cannot (add or update a child|delete or update a parent) row|Column '[^']*' cannot be null|Field '[^']*' doesn't have a default value|You have an error in your SQL syntax|Incorrect arguments to mysqld_stmt_execute|Bind parameters must not contain undefined|ER_[A-Z_]+|connect ECONNREFUSED)/;

function friendlyDbError(message, exceptionId) {
  const column = /column '([^']+)'/.exec(message)?.[1];
  const label = column ? column.replace(/_/g, ' ') : null;
  if (/^Data too long for column/.test(message)) {
    return { status: 400, error: `The value for "${label}" is too long.` };
  }
  if (/^(Data truncated for column|Out of range value for column|Incorrect \w+ value)/.test(message)) {
    return { status: 400, error: label ? `The value for "${label}" is not valid.` : 'One of the values is not valid.' };
  }
  if (/^Duplicate entry/.test(message)) {
    return { status: 409, error: 'This already exists.' };
  }
  return { status: null, error: `Something went wrong on the server. Reference: ${exceptionId}.` };
}

function shouldCapture(req) {
  if (!req.originalUrl || !req.originalUrl.startsWith('/api')) return false;
  if (req.originalUrl.includes('/api/admin/service-logs')) return false;
  if (req.originalUrl.includes('/api/admin/system-activity')) return false;
  // MIPM-215: the browser's own error reports (their rate-limit refusals were
  // most of the log) and the routine "am I signed in?" check are not exceptions.
  if (req.originalUrl.startsWith('/api/telemetry/')) return false;
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
        const next = { ...body, exception_id: body.exception_id || sentExceptionId };
        for (const key of ['error', 'message', 'details']) {
          if (typeof next[key] !== 'string' || !DB_ERROR.test(next[key])) continue;
          if (key !== 'error') sentErrorMessage = `${sentErrorMessage} | ${next[key]}`.slice(0, 500);
          const friendly = friendlyDbError(next[key], sentExceptionId);
          if (friendly.status && res.statusCode >= 500) res.status(friendly.status);
          next[key] = friendly.error;
        }
        return originalJson(next);
      }
    }
    return originalJson(body);
  };

  res.on('finish', () => {
    if (res.statusCode < 400) return;
    if (res.statusCode === 401 && req.originalUrl.startsWith('/api/auth/me')) return;
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
