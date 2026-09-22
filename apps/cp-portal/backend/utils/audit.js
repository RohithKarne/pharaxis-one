/**
 * audit.js — Centralized audit logging helper (MySQL async)
 * Call this from any admin route to log admin actions per client.
 */
const { pool } = require('../database/db');

/**
 * @param {object} admin  - req.admin (JWT payload: { adminId, name, email, role })
 * @param {number|null} clientId - the client this action belongs to
 * @param {string} action  - CREATE | UPDATE | DELETE | ENABLE | DISABLE | UPLOAD | LOGIN | LOGOUT
 * @param {string} entity  - entity type string
 * @param {number|string|null} entityId - ID of the affected record
 * @param {object} details - any extra context to store as JSON
 */
async function audit(admin, clientId, action, entity, entityId, details) {
  try {
    await pool.execute(
      `INSERT INTO cp_audit_logs (admin_id, admin_name, client_id, action, entity, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        admin?.adminId || null,
        admin?.name    || 'unknown',
        clientId       || null,
        action,
        entity,
        entityId       || null,
        JSON.stringify(details || {}),
      ]
    );
  } catch (_) { /* never throw from audit */ }
}

/**
 * systemAudit — audit an event that has no human admin actor (integration sync,
 * automated close-sync, portal submission). Records an attributable actor name
 * instead of a blank/unknown one, so a Part 11 reviewer can see the source.
 * @param {string} actorName - e.g. 'MIMS integration', 'portal', 'system'
 */
async function systemAudit(actorName, clientId, action, entity, entityId, details) {
  return audit({ adminId: null, name: actorName || 'system' }, clientId, action, entity, entityId, details);
}

const WRITE_METHODS  = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const DEFAULT_ACTION = { POST: 'CREATE', PATCH: 'UPDATE', PUT: 'UPDATE', DELETE: 'DELETE' };

// The record that was touched: a route param other than clientId, or the id a
// create route hands back in its response body.
function affectedId(req, body) {
  for (const [key, value] of Object.entries(req.params || {})) {
    if (key !== 'clientId' && Number.isInteger(Number(value))) return Number(value);
  }
  return Number.isInteger(Number(body?.id)) ? Number(body.id) : null;
}

/**
 * auditWrites(entity) — router-level safety net, so a NEW write route on an
 * already-covered router cannot silently leave no record. Mount it on an admin
 * router and every write that answers with a success status is logged once.
 *
 * A route that wants a more specific record sets res.locals.audit before it
 * responds — { action, entity, entityId, details } is merged over the defaults;
 * res.locals.audit = false skips the row.
 *
 * Only route params and details a route supplies on purpose are recorded —
 * never the request body — so a secret cannot reach the audit trail by accident.
 * CPPM-10.
 */
function auditWrites(entity) {
  return function auditWritesMiddleware(req, res, next) {
    if (!WRITE_METHODS.has(req.method)) return next();
    const clientId = req.params.clientId || null;
    const sendJson = res.json.bind(res);
    res.json = (body) => {
      const override = res.locals.audit;
      if (override !== false && res.statusCode < 400) {
        res.locals.audit = false; // never log the same request twice
        // Not awaited: audit() swallows its own errors, so the response is
        // never delayed or failed by the logging.
        audit(
          req.admin,
          clientId,
          override?.action   || DEFAULT_ACTION[req.method],
          override?.entity   || entity,
          override?.entityId ?? affectedId(req, body),
          override?.details  || {}
        );
      }
      return sendJson(body);
    };
    next();
  };
}

module.exports = { audit, systemAudit, auditWrites };
