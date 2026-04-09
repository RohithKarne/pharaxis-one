'use strict';

const pool = require('../database/db');

/**
 * logAudit — centralized audit log writer with before/after diff support.
 */
async function logAudit(userId, userName, action, entity, entityId, details = {}, before = null, after = null, changeReason = null) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details, before_value, after_value, change_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        userName,
        action,
        entity,
        entityId,
        JSON.stringify(details),
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        changeReason || null,
      ]
    );
  } catch (_) {}
}

module.exports = { logAudit };
