const express = require('express')
const { query } = require('../database/db')
const { requireAuth, requireInternal } = require('../middleware/auth')
const { requireModuleAccess } = require('../middleware/authorize')
const { actorFromAuth } = require('../utils/actor')
const { makeCode } = require('../utils/codes')
const { logAudit } = require('../services/auditService')
const { transitionState } = require('../services/workflowService')
const { createTask } = require('../services/taskService')
const { queueInApp, queueEmail } = require('../services/notificationService')
const { usersForRole } = require('../services/approvalService')

const router = express.Router()
router.use(requireAuth, requireInternal, requireModuleAccess('eap'))

async function usersAcrossRoles(moduleKey, roles) {
  const unique = new Map()
  for (const role of roles) {
    const users = await usersForRole({ moduleKey, role })
    for (const user of users) {
      unique.set(Number(user.id), user)
    }
  }
  return Array.from(unique.values())
}

async function notifyUsers(users, title, body, context = {}) {
  for (const user of users) {
    await queueInApp({ recipientUserId: user.id, title, body, context })
  }
}

router.get('/requests', async (_req, res) => {
  const { rows } = await query(`SELECT * FROM ieg_eap_requests ORDER BY created_at DESC`)
  return res.json({ requests: rows })
})

router.post('/requests/:id/intake-review', async (req, res) => {
  const id = Number(req.params.id)
  const { decision, comments = '' } = req.body || {}
  if (!decision) {
    return res.status(400).json({ error: 'decision is required' })
  }

  const requestResult = await query(`SELECT * FROM ieg_eap_requests WHERE id = $1`, [id])
  const eap = requestResult.rows[0]
  if (!eap) return res.status(404).json({ error: 'EAP request not found' })

  let nextStage = 'regulatory_pathway'
  let nextStatus = 'in_review'
  if (decision === 'ineligible') {
    nextStage = 'closed_rejected'
    nextStatus = 'rejected'
  }
  if (decision === 'need_more_info') {
    nextStage = 'clarification_requested'
    nextStatus = 'returned'
  }

  await query(
    `
      UPDATE ieg_eap_requests
      SET status = $1, current_stage = $2
      WHERE id = $3
    `,
    [nextStatus, nextStage, id]
  )

  const { rows } = await query(
    `
      INSERT INTO ieg_eap_reviews (eap_request_id, reviewer_user_id, review_type, decision, comments)
      VALUES ($1, $2, 'intake', $3, $4)
      RETURNING *
    `,
    [id, req.auth.userId, decision, comments]
  )

  const actor = actorFromAuth(req.auth)
  await transitionState({
    moduleKey: 'eap',
    entityType: 'eap_request',
    entityId: String(id),
    toState: nextStage,
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    note: `EAP intake review decision: ${decision}`
  })

  if (decision === 'eligible') {
    const reviewers = await usersAcrossRoles('eap', ['medical_reviewer', 'compliance_reviewer', 'admin', 'superadmin'])
    for (const reviewer of reviewers) {
      await createTask({
        moduleKey: 'eap',
        assignedUserId: reviewer.id,
        entityType: 'eap_request',
        entityId: String(id),
        actionType: 'regulatory_pathway_review',
        payload: { requestCode: eap.request_code }
      })
    }
    await notifyUsers(
      reviewers,
      `EAP ${eap.request_code} ready for regulatory pathway review`,
      'Intake review passed. Regulatory pathway selection is now pending.',
      { eapRequestId: id }
    )
  }

  if (decision !== 'eligible' && eap.external_user_id) {
    await queueEmail({
      recipientExternalUserId: eap.external_user_id,
      templateKey: 'eap_intake_decision',
      title: `EAP ${eap.request_code} update`,
      body: comments || `Intake decision: ${decision}`,
      context: { decision, eapRequestId: id }
    })
  }

  await logAudit({
    ...actor,
    moduleKey: 'eap',
    entityType: 'eap_request',
    entityId: String(id),
    action: 'eap_intake_review_recorded',
    metadata: { decision, comments }
  })

  return res.status(201).json({ review: rows[0], nextStage, nextStatus })
})

