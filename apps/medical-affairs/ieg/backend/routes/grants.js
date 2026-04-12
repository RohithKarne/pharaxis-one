const express = require('express')
const { query, withTransaction } = require('../database/db')
const { requireAuth, requireInternal } = require('../middleware/auth')
const { requireModuleAccess } = require('../middleware/authorize')
const { actorFromAuth } = require('../utils/actor')
const { logAudit } = require('../services/auditService')
const { createTask } = require('../services/taskService')
const { transitionState, acknowledgeWarning, assertWorkflowNotBlocked } = require('../services/workflowService')
const { queueEmail, queueInApp } = require('../services/notificationService')
const { evaluateGrantCompliance } = require('../services/complianceService')
const { resolveApprovalMatrix, usersForRole } = require('../services/approvalService')

const router = express.Router()
router.use(requireAuth, requireInternal, requireModuleAccess('grants'))

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
    await queueInApp({
      recipientUserId: user.id,
      title,
      body,
      context
    })
  }
}

router.get('/programs', async (_req, res) => {
  const { rows } = await query(`SELECT * FROM ieg_grant_programs WHERE is_active = TRUE ORDER BY created_at DESC`)
  return res.json({ programs: rows })
})

router.post('/programs', async (req, res) => {
  const { name, category, cycleName, therapeuticScope = null, requiredDocuments = [] } = req.body || {}
  if (!name || !category || !cycleName) {
    return res.status(400).json({ error: 'name, category, cycleName are required' })
  }

  const { rows } = await query(
    `
      INSERT INTO ieg_grant_programs
      (name, category, cycle_name, therapeutic_scope, required_documents, created_by)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      RETURNING *
    `,
    [name, category, cycleName, therapeuticScope, JSON.stringify(requiredDocuments), req.auth.userId]
  )

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey: 'grants',
    entityType: 'grant_program',
    entityId: String(rows[0].id),
    action: 'grant_program_created',
    metadata: rows[0]
  })

  return res.status(201).json({ program: rows[0] })
})

router.get('/applications', async (_req, res) => {
  const { rows } = await query(`SELECT * FROM ieg_grant_applications ORDER BY created_at DESC`)
  return res.json({ applications: rows })
})

router.post('/applications/:id/completeness-check', async (req, res) => {
  const id = Number(req.params.id)
  const { isComplete, comments = '' } = req.body || {}
  if (typeof isComplete !== 'boolean') {
    return res.status(400).json({ error: 'isComplete boolean is required' })
  }

  const nextStage = isComplete ? 'compliance_screening' : 'returned_for_correction'
  const nextStatus = isComplete ? 'in_review' : 'returned'

  const { rows } = await query(
    `
      UPDATE ieg_grant_applications
      SET current_stage = $1, status = $2,
          data = data || $3::jsonb
      WHERE id = $4
      RETURNING *
    `,
    [nextStage, nextStatus, JSON.stringify({ completenessComments: comments }), id]
  )

  if (!rows[0]) return res.status(404).json({ error: 'Grant application not found' })

  const app = rows[0]
  const actor = actorFromAuth(req.auth)

  await transitionState({
    moduleKey: 'grants',
    entityType: 'grant_application',
    entityId: String(id),
    toState: nextStage,
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    note: comments
  })

  if (isComplete) {
    const complianceUsers = await usersAcrossRoles('grants', ['compliance_officer', 'compliance_reviewer', 'admin', 'superadmin'])
    for (const user of complianceUsers) {
      await createTask({
        moduleKey: 'grants',
        assignedUserId: user.id,
        entityType: 'grant_application',
        entityId: String(id),
        actionType: 'compliance_screening',
        payload: { applicationCode: app.application_code }
      })
    }

    await notifyUsers(
      complianceUsers,
      `Grant ${app.application_code} ready for compliance screening`,
      'Completeness check passed. Compliance screening action is now pending.',
      { applicationId: app.id }
    )
  }

  if (!isComplete && app.external_user_id) {
    await queueEmail({
      recipientExternalUserId: app.external_user_id,
      templateKey: 'grant_returned_for_correction',
      title: `Grant ${app.application_code} returned for correction`,
      body: comments || 'Your submission needs additional details.',
      context: { applicationId: app.id }
    })
  }

  await logAudit({
    ...actor,
    moduleKey: 'grants',
    entityType: 'grant_application',
    entityId: String(id),
    action: 'grant_completeness_checked',
    metadata: { isComplete, comments }
  })

  return res.json({ application: app })
})

