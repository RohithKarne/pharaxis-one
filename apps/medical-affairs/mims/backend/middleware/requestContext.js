const pinoHttp = require('pino-http');
const { randomUUID } = require('crypto');
const { logger } = require('../services/logger');

function getRequestId(req) {
  const candidate = req.headers['x-request-id'];
  if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  return randomUUID();
}

const requestContext = pinoHttp({
  logger,
  genReqId: getRequestId,
  customProps(req, res) {
    return {
      request_id: req.id,
      org_id: req.user?.orgId ?? null,
      user_id: req.user?.userId ?? null,
      status_code: res.statusCode,
    };
  },
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage(req, res) {
    return `${req.method} ${req.originalUrl} completed`;
  },
  customErrorMessage(req, _res) {
    return `${req.method} ${req.originalUrl} failed`;
  },
});

function attachRequestIdHeader(req, res, next) {
  res.setHeader('X-Request-Id', req.id);
  next();
}

module.exports = { requestContext, attachRequestIdHeader };