router.post('/requests/:id/regulatory-pathway', async (req, res) => {
  const id = Number(req.params.id)
  const { pathway, comments = '' } = req.body || {}
  if (!pathway) {
    return res.status(400).json({ error: 'pathway is required' })
  }

  const requestResult = await query(`SELECT * FROM ieg_eap_requests WHERE id = $1`, [id])
  const eap = requestResult.rows[0]
  if (!eap) return res.status(404).json({ error: 'EAP request not found' })

  const { rows: reviewRows } = await query(
    `
      INSERT INTO ieg_eap_reviews (eap_request_id, reviewer_user_id, review_type, decision, comments)
      VALUES ($1, $2, 'regulatory_pathway', $3, $4)
      RETURNING *
    `,
    [id, req.auth.userId, pathway, comments]
  )

  await query(
    `
      UPDATE ieg_eap_requests
      SET regulatory_pathway = $1, status = 'in_review', current_stage = 'supply_coordination'
      WHERE id = $2
    `,
    [pathway, id]
  )

  const actor = actorFromAuth(req.auth)
  await transitionState({
    moduleKey: 'eap',
    entityType: 'eap_request',
    entityId: String(id),
    toState: 'supply_coordination',
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    note: `Regulatory pathway selected: ${pathway}`
  })

  const opsUsers = await usersAcrossRoles('eap', ['study_operations_manager', 'admin', 'superadmin'])
  for (const user of opsUsers) {
    await createTask({
      moduleKey: 'eap',
      assignedUserId: user.id,
      entityType: 'eap_request',
      entityId: String(id),
      actionType: 'supply_coordination',
      payload: { requestCode: eap.request_code, pathway }
    })
  }

  await notifyUsers(
    opsUsers,
    `EAP ${eap.request_code} moved to supply coordination`,
    'Regulatory pathway confirmed. Supply workflow can proceed.',
    { eapRequestId: id, pathway }
  )

  await logAudit({
    ...actor,
    moduleKey: 'eap',
    entityType: 'eap_request',
    entityId: String(id),
    action: 'eap_regulatory_pathway_selected',
    metadata: { pathway, comments }
  })

  return res.status(201).json({ review: reviewRows[0] })
})

router.post('/requests/:id/emergency-activate', async (req, res) => {
  const id = Number(req.params.id)
  const { targetHours = 6, notes = '' } = req.body || {}

  const requestResult = await query(`SELECT * FROM ieg_eap_requests WHERE id = $1`, [id])
  const eap = requestResult.rows[0]
  if (!eap) return res.status(404).json({ error: 'EAP request not found' })

  await query(
    `
      UPDATE ieg_eap_requests
      SET emergency_flag = TRUE,
          urgency_level = 'emergency',
          current_stage = 'emergency_fast_track'
      WHERE id = $1
    `,
    [id]
  )

  const { rows } = await query(
    `
      INSERT INTO ieg_eap_sla_events (eap_request_id, sla_type, target_minutes, breach_flag)
      VALUES ($1, 'emergency_pathway', $2, FALSE)
      RETURNING *
    `,
    [id, Number(targetHours) * 60]
  )

  const actor = actorFromAuth(req.auth)
  await transitionState({
    moduleKey: 'eap',
    entityType: 'eap_request',
    entityId: String(id),
    toState: 'emergency_fast_track',
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    note: notes || `Emergency pathway activated with ${targetHours}h SLA`
  })

  const escalationUsers = await usersAcrossRoles('eap', ['admin', 'superadmin', 'medical_reviewer'])
  for (const user of escalationUsers) {
    await createTask({
      moduleKey: 'eap',
      assignedUserId: user.id,
      entityType: 'eap_request',
      entityId: String(id),
      actionType: 'emergency_escalation',
      payload: { requestCode: eap.request_code, targetHours: Number(targetHours) }
    })
  }

  await notifyUsers(
    escalationUsers,
    `Emergency EAP activated: ${eap.request_code}`,
    `Fast-track pathway enabled. SLA target: ${targetHours} hours.`,
    { eapRequestId: id, targetHours: Number(targetHours) }
  )

  await logAudit({
    ...actor,
    moduleKey: 'eap',
    entityType: 'eap_request',
    entityId: String(id),
    action: 'eap_emergency_pathway_activated',
    metadata: { targetHours: Number(targetHours), notes }
  })

  return res.status(201).json({ slaEvent: rows[0] })
})

