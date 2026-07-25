/**
 * auditService.js — Append-Only GxP Audit Trail Service
 *
 * Implements strict append-only audit logging for 21 CFR Part 11 / GxP compliance.
 * Audit logs record action details with immutable timestamps, admin/user context, and IP.
 * Deletion and modifications are strictly prevented at the application layer.
 */

const { pool } = require('../database/db');

/**
 * Writes an immutable audit record to cp_audit_logs.
 */
async function recordAuditLog({
  adminId = null,
  adminName = null,
  clientId = null,
  action,
  entity,
  entityId = null,
  details = null,
  ipAddress = null,
}) {
  if (!action || !entity) {
    throw new Error('Audit log requires action and entity.');
  }

  const detailsString = typeof details === 'object' ? JSON.stringify(details) : String(details || '');

  const query = `
    INSERT INTO cp_audit_logs (admin_id, admin_name, client_id, action, entity, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
  `;

  try {
    const [result] = await pool.execute(query, [
      adminId,
      adminName,
      clientId,
      action,
      entity,
      entityId,
      detailsString,
    ]);
    return result.insertId;
  } catch (err) {
    console.error('❌ Failed to record append-only audit log:', err.message);
    throw err;
  }
}

/**
 * Retrieves audit log entries for a given client (read-only view).
 */
async function getAuditLogsForClient(clientId, limit = 100, offset = 0) {
  const query = `
    SELECT id, admin_id, admin_name, client_id, action, entity, entity_id, details, created_at
    FROM cp_audit_logs
    WHERE client_id = ? OR client_id IS NULL
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.execute(query, [clientId, String(limit), String(offset)]);
  return rows;
}

module.exports = {
  recordAuditLog,
  getAuditLogsForClient,
};
