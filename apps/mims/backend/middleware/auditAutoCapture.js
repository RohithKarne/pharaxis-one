'use strict';

const { logAudit } = require('../utils/auditLog');

function auditAutoCapture(entityResolver) {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function patchedJson(body) {
      const result = originalJson(body);
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && res.statusCode < 400) {
        const entity = typeof entityResolver === 'function' ? entityResolver(req, body) : (entityResolver || req.path.split('/')[1] || 'resource');
        // Shared writer: a failed insert is logged, never silently dropped, and
        // never delays or changes the response (not awaited; logAudit does not throw).
        logAudit(req.user?.userId || null, req.user?.email || req.apiClient?.name || 'system', req.method, entity, req.params.id || body?.id || null, { path: req.originalUrl, request_id: req.id || req.headers['x-request-id'] || null });
      }
      return result;
    };
    next();
  };
}

module.exports = { auditAutoCapture };
