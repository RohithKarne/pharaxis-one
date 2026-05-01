import crypto from 'node:crypto';

function createRequestId() {
  return crypto.randomUUID ? crypto.randomUUID() : `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function requestContext(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const requestId = incoming && String(incoming).trim() ? String(incoming).trim().slice(0, 100) : createRequestId();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
