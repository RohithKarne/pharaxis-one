const express = require('express')
const { requireAuth, requireInternal } = require('../middleware/auth')
const { createTask, completeTask, listTasksForUser } = require('../services/taskService')
const { logAudit } = require('../services/auditService')
const { actorFromAuth } = require('../utils/actor')

const router = express.Router()
router.use(requireAuth, requireInternal)

router.get('/', async (req, res) => {
  const moduleKey = req.query.moduleKey || null
  const tasks = await listTasksForUser(req.auth.userId, moduleKey)
  res.json({ tasks })
})

router.post('/', async (req, res) => {
  const { moduleKey, assignedUserId, entityType, entityId, actionType, payload, dueAt } = req.body || {}
  if (!moduleKey || !assignedUserId || !entityType || !entityId || !actionType) {
    return res.status(400).json({ error: 'moduleKey, assignedUserId, entityType, entityId, actionType are required' })
  }

  const task = await createTask({ moduleKey, assignedUserId, entityType, entityId, actionType, payload, dueAt })

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey,
    entityType: 'task',
    entityId: String(task.id),
    action: 'task_created',
    metadata: task
  })

  return res.status(201).json({ task })
})

router.patch('/:taskId/complete', async (req, res) => {
  const task = await completeTask(Number(req.params.taskId))
  if (!task) {
    return res.status(404).json({ error: 'Task not found' })
  }

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey: task.module_key,
    entityType: 'task',
    entityId: String(task.id),
    action: 'task_completed',
    metadata: { actionType: task.action_type }
  })

  return res.json({ task })
})

module.exports = router
