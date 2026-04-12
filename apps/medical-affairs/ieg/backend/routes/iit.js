const express = require('express')
const { query, withTransaction } = require('../database/db')
const { requireAuth, requireInternal } = require('../middleware/auth')
const { requireModuleAccess } = require('../middleware/authorize')
const { actorFromAuth } = require('../utils/actor')
const { logAudit } = require('../services/auditService')
const { createTask } = require('../services/taskService')
const { transitionState, acknowledgeWarning, assertWorkflowNotBlocked } = require('../services/workflowService')
const { evaluateIitCompliance } = require('../services/complianceService')
const { resolveApprovalMatrix, usersForRole } = require('../services/approvalService')
const { queueInApp } = require('../services/notificationService')

const router = express.Router()
router.use(requireAuth, requireInternal, requireModuleAccess('iit'))

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

router.get('/proposals', async (_req, res) => {
  const { rows } = await query(`SELECT * FROM ieg_iit_proposals ORDER BY created_at DESC`)
  return res.json({ proposals: rows })
})

router.post('/proposals/:id/triage', async (req, res) => {
  const id = Number(req.params.id)
  const { triageDecision, scientificScore = null, strategicScore = null, comments = '' } = req.body || {}
  if (!triageDecision) {
    return res.status(400).json({ error: 'triageDecision is required' })
  }

  const proposalResult = await query(`SELECT * FROM ieg_iit_proposals WHERE id = $1`, [id])
  const proposal = proposalResult.rows[0]
  if (!proposal) return res.status(404).json({ error: 'IIT proposal not found' })

  const matrix = triageDecision === 'proceed'
    ? await resolveApprovalMatrix({
      moduleKey: 'iit',
      requestType: 'standard_iit',
      geography: 'US',
      amount: Number(proposal.requested_amount || 0)
    })
    : null

  const reviewResult = await withTransaction(async (client) => {
    const review = await client.query(
      `
        INSERT INTO ieg_iit_reviews
        (iit_proposal_id, reviewer_user_id, triage_decision, scientific_score, strategic_score, comments)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [id, req.auth.userId, triageDecision, scientificScore, strategicScore, comments]
    )

    const nextStage = triageDecision === 'proceed' ? 'fmv_review' : 'closed'
    const nextStatus = triageDecision === 'reject' ? 'rejected' : 'in_review'

    await client.query(
      `
        UPDATE ieg_iit_proposals
        SET current_stage = $1,
            status = $2,
            data = data || $3::jsonb
        WHERE id = $4
      `,
      [nextStage, nextStatus, JSON.stringify({ approvalMatrixId: matrix?.id || null }), id]
    )

    return review.rows[0]
  })

  const actor = actorFromAuth(req.auth)
  await transitionState({
    moduleKey: 'iit',
    entityType: 'iit_proposal',
    entityId: String(id),
    toState: triageDecision === 'proceed' ? 'fmv_review' : 'closed',
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    note: `Triage decision: ${triageDecision}`
  })

  const fmvUsers = triageDecision === 'proceed'
    ? await usersAcrossRoles('iit', ['compliance_reviewer', 'compliance_officer', 'admin', 'superadmin'])
    : []

  for (const user of fmvUsers) {
    await createTask({
      moduleKey: 'iit',
      assignedUserId: user.id,
      entityType: 'iit_proposal',
      entityId: String(id),
      actionType: 'fmv_review',
      payload: { proposalCode: proposal.proposal_code, approvalMatrixId: matrix?.id || null }
    })
  }

  if (fmvUsers.length > 0) {
    await notifyUsers(
      fmvUsers,
      `IIT ${proposal.proposal_code} ready for FMV review`,
      'Scientific triage marked as proceed. FMV review is now required.',
      { proposalId: proposal.id, approvalMatrixId: matrix?.id || null }
    )
  }

  await logAudit({
    ...actor,
    moduleKey: 'iit',
    entityType: 'iit_proposal',
    entityId: String(id),
    action: 'iit_triage_recorded',
    metadata: {
      ...reviewResult,
      approvalMatrixId: matrix?.id || null
    }
  })

  return res.status(201).json({ review: reviewResult, approvalMatrix: matrix })
})

router.post('/proposals/:id/fmv-review', async (req, res) => {
  const id = Number(req.params.id)
  const { fmvReferenceValue, fmvSource = 'external_stub_feed', fmvReferenceId = null } = req.body || {}
  if (!fmvReferenceValue) {
    return res.status(400).json({ error: 'fmvReferenceValue is required' })
  }

  const proposalResult = await query(`SELECT * FROM ieg_iit_proposals WHERE id = $1`, [id])
  const proposal = proposalResult.rows[0]
  if (!proposal) return res.status(404).json({ error: 'IIT proposal not found' })

  const warnings = await evaluateIitCompliance({
    requestedAmount: proposal.requested_amount,
    fmvReferenceValue
  })

  const warningRequired = warnings.length > 0
  const nextStage = warningRequired ? 'warning_ack_pending' : 'committee_review'

  const { rows } = await query(
    `
      UPDATE ieg_iit_proposals
      SET fmv_reference_value = $1,
          fmv_warning = $2,
          current_stage = $3,
          data = data || $4::jsonb
      WHERE id = $5
      RETURNING *
    `,
    [
      fmvReferenceValue,
      warningRequired,
      nextStage,
      JSON.stringify({
        fmvWarnings: warnings,
        fmvReference: {
          source: fmvSource,
          referenceId: fmvReferenceId,
          benchmarkValue: Number(fmvReferenceValue)
        }
      }),
      id
    ]
  )

  const actor = actorFromAuth(req.auth)
  await transitionState({
    moduleKey: 'iit',
    entityType: 'iit_proposal',
    entityId: String(id),
    toState: nextStage,
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    warningRequired,
    note: warningRequired ? 'FMV out-of-range warning raised' : 'FMV within expected range'
  })

  if (!warningRequired) {
    const matrix = await resolveApprovalMatrix({
      moduleKey: 'iit',
      requestType: 'standard_iit',
      geography: 'US',
      amount: Number(proposal.requested_amount || 0)
    })

    const roles = Array.isArray(matrix?.approver_chain)
      ? matrix.approver_chain.map((item) => item.role).filter(Boolean)
      : ['medical_reviewer', 'compliance_reviewer', 'committee_member']

    const approvers = await usersAcrossRoles('iit', roles)
    for (const approver of approvers) {
      await createTask({
        moduleKey: 'iit',
        assignedUserId: approver.id,
        entityType: 'iit_proposal',
        entityId: String(id),
        actionType: 'committee_review_vote',
        payload: { proposalCode: proposal.proposal_code, role: approver.role, approvalMatrixId: matrix?.id || null }
      })
    }

    await notifyUsers(
      approvers,
      `IIT ${proposal.proposal_code} moved to committee review`,
      'FMV review completed with no warning block. Committee votes are now required.',
      { proposalId: proposal.id, approvalMatrixId: matrix?.id || null }
    )
  }

  await logAudit({
    ...actor,
    moduleKey: 'iit',
    entityType: 'iit_proposal',
    entityId: String(id),
    action: 'iit_fmv_review_completed',
    metadata: { fmvReferenceValue, fmvSource, warnings, warningRequired }
  })

  return res.json({ proposal: rows[0], warnings, warningRequired })
})

router.post('/proposals/:id/ack-warning', async (req, res) => {
  const id = Number(req.params.id)
  const { ruleKey, message, notes = '' } = req.body || {}
  if (!ruleKey || !message) {
    return res.status(400).json({ error: 'ruleKey and message are required' })
  }

  const workflow = await acknowledgeWarning({
    moduleKey: 'iit',
    entityType: 'iit_proposal',
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
      UPDATE ieg_iit_proposals
      SET current_stage = 'committee_review',
          data = data || $1::jsonb
      WHERE id = $2
    `,
    [JSON.stringify({ lastWarningAcknowledgedAt: new Date().toISOString(), lastWarningRuleKey: ruleKey }), id]
  )

  const proposalResult = await query(`SELECT * FROM ieg_iit_proposals WHERE id = $1`, [id])
  const proposal = proposalResult.rows[0]

  const matrix = await resolveApprovalMatrix({
    moduleKey: 'iit',
    requestType: 'standard_iit',
    geography: 'US',
    amount: Number(proposal?.requested_amount || 0)
  })

  const roles = Array.isArray(matrix?.approver_chain)
    ? matrix.approver_chain.map((item) => item.role).filter(Boolean)
    : ['medical_reviewer', 'compliance_reviewer', 'committee_member']
  const approvers = await usersAcrossRoles('iit', roles)

  for (const approver of approvers) {
    await createTask({
      moduleKey: 'iit',
      assignedUserId: approver.id,
      entityType: 'iit_proposal',
      entityId: String(id),
      actionType: 'committee_review_vote',
      payload: { proposalCode: proposal?.proposal_code, role: approver.role, approvalMatrixId: matrix?.id || null }
    })
  }

  await notifyUsers(
    approvers,
    `IIT ${proposal?.proposal_code || id} warning acknowledged`,
    'Warning was acknowledged. Committee review can proceed.',
    { proposalId: id, approvalMatrixId: matrix?.id || null }
  )

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey: 'iit',
    entityType: 'iit_proposal',
    entityId: String(id),
    action: 'iit_warning_acknowledged',
    metadata: { ruleKey, notes }
  })

  return res.json({ ok: true, workflow })
})

