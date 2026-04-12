const { query } = require('../database/db')

async function logAudit(entry) {
  const {
    actorType = 'system',
    actorId = null,
    actorLabel = 'system',
    moduleKey = null,
    entityType = null,
    entityId = null,
    action,
    metadata = {}
  } = entry

  await query(
    `
      INSERT INTO ieg_audit_log
      (actor_type, actor_id, actor_label, module_key, entity_type, entity_id, action, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
    `,
    [actorType, actorId, actorLabel, moduleKey, entityType, entityId, action, JSON.stringify(metadata)]
  )
}

module.exports = {
  logAudit
}