router.post('/applications/:id/compliance-screen', async (req, res) => {
  const id = Number(req.params.id)
  const { coiDeclared = false } = req.body || {}

  const appResult = await query(`SELECT * FROM ieg_grant_applications WHERE id = $1`, [id])
  const app = appResult.rows[0]
  if (!app) return res.status(404).json({ error: 'Grant application not found' })

  const warnings = await evaluateGrantCompliance({ requestedAmount: app.requested_amount, coiDeclared })
  const warningRequired = warnings.length > 0
  const nextStage = warningRequired ? 'warning_ack_pending' : 'scientific_review'

  const { rows } = await query(
    `
      UPDATE ieg_grant_applications
      SET current_stage = $1,
          coi_flag = $2,
          data = data || $3::jsonb
      WHERE id = $4
      RETURNING *
    `,
    [nextStage, coiDeclared, JSON.stringify({ complianceWarnings: warnings }), id]
  )

  const actor = actorFromAuth(req.auth)
  await transitionState({
    moduleKey: 'grants',
    entityType: 'grant_application',
    entityId: String(id),
    toState: nextStage,
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    warningRequired,
    note: warningRequired ? 'Soft warning requires acknowledgement' : 'No compliance warnings'
  })

  if (!warningRequired) {
    const reviewers = await usersAcrossRoles('grants', ['medical_reviewer', 'admin', 'superadmin'])
    for (const reviewer of reviewers) {
      await createTask({
        moduleKey: 'grants',
        assignedUserId: reviewer.id,
        entityType: 'grant_application',
        entityId: String(id),
        actionType: 'scientific_review',
        payload: { applicationCode: app.application_code }
      })
    }
    await notifyUsers(
      reviewers,
      `Grant ${app.application_code} ready for scientific review`,
      'Compliance screening completed with no active warning block.',
      { applicationId: app.id }
    )
  }

  await logAudit({
    ...actor,
    moduleKey: 'grants',
    entityType: 'grant_application',
    entityId: String(id),
    action: 'grant_compliance_screened',
    metadata: { warnings, coiDeclared, warningRequired }
  })

  return res.json({ application: rows[0], warnings, warningRequired })
})

router.post('/applications/:id/ack-warning', async (req, res) => {
  const id = Number(req.params.id)
  const { ruleKey, message, notes = '' } = req.body || {}
  if (!ruleKey || !message) {
    return res.status(400).json({ error: 'ruleKey and message are required' })
  }

  const workflow = await acknowledgeWarning({
    moduleKey: 'grants',
    entityType: 'grant_application',
    entityId: String(id),
    actorId: req.auth.userId,
    actorLabel: req.auth.fullName,
    ruleKey,
    message,
    notes
  })

  if (!workflow) {
    return res.status(404).json({ error: 'Workflow not found' })
  }

  await query(
    `
      UPDATE ieg_grant_applications
      SET current_stage = 'scientific_review',
          data = data || $1::jsonb
      WHERE id = $2
    `,
    [JSON.stringify({ lastWarningAcknowledgedAt: new Date().toISOString(), lastWarningRuleKey: ruleKey }), id]
  )

  const appResult = await query(`SELECT * FROM ieg_grant_applications WHERE id = $1`, [id])
  const app = appResult.rows[0]
  const reviewers = await usersAcrossRoles('grants', ['medical_reviewer', 'admin', 'superadmin'])

  for (const reviewer of reviewers) {
    await createTask({
      moduleKey: 'grants',
      assignedUserId: reviewer.id,
      entityType: 'grant_application',
      entityId: String(id),
      actionType: 'scientific_review',
      payload: { applicationCode: app?.application_code }
    })
  }

  await notifyUsers(
    reviewers,
    `Grant ${app?.application_code || id} warning acknowledged`,
    'The warning was acknowledged and scientific review can proceed.',
    { applicationId: id }
  )

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey: 'grants',
    entityType: 'grant_application',
    entityId: String(id),
    action: 'grant_warning_acknowledged',
    metadata: { ruleKey, notes }
  })

  return res.json({ ok: true, workflow })
})