router.post('/proposals/:id/committee-vote', async (req, res) => {
  const id = Number(req.params.id)
  const { functionRole, vote, comments = '' } = req.body || {}
  if (!functionRole || !vote) {
    return res.status(400).json({ error: 'functionRole and vote are required' })
  }

  const canProceed = await assertWorkflowNotBlocked({ moduleKey: 'iit', entityType: 'iit_proposal', entityId: String(id) })
  if (!canProceed) {
    return res.status(409).json({ error: 'Workflow is blocked by a soft warning. Acknowledge before proceeding.' })
  }

  const { rows } = await query(
    `
      INSERT INTO ieg_iit_committee_votes
      (iit_proposal_id, voter_user_id, function_role, vote, comments)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [id, req.auth.userId, functionRole, vote, comments]
  )

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey: 'iit',
    entityType: 'iit_proposal',
    entityId: String(id),
    action: 'iit_committee_vote_added',
    metadata: rows[0]
  })

  return res.status(201).json({ vote: rows[0] })
})

router.get('/proposals/:id/committee-summary', async (req, res) => {
  const id = Number(req.params.id)
  const proposalResult = await query(`SELECT * FROM ieg_iit_proposals WHERE id = $1`, [id])
  const proposal = proposalResult.rows[0]
  if (!proposal) return res.status(404).json({ error: 'IIT proposal not found' })

  const matrix = await resolveApprovalMatrix({
    moduleKey: 'iit',
    requestType: 'standard_iit',
    geography: 'US',
    amount: Number(proposal.requested_amount || 0)
  })

  const requiredRoles = Array.isArray(matrix?.approver_chain)
    ? matrix.approver_chain.map((item) => item.role).filter(Boolean)
    : []

  const votesResult = await query(
    `
      SELECT function_role, vote, COUNT(*)::int AS count
      FROM ieg_iit_committee_votes
      WHERE iit_proposal_id = $1
      GROUP BY function_role, vote
      ORDER BY function_role, vote
    `,
    [id]
  )

  const receivedRolesResult = await query(
    `SELECT DISTINCT function_role FROM ieg_iit_committee_votes WHERE iit_proposal_id = $1`,
    [id]
  )
  const receivedRoles = new Set(receivedRolesResult.rows.map((row) => row.function_role))
  const pendingRoles = requiredRoles.filter((role) => !receivedRoles.has(role))

  return res.json({
    proposalId: id,
    approvalMatrixId: matrix?.id || null,
    requiredRoles,
    pendingRoles,
    votes: votesResult.rows
  })
})

router.get('/proposals/:id/fmv-reference', async (req, res) => {
  const id = Number(req.params.id)
  const { rows } = await query(`SELECT id, proposal_code, requested_amount, fmv_reference_value, fmv_warning, data FROM ieg_iit_proposals WHERE id = $1`, [id])
  if (!rows[0]) {
    return res.status(404).json({ error: 'IIT proposal not found' })
  }

  return res.json({
    proposalId: rows[0].id,
    proposalCode: rows[0].proposal_code,
    requestedAmount: rows[0].requested_amount,
    fmvReferenceValue: rows[0].fmv_reference_value,
    fmvWarning: rows[0].fmv_warning,
    fmvReference: rows[0].data?.fmvReference || null,
    fmvWarnings: rows[0].data?.fmvWarnings || []
  })
})

router.post('/proposals/:id/approve', async (req, res) => {
  const id = Number(req.params.id)
  const {
    decision,
    pendingRequirements = [],
    publicationRights = null,
    dataRights = null,
    signContract = true
  } = req.body || {}

  if (!decision) {
    return res.status(400).json({ error: 'decision is required' })
  }

  const canProceed = await assertWorkflowNotBlocked({ moduleKey: 'iit', entityType: 'iit_proposal', entityId: String(id) })
  if (!canProceed) {
    return res.status(409).json({ error: 'Workflow is blocked by a soft warning. Acknowledge before proceeding.' })
  }

  const { rows } = await query(
    `
      INSERT INTO ieg_iit_contracts
      (iit_proposal_id, decision, pending_requirements, publication_rights, data_rights, signed, signed_at)
      VALUES ($1, $2, $3::jsonb, $4, $5, $6, CASE WHEN $6 THEN NOW() ELSE NULL END)
      RETURNING *
    `,
    [id, decision, JSON.stringify(pendingRequirements), publicationRights, dataRights, Boolean(signContract)]
  )

  const nextStage = decision === 'conditional_approval' ? 'conditional_approval_pending_irb' : 'execution_monitoring'
  const status = decision === 'conditional_approval' ? 'conditional_approved' : 'approved'

  await query(`UPDATE ieg_iit_proposals SET current_stage = $1, status = $2 WHERE id = $3`, [nextStage, status, id])

  const actor = actorFromAuth(req.auth)
  await transitionState({
    moduleKey: 'iit',
    entityType: 'iit_proposal',
    entityId: String(id),
    toState: nextStage,
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    note: `Approval decision: ${decision}`
  })

  const operationsUsers = await usersAcrossRoles('iit', ['study_operations_manager', 'admin', 'superadmin'])
  for (const user of operationsUsers) {
    await createTask({
      moduleKey: 'iit',
      assignedUserId: user.id,
      entityType: 'iit_proposal',
      entityId: String(id),
      actionType: 'execution_monitoring',
      payload: { decision }
    })
  }

  await notifyUsers(
    operationsUsers,
    `IIT proposal ${id} moved to ${nextStage}`,
    'Contract and decision were recorded. Execution monitoring actions are now available.',
    { proposalId: id }
  )

  await logAudit({
    ...actor,
    moduleKey: 'iit',
    entityType: 'iit_proposal',
    entityId: String(id),
    action: 'iit_contract_created',
    metadata: rows[0]
  })

  return res.status(201).json({ contract: rows[0] })
})

router.post('/proposals/:id/milestones', async (req, res) => {
  const id = Number(req.params.id)
  const { milestones = [] } = req.body || {}

  const inserted = []
  for (const milestone of milestones) {
    const { rows } = await query(
      `
        INSERT INTO ieg_iit_milestones
        (iit_proposal_id, title, progress_report_url, protocol_deviation_notes, budget_utilization, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [
        id,
        milestone.title,
        milestone.progressReportUrl || null,
        milestone.protocolDeviationNotes || null,
        milestone.budgetUtilization || null,
        milestone.status || 'planned'
      ]
    )
    inserted.push(rows[0])
  }

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey: 'iit',
    entityType: 'iit_proposal',
    entityId: String(id),
    action: 'iit_milestones_updated',
    metadata: { milestones: inserted }
  })

  return res.status(201).json({ milestones: inserted })
})

router.post('/proposals/:id/publications', async (req, res) => {
  const id = Number(req.params.id)
  const { title, milestoneStatus } = req.body || {}
  if (!title || !milestoneStatus) {
    return res.status(400).json({ error: 'title and milestoneStatus are required' })
  }

  const { rows } = await query(
    `
      INSERT INTO ieg_iit_publications (iit_proposal_id, title, milestone_status)
      VALUES ($1, $2, $3)
      RETURNING *
    `,
    [id, title, milestoneStatus]
  )

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey: 'iit',
    entityType: 'iit_proposal',
    entityId: String(id),
    action: 'iit_publication_tracked',
    metadata: rows[0]
  })

  return res.status(201).json({ publication: rows[0] })
})

router.get('/proposals/:id/audit', async (req, res) => {
  const id = Number(req.params.id)
  const { rows } = await query(
    `
      SELECT *
      FROM ieg_audit_log
      WHERE module_key = 'iit' AND entity_type = 'iit_proposal' AND entity_id = $1
      ORDER BY occurred_at DESC
    `,
    [String(id)]
  )
  return res.json({ audit: rows })
})

module.exports = router
