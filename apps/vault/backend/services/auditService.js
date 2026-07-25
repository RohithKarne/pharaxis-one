const { pool } = require('../database/db')

function serialize(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

async function log(orgId, userId, userType, action, entityType, entityId, ip, beforeValue, afterValue, notes, connection = null) {
  const db = connection || pool
  try {
    await db.execute(
      `INSERT INTO vault_audit_log
       (org_id, user_id, user_type, action, entity_type, entity_id, ip_address, before_value, after_value, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId,
        userId || null,
        userType || 'org_user',
        action,
        entityType || null,
        entityId || null,
        ip || null,
        serialize(beforeValue),
        serialize(afterValue),
        notes || null
      ]
    )
    return true
  } catch (error) {
    console.error('Audit log write failed:', error.message)
    throw new Error(`Audit logging failed: ${error.message}. Transaction aborted for compliance integrity.`)
  }
}

module.exports = { log }
