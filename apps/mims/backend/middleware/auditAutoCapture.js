'use strict';

const pool = require('../database/db');

function auditAutoCapture(entityResolver) {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = function patchedJson(body) {
      const result = originalJson(body);
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && res.statusCode < 400) {
        const entity = typeof entityResolver === 'function' ? entityResolver(req, body) : (entityResolver || req.path.split('/')[1] || 'resource');
        pool.execute(
          `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [req.user?.userId || null, req.user?.email || req.apiClient?.name || 'system', req.method, entity, req.params.id || body?.id || null, JSON.stringify({ path: req.originalUrl, request_id: req.id || req.headers['x-request-id'] || null })]
        ).catch(() => {});
      }
      return result;
    };
    next();
  };
}

module.exports = { auditAutoCapture };