router.post('/applications/:id/review', async (req, res) => {
  const id = Number(req.params.id)
  const { scientificScore, strategicScore, comments = '' } = req.body || {}

  const canProceed = await assertWorkflowNotBlocked({ moduleKey: 'grants', entityType: 'grant_application', entityId: String(id) })
  if (!canProceed) {
    return res.status(409).json({ error: 'Workflow is blocked by a soft warning. Acknowledge before proceeding.' })
  }

  const result = await withTransaction(async (client) => {
    const reviewInsert = await client.query(
      `
        INSERT INTO ieg_grant_reviews
        (grant_application_id, reviewer_user_id, scientific_score, strategic_score, comments, submitted_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING *
      `,
      [id, req.auth.userId, scientificScore, strategicScore, comments]
    )

    await client.query(`UPDATE ieg_grant_applications SET current_stage = 'committee_decision' WHERE id = $1`, [id])

    return reviewInsert.rows[0]
  })

  const appResult = await query(`SELECT * FROM ieg_grant_applications WHERE id = $1`, [id])
  const app = appResult.rows[0]

  const matrix = await resolveApprovalMatrix({
    moduleKey: 'grants',
    requestType: 'standard_grant',
    geography: app?.country_code || 'US',
    amount: Number(app?.requested_amount || 0)
  })

  const chain = Array.isArray(matrix?.approver_chain) ? matrix.approver_chain : []
  const committeeRoles = chain.map((item) => item.role).filter(Boolean)

  const approvers = committeeRoles.length > 0
    ? await usersAcrossRoles('grants', committeeRoles)
    : await usersAcrossRoles('grants', ['committee_member', 'admin', 'superadmin'])

  for (const approver of approvers) {
    await createTask({
      moduleKey: 'grants',
      assignedUserId: approver.id,
      entityType: 'grant_application',
      entityId: String(id),
      actionType: 'committee_decision',
      payload: {
        applicationCode: app?.application_code,
        approvalMatrixId: matrix?.id || null,
        role: approver.role
      }
    })
  }

  await notifyUsers(
    approvers,
    `Grant ${app?.application_code || id} moved to committee decision`,
    'Scientific review is complete. Committee decision input is required.',
    { applicationId: id, approvalMatrixId: matrix?.id || null }
  )

  const actor = actorFromAuth(req.auth)
  await transitionState({
    moduleKey: 'grants',
    entityType: 'grant_application',
    entityId: String(id),
    toState: 'committee_decision',
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    note: 'Scientific review submitted'
  })

  await logAudit({
    ...actor,
    moduleKey: 'grants',
    entityType: 'grant_review',
    entityId: String(result.id),
    action: 'grant_review_submitted',
    metadata: {
      ...result,
      approvalMatrixId: matrix?.id || null,
      approverRoles: committeeRoles
    }
  })

  return res.status(201).json({ review: result, approvalMatrix: matrix })
})

