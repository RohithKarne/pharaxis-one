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

module.exports = { audit };
