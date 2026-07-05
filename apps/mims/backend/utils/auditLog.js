'use strict';

const pool = require('../database/db');
const { logger } = require('../services/logger');

/**
 * logAudit — centralized audit log writer with before/after diff support.
 *
 * C-09: pass a transaction `conn` to make the audit row atomic with the business
 * write. On failure we always log (never silently swallow); when part of a
 * transaction we re-throw so the caller rolls back rather than losing the record.
 */
async function logAudit(userId, userName, action, entity, entityId, details = {}, before = null, after = null, changeReason = null, conn = null) {
  const exec = conn || pool;
  try {
    await exec.execute(
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
  } catch (err) {
    logger.error({ err: err.message, action, entity, entityId }, 'logAudit failed to persist audit row');
    if (conn) throw err;
  }
}

module.exports = { logAudit };
