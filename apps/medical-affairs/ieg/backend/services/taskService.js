const { query } = require('../database/db')

async function createTask({ moduleKey, assignedUserId, entityType, entityId, actionType, payload = {}, dueAt = null }) {
  const { rows } = await query(
    `
      INSERT INTO ieg_tasks
      (module_key, assigned_user_id, entity_type, entity_id, action_type, payload, due_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      RETURNING *
    `,
    [moduleKey, assignedUserId, entityType, String(entityId), actionType, JSON.stringify(payload), dueAt]
  )
  return rows[0]
}

async function completeTask(taskId) {
  const { rows } = await query(
    `UPDATE ieg_tasks SET status = 'completed' WHERE id = $1 RETURNING *`,
    [taskId]
  )
  return rows[0] || null
}

async function listTasksForUser(userId, moduleKey = null) {
  const params = [userId]
  let whereSql = 'assigned_user_id = $1'
  if (moduleKey) {
    params.push(moduleKey)
    whereSql += ` AND module_key = $${params.length}`
  }

  const { rows } = await query(
    `
      SELECT *
      FROM ieg_tasks
      WHERE ${whereSql}
      ORDER BY status = 'pending' DESC, created_at DESC
    `,
    params
  )
  return rows
}

module.exports = {
  createTask,
  completeTask,
  listTasksForUser
}