router.post('/requests/:id/supply-event', async (req, res) => {
  const id = Number(req.params.id)
  const { supplyState, quantity = null, notes = '' } = req.body || {}
  if (!supplyState) return res.status(400).json({ error: 'supplyState is required' })

  const requestResult = await query(`SELECT * FROM ieg_eap_requests WHERE id = $1`, [id])
  const eap = requestResult.rows[0]
  if (!eap) return res.status(404).json({ error: 'EAP request not found' })

  const { rows } = await query(
    `
      INSERT INTO ieg_eap_supply_events (eap_request_id, actor_user_id, supply_state, quantity, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [id, req.auth.userId, supplyState, quantity, notes]
  )

  if (supplyState === 'delivered') {
    await query(`UPDATE ieg_eap_requests SET status = 'active_treatment', current_stage = 'treatment' WHERE id = $1`, [id])
  }
  if (supplyState === 'cancelled') {
    await query(`UPDATE ieg_eap_requests SET status = 'closed', current_stage = 'closed' WHERE id = $1`, [id])
  }

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey: 'eap',
    entityType: 'eap_request',
    entityId: String(id),
    action: 'eap_supply_event_recorded',
    metadata: { supplyState, quantity, notes }
  })

  return res.status(201).json({ supplyEvent: rows[0] })
})

router.post('/requests/:id/safety-event', async (req, res) => {
  const id = Number(req.params.id)
  const { eventType, seriousness, description } = req.body || {}
  if (!eventType || !seriousness || !description) {
    return res.status(400).json({ error: 'eventType, seriousness, description are required' })
  }

  const requestResult = await query(`SELECT * FROM ieg_eap_requests WHERE id = $1`, [id])
  const eap = requestResult.rows[0]
  if (!eap) return res.status(404).json({ error: 'EAP request not found' })

  const { rows } = await query(
    `
      INSERT INTO ieg_eap_safety_events
      (eap_request_id, reporter_user_id, event_type, seriousness, description, status)
      VALUES ($1, $2, $3, $4, $5, 'open')
      RETURNING *
    `,
    [id, req.auth.userId, eventType, seriousness, description]
  )

  const pvUsers = await usersAcrossRoles('eap', ['compliance_reviewer', 'admin', 'superadmin'])
  for (const user of pvUsers) {
    await createTask({
      moduleKey: 'eap',
      assignedUserId: user.id,
      entityType: 'eap_safety_event',
      entityId: String(rows[0].id),
      actionType: 'safety_event_followup',
      payload: { requestCode: eap.request_code, seriousness }
    })
  }

  await notifyUsers(
    pvUsers,
    `EAP safety event raised: ${eap.request_code}`,
    `${eventType} reported with seriousness ${seriousness}.`,
    { eapRequestId: id, safetyEventId: rows[0].id }
  )

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey: 'eap',
    entityType: 'eap_request',
    entityId: String(id),
    action: 'eap_safety_event_logged',
    metadata: { safetyEventId: rows[0].id, eventType, seriousness }
  })

  return res.status(201).json({ safetyEvent: rows[0] })
})

router.post('/safety-events/:eventId/report', async (req, res) => {
  const eventId = Number(req.params.eventId)
  const { payload = {} } = req.body || {}

  const safetyResult = await query(`SELECT * FROM ieg_eap_safety_events WHERE id = $1`, [eventId])
  const safetyEvent = safetyResult.rows[0]
  if (!safetyEvent) return res.status(404).json({ error: 'Safety event not found' })

  const reportReference = makeCode('PVR')
  const { rows } = await query(
    `
      INSERT INTO ieg_eap_safety_reports (safety_event_id, report_reference, report_payload)
      VALUES ($1, $2, $3::jsonb)
      RETURNING *
    `,
    [eventId, reportReference, JSON.stringify(payload)]
  )

  await query(`UPDATE ieg_eap_safety_events SET status = 'reported' WHERE id = $1`, [eventId])

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey: 'eap',
    entityType: 'eap_safety_event',
    entityId: String(eventId),
    action: 'eap_safety_report_created',
    metadata: { reportReference }
  })

  return res.status(201).json({ report: rows[0] })
})

router.get('/requests/:id/timeline', async (req, res) => {
  const id = Number(req.params.id)
  const [requestResult, reviewsResult, supplyResult, safetyResult, slaResult] = await Promise.all([
    query(`SELECT * FROM ieg_eap_requests WHERE id = $1`, [id]),
    query(`SELECT * FROM ieg_eap_reviews WHERE eap_request_id = $1 ORDER BY created_at DESC`, [id]),
    query(`SELECT * FROM ieg_eap_supply_events WHERE eap_request_id = $1 ORDER BY created_at DESC`, [id]),
    query(`SELECT * FROM ieg_eap_safety_events WHERE eap_request_id = $1 ORDER BY created_at DESC`, [id]),
    query(`SELECT * FROM ieg_eap_sla_events WHERE eap_request_id = $1 ORDER BY created_at DESC`, [id])
  ])

  if (!requestResult.rows[0]) return res.status(404).json({ error: 'EAP request not found' })

  return res.json({
    request: requestResult.rows[0],
    reviews: reviewsResult.rows,
    supplyEvents: supplyResult.rows,
    safetyEvents: safetyResult.rows,
    slaEvents: slaResult.rows
  })
})

router.get('/requests/:id/audit', async (req, res) => {
  const id = Number(req.params.id)
  const { rows } = await query(
    `
      SELECT *
      FROM ieg_audit_log
      WHERE module_key = 'eap' AND entity_type IN ('eap_request', 'eap_safety_event') AND entity_id = $1
      ORDER BY occurred_at DESC
    `,
    [String(id)]
  )
  return res.json({ audit: rows })
})

module.exports = router
