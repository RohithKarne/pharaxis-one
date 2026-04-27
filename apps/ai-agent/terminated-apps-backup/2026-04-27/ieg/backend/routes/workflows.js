const express = require('express')
const { requireAuth, requireInternal } = require('../middleware/auth')
const { transitionState, acknowledgeWarning } = require('../services/workflowService')
const { logAudit } = require('../services/auditService')
const { actorFromAuth } = require('../utils/actor')
const { queueInApp } = require('../services/notificationService')

const router = express.Router()
router.use(requireAuth, requireInternal)

router.post('/transition', async (req, res) => {
  const { moduleKey, entityType, entityId, toState, warningRequired = false, note = null, notifyUserIds = [] } = req.body || {}
  if (!moduleKey || !entityType || !entityId || !toState) {
    return res.status(400).json({ error: 'moduleKey, entityType, entityId, toState are required' })
  }

  const actor = actorFromAuth(req.auth)
  const workflow = await transitionState({
    moduleKey,
    entityType,
    entityId,
    toState,
    warningRequired,
    note,
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorLabel: actor.actorLabel
  })

  await logAudit({
    ...actor,
    moduleKey,
    entityType,
    entityId: String(entityId),
    action: 'workflow_transitioned',
    metadata: { toState, warningRequired, note }
  })

  const recipients = Array.isArray(notifyUserIds) && notifyUserIds.length > 0 ? notifyUserIds : [req.auth.userId]
  for (const recipientUserId of recipients) {
    await queueInApp({
      recipientUserId: Number(recipientUserId),
      title: `${moduleKey} workflow transitioned`,
      body: `${entityType} ${entityId} moved to ${toState}`,
      templateKey: 'workflow_transition',
      context: { moduleKey, entityType, entityId, toState, warningRequired }
    })
  }

  return res.json({ workflow })
})

router.post('/ack-warning', async (req, res) => {
  const { moduleKey, entityType, entityId, ruleKey, message, notes } = req.body || {}
  if (!moduleKey || !entityType || !entityId || !ruleKey || !message) {
    return res.status(400).json({ error: 'moduleKey, entityType, entityId, ruleKey and message are required' })
  }

  const workflow = await acknowledgeWarning({
    moduleKey,
    entityType,
    entityId,
    actorId: req.auth.userId,
    actorLabel: req.auth.fullName,
    ruleKey,
    message,
    notes
  })

  if (!workflow) {
    return res.status(404).json({ error: 'Workflow not found' })
  }

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey,
    entityType,
    entityId: String(entityId),
    action: 'warning_acknowledged',
    metadata: { ruleKey, message, notes }
  })

  return res.json({ workflow })
})

module.exports = router
