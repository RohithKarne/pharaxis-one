/**
 * audit.js — Centralized audit logging helper
 * Call this from any admin route to log admin actions per client.
 */
const db = require('../database/db');

/**
 * @param {object} admin  - req.admin (JWT payload: { adminId, name, email, role })
 * @param {number|null} clientId - the client this action belongs to
 * @param {string} action  - CREATE | UPDATE | DELETE | ENABLE | DISABLE | UPLOAD | LOGIN | LOGOUT
 * @param {string} entity  - 'branding' | 'feature' | 'news' | 'safety' | 'document' | 'compliance' | 'chatbox' | 'gate' | 'form' | 'msl' | 'integration' | 'portal_user' | 'client' | 'template'
 * @param {number|string|null} entityId - ID of the affected record (optional)
 * @param {object} details - any extra context to store as JSON
 */
function audit(admin, clientId, action, entity, entityId, details) {
  try {
    db.prepare(
      `INSERT INTO cp_audit_logs (admin_id, admin_name, client_id, action, entity, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      admin?.adminId || null,
      admin?.name    || 'unknown',
      clientId       || null,
      action,
      entity,
      entityId       || null,
      JSON.stringify(details || {})
    );
  } catch (_) { /* never throw from audit */ }
}

module.exports = { audit };
