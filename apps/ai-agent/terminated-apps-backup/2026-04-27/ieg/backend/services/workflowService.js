const { query } = require('../database/db')

async function ensureWorkflow({ moduleKey, entityType, entityId, initialState }) {
  const existing = await query(
    `SELECT * FROM ieg_workflows WHERE module_key = $1 AND entity_type = $2 AND entity_id = $3`,
    [moduleKey, entityType, String(entityId)]
  )
  if (existing.rows[0]) {
    return existing.rows[0]
  }

  const { rows } = await query(
    `
      INSERT INTO ieg_workflows (module_key, entity_type, entity_id, current_state)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
    [moduleKey, entityType, String(entityId), initialState]
  )

  return rows[0]
}

async function getWorkflow({ moduleKey, entityType, entityId }) {
  const { rows } = await query(
    `SELECT * FROM ieg_workflows WHERE module_key = $1 AND entity_type = $2 AND entity_id = $3`,
    [moduleKey, entityType, String(entityId)]
  )
  return rows[0] || null
}

async function transitionState({
  moduleKey,
  entityType,
  entityId,
  toState,
  actorType,
  actorId,
  actorLabel,
  note = null,
  warningRequired = false
}) {
  const workflow = await ensureWorkflow({ moduleKey, entityType, entityId, initialState: toState })

  const { rows } = await query(
    `
      UPDATE ieg_workflows
      SET current_state = $1,
          warning_blocked = $2,
          state_updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `,
    [toState, warningRequired, workflow.id]
  )

  await query(
    `
      INSERT INTO ieg_workflow_events
      (workflow_id, from_state, to_state, actor_type, actor_id, actor_label, note, warning_required, warning_acknowledged)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      workflow.id,
      workflow.current_state,
      toState,
      actorType,
      actorId ? String(actorId) : null,
      actorLabel || null,
      note,
      warningRequired,
      !warningRequired
    ]
  )

  return rows[0]
}

async function acknowledgeWarning({ moduleKey, entityType, entityId, actorId, actorLabel, ruleKey, message, notes }) {
  const { rows } = await query(
    `
      UPDATE ieg_workflows
      SET warning_blocked = FALSE
      WHERE module_key = $1 AND entity_type = $2 AND entity_id = $3
      RETURNING *
    `,
    [moduleKey, entityType, String(entityId)]
  )

  if (!rows[0]) {
    return null
  }

  await query(
    `
      INSERT INTO ieg_warning_acknowledgements
      (module_key, entity_type, entity_id, rule_key, message, acknowledged_by, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [moduleKey, entityType, String(entityId), ruleKey, message, actorId, notes || null]
  )

  await query(
    `
      UPDATE ieg_workflow_events
      SET warning_acknowledged = TRUE
      WHERE workflow_id = $1 AND warning_required = TRUE
    `,
    [rows[0].id]
  )

  await query(
    `
      INSERT INTO ieg_workflow_events
      (workflow_id, from_state, to_state, actor_type, actor_id, actor_label, note, warning_required, warning_acknowledged)
      VALUES ($1, $2, $3, 'internal', $4, $5, $6, FALSE, TRUE)
    `,
    [rows[0].id, rows[0].current_state, rows[0].current_state, String(actorId), actorLabel, 'warning_acknowledged']
  )

  return rows[0]
}

async function assertWorkflowNotBlocked({ moduleKey, entityType, entityId }) {
  const workflow = await getWorkflow({ moduleKey, entityType, entityId })
  return !(workflow && workflow.warning_blocked)
}

module.exports = {
  ensureWorkflow,
  transitionState,
  acknowledgeWarning,
  getWorkflow,
  assertWorkflowNotBlocked
}
