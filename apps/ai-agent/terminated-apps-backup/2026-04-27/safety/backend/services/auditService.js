const { pool } = require('../database/db')

async function logAdminAction({
  orgId,
  actorUserId,
  actionType,
  entityType,
  entityId = null,
  beforeValue = null,
  afterValue = null,
  metadata = null
}) {
  await pool.execute(
    `INSERT INTO admin_audit_log
      (org_id, actor_user_id, action_type, entity_type, entity_id, before_value, after_value, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orgId,
      actorUserId,
      actionType,
      entityType,
      entityId,
      beforeValue ? JSON.stringify(beforeValue) : null,
      afterValue ? JSON.stringify(afterValue) : null,
      metadata ? JSON.stringify(metadata) : null
    ]
  )
}

module.exports = {
  logAdminAction
}