router.post('/applications/:id/decision', async (req, res) => {
  const id = Number(req.params.id)
  const { decision, approvedAmount = null, rationale, signDecision = true } = req.body || {}
  if (!decision || !rationale) {
    return res.status(400).json({ error: 'decision and rationale are required' })
  }

  const canProceed = await assertWorkflowNotBlocked({ moduleKey: 'grants', entityType: 'grant_application', entityId: String(id) })
  if (!canProceed) {
    return res.status(409).json({ error: 'Workflow is blocked by a soft warning. Acknowledge before proceeding.' })
  }

  const appResult = await query(`SELECT * FROM ieg_grant_applications WHERE id = $1`, [id])
  const app = appResult.rows[0]
  if (!app) return res.status(404).json({ error: 'Grant application not found' })

  const { rows } = await query(
    `
      INSERT INTO ieg_grant_decisions
      (grant_application_id, committee_user_id, decision, approved_amount, rationale, signed, signed_at)
      VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 THEN NOW() ELSE NULL END)
      RETURNING *
    `,
    [id, req.auth.userId, decision, approvedAmount, rationale, Boolean(signDecision)]
  )

  const finalStage = decision === 'rejected' ? 'closed_rejected' : 'contracting'
  const finalStatus = decision === 'rejected' ? 'rejected' : 'approved'

  await query(`UPDATE ieg_grant_applications SET current_stage = $1, status = $2 WHERE id = $3`, [finalStage, finalStatus, id])

  const actor = actorFromAuth(req.auth)
  await transitionState({
    moduleKey: 'grants',
    entityType: 'grant_application',
    entityId: String(id),
    toState: finalStage,
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    note: `Decision: ${decision}`
  })

  if (app.external_user_id) {
    await queueEmail({
      recipientExternalUserId: app.external_user_id,
      templateKey: 'grant_decision',
      title: `Grant ${app.application_code} decision: ${decision}`,
      body: rationale,
      context: { decision, approvedAmount }
    })
  }

  await logAudit({
    ...actor,
    moduleKey: 'grants',
    entityType: 'grant_application',
    entityId: String(id),
    action: 'grant_decision_recorded',
    metadata: rows[0]
  })

  return res.status(201).json({ decision: rows[0] })
})

router.post('/applications/:id/contract', async (req, res) => {
  const id = Number(req.params.id)
  const { milestones = [], deliverables = [] } = req.body || {}

  const canProceed = await assertWorkflowNotBlocked({ moduleKey: 'grants', entityType: 'grant_application', entityId: String(id) })
  if (!canProceed) {
    return res.status(409).json({ error: 'Workflow is blocked by a soft warning. Acknowledge before proceeding.' })
  }

  const insertedMilestones = []
  for (const milestone of milestones) {
    const { rows } = await query(
      `
        INSERT INTO ieg_grant_milestones (grant_application_id, title, due_date, deliverable, status)
        VALUES ($1, $2, $3, $4, 'planned')
        RETURNING *
      `,
      [id, milestone.title, milestone.dueDate || null, milestone.deliverable || null]
    )
    insertedMilestones.push(rows[0])
  }

  await query(
    `
      UPDATE ieg_grant_applications
      SET current_stage = 'award_active',
          data = data || $1::jsonb
      WHERE id = $2
    `,
    [JSON.stringify({ contractDeliverables: deliverables }), id]
  )

  const actor = actorFromAuth(req.auth)
  await transitionState({
    moduleKey: 'grants',
    entityType: 'grant_application',
    entityId: String(id),
    toState: 'award_active',
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    note: 'Contract and milestones configured'
  })

  await logAudit({
    ...actor,
    moduleKey: 'grants',
    entityType: 'grant_application',
    entityId: String(id),
    action: 'grant_contract_generated',
    metadata: { milestones: insertedMilestones, deliverables }
  })

  return res.status(201).json({ milestones: insertedMilestones })
})

router.post('/applications/:id/disbursement', async (req, res) => {
  const id = Number(req.params.id)
  const { milestoneName, amount, currency = 'USD' } = req.body || {}
  if (!amount) return res.status(400).json({ error: 'amount is required' })

  const { rows } = await query(
    `
      INSERT INTO ieg_disbursements
      (module_key, entity_type, entity_id, milestone_name, amount, currency, status)
      VALUES ('grants', 'grant_application', $1, $2, $3, $4, 'approved')
      RETURNING *
    `,
    [String(id), milestoneName || null, amount, currency]
  )

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey: 'grants',
    entityType: 'grant_application',
    entityId: String(id),
    action: 'grant_disbursement_recorded',
    metadata: rows[0]
  })

  return res.status(201).json({ disbursement: rows[0] })
})

router.get('/applications/:id/audit', async (req, res) => {
  const id = Number(req.params.id)
  const { rows } = await query(
    `
      SELECT *
      FROM ieg_audit_log
      WHERE module_key = 'grants' AND entity_type = 'grant_application' AND entity_id = $1
      ORDER BY occurred_at DESC
    `,
    [String(id)]
  )
  return res.json({ audit: rows })
})

module.exports = router
