const { query } = require('../database/db')

async function writeAudit({
  tenantId = null,
  actorUserId = null,
  actionType,
  entityType,
  entityId = null,
  metadata = {}
}) {
  await query(
    `
      INSERT INTO pub_audit_log
      (tenant_id, actor_user_id, action_type, entity_type, entity_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [tenantId, actorUserId, actionType, entityType, entityId ? String(entityId) : null, JSON.stringify(metadata || {})]
  )
}

module.exports = {
  writeAudit
}
