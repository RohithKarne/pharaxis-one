const express = require('express')
const { query } = require('../database/db')
const { requireAuth, requireExternal } = require('../middleware/auth')
const { makeCode } = require('../utils/codes')
const { transitionState } = require('../services/workflowService')
const { createTask } = require('../services/taskService')
const { queueInApp, queueEmail } = require('../services/notificationService')
const { logAudit } = require('../services/auditService')

const router = express.Router()
router.use(requireAuth, requireExternal)

function hasModuleAccess(req, moduleKey) {
  const modules = Array.isArray(req.auth?.modules) ? req.auth.modules : []
  return modules.includes(moduleKey)
}

router.post('/grants/submit', async (req, res) => {
  if (!hasModuleAccess(req, 'grants')) {
    return res.status(403).json({ error: 'External account is not enabled for grants' })
  }

  const {
    programId = null,
    applicantType,
    applicantName,
    countryCode = 'US',
    requestedAmount,
    payload = {}
  } = req.body || {}

  if (!applicantType || !applicantName || !requestedAmount) {
    return res.status(400).json({ error: 'applicantType, applicantName, requestedAmount are required' })
  }
  if (!Array.isArray(payload.documents) || payload.documents.length === 0) {
    return res.status(400).json({ error: 'payload.documents with at least one document is required' })
  }

  const applicationCode = makeCode('GRANT')
  const { rows } = await query(
    `
      INSERT INTO ieg_grant_applications
      (external_user_id, program_id, application_code, applicant_type, applicant_name, country_code, requested_amount, data)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING *
    `,
    [req.auth.userId, programId, applicationCode, applicantType, applicantName, countryCode, requestedAmount, JSON.stringify(payload)]
  )

  const app = rows[0]

  await transitionState({
    moduleKey: 'grants',
    entityType: 'grant_application',
    entityId: String(app.id),
    toState: 'administrative_check',
    actorType: 'external',
    actorId: String(req.auth.userId),
    actorLabel: req.auth.displayName,
    note: 'Grant application submitted'
  })

  const intakeUsers = await query(
    `
      SELECT u.id
      FROM ieg_users u
      INNER JOIN ieg_user_modules um ON um.user_id = u.id AND um.module_key = 'grants'
      WHERE u.role IN ('intake_coordinator', 'admin', 'superadmin')
      ORDER BY u.id ASC
      LIMIT 3
    `
  )

  for (const user of intakeUsers.rows) {
    await createTask({
      moduleKey: 'grants',
      assignedUserId: user.id,
      entityType: 'grant_application',
      entityId: String(app.id),
      actionType: 'completeness_check',
      payload: { applicationCode }
    })

    await queueInApp({
      recipientUserId: user.id,
      title: `New grant application ${applicationCode}`,
      body: 'A new grant submission requires completeness check.',
      templateKey: 'grant_submission_received',
      context: { applicationId: app.id }
    })
  }

  await queueEmail({
    recipientExternalUserId: req.auth.userId,
    templateKey: 'grant_submission_confirmed',
    title: `Grant application ${applicationCode} submitted`,
    body: 'Your grant application has been submitted and entered intake review.',
    context: { applicationId: app.id }
  })

  await logAudit({
    actorType: 'external',
    actorId: String(req.auth.userId),
    actorLabel: req.auth.displayName,
    moduleKey: 'grants',
    entityType: 'grant_application',
    entityId: String(app.id),
    action: 'grant_application_submitted',
    metadata: { applicationCode, requestedAmount }
  })

  return res.status(201).json({ application: app })
})

router.post('/iit/submit', async (req, res) => {
  if (!hasModuleAccess(req, 'iit')) {
    return res.status(403).json({ error: 'External account is not enabled for IIT' })
  }

  const { investigatorName, institutionName = null, supportType, requestedAmount, payload = {} } = req.body || {}
  if (!investigatorName || !supportType || !requestedAmount) {
    return res.status(400).json({ error: 'investigatorName, supportType, requestedAmount are required' })
  }
  if (!payload.piCvDocument || !payload.protocolSynopsis || !payload.budgetSummary) {
    return res.status(400).json({ error: 'payload.piCvDocument, payload.protocolSynopsis and payload.budgetSummary are required' })
  }

  const proposalCode = makeCode('IIT')
  const { rows } = await query(
    `
      INSERT INTO ieg_iit_proposals
      (external_user_id, proposal_code, investigator_name, institution_name, support_type, requested_amount, data)
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING *
    `,
    [req.auth.userId, proposalCode, investigatorName, institutionName, supportType, requestedAmount, JSON.stringify(payload)]
  )

  const proposal = rows[0]

  await transitionState({
    moduleKey: 'iit',
    entityType: 'iit_proposal',
    entityId: String(proposal.id),
    toState: 'scientific_triage',
    actorType: 'external',
    actorId: String(req.auth.userId),
    actorLabel: req.auth.displayName,
    note: 'IIT proposal submitted'
  })

  const triageUsers = await query(
    `
      SELECT u.id
      FROM ieg_users u
      INNER JOIN ieg_user_modules um ON um.user_id = u.id AND um.module_key = 'iit'
      WHERE u.role IN ('medical_reviewer', 'admin', 'superadmin')
      ORDER BY u.id ASC
      LIMIT 3
    `
  )

  for (const user of triageUsers.rows) {
    await createTask({
      moduleKey: 'iit',
      assignedUserId: user.id,
      entityType: 'iit_proposal',
      entityId: String(proposal.id),
      actionType: 'scientific_triage',
      payload: { proposalCode }
    })

    await queueInApp({
      recipientUserId: user.id,
      title: `New IIT proposal ${proposalCode}`,
      body: 'A new IIT submission requires triage review.',
      templateKey: 'iit_submission_received',
      context: { proposalId: proposal.id }
    })
  }

  await queueEmail({
    recipientExternalUserId: req.auth.userId,
    templateKey: 'iit_submission_confirmed',
    title: `IIT proposal ${proposalCode} submitted`,
    body: 'Your IIT proposal has been submitted and entered triage review.',
    context: { proposalId: proposal.id }
  })

  await logAudit({
    actorType: 'external',
    actorId: String(req.auth.userId),
    actorLabel: req.auth.displayName,
    moduleKey: 'iit',
    entityType: 'iit_proposal',
    entityId: String(proposal.id),
    action: 'iit_proposal_submitted',
    metadata: { proposalCode, supportType, requestedAmount }
  })

  return res.status(201).json({ proposal })
})

router.post('/eap/submit', async (req, res) => {
  if (!hasModuleAccess(req, 'eap')) {
    return res.status(403).json({ error: 'External account is not enabled for EAP' })
  }

  const {
    physicianName,
    physicianEmail,
    institutionName = null,
    requestedDrug,
    conditionCategory,
    urgencyLevel = 'standard',
    emergencyFlag = false,
    payload = {}
  } = req.body || {}

  if (!physicianName || !physicianEmail || !requestedDrug || !conditionCategory) {
    return res.status(400).json({
      error: 'physicianName, physicianEmail, requestedDrug, conditionCategory are required'
    })
  }

  const requestCode = makeCode('EAP')
  const { rows } = await query(
    `
      INSERT INTO ieg_eap_requests
      (
        request_code,
        external_user_id,
        physician_name,
        physician_email,
        institution_name,
        requested_drug,
        condition_category,
        urgency_level,
        emergency_flag,
        regulatory_pathway,
        status,
        current_stage,
        payload
      )
      VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'individual_patient_ind', 'submitted', 'intake_review', $10::jsonb)
      RETURNING *
    `,
    [
      requestCode,
      req.auth.userId,
      physicianName,
      physicianEmail.toLowerCase().trim(),
      institutionName,
      requestedDrug,
      conditionCategory,
      urgencyLevel,
      emergencyFlag ? 1 : 0,
      JSON.stringify(payload)
    ]
  )

  const request = rows[0]
  const initialState = emergencyFlag ? 'emergency_fast_track' : 'intake_review'
  await transitionState({
    moduleKey: 'eap',
    entityType: 'eap_request',
    entityId: String(request.id),
    toState: initialState,
    actorType: 'external',
    actorId: String(req.auth.userId),
    actorLabel: req.auth.displayName,
    note: emergencyFlag ? 'Emergency EAP request submitted' : 'EAP request submitted'
  })

  const intakeUsers = await query(
    `
      SELECT u.id
      FROM ieg_users u
      INNER JOIN ieg_user_modules um ON um.user_id = u.id AND um.module_key = 'eap'
      WHERE u.role IN ('medical_reviewer', 'compliance_reviewer', 'admin', 'superadmin')
      ORDER BY u.id ASC
      LIMIT 5
    `
  )

  for (const user of intakeUsers.rows) {
    await createTask({
      moduleKey: 'eap',
      assignedUserId: user.id,
      entityType: 'eap_request',
      entityId: String(request.id),
      actionType: emergencyFlag ? 'emergency_intake' : 'intake_review',
      payload: {
        requestCode,
        urgencyLevel,
        emergencyFlag: Boolean(emergencyFlag)
      }
    })

    await queueInApp({
      recipientUserId: user.id,
      title: emergencyFlag ? `Emergency EAP ${requestCode}` : `New EAP ${requestCode}`,
      body: emergencyFlag
        ? 'Emergency pathway requested. Immediate review required.'
        : 'New EAP request submitted for intake review.',
      templateKey: emergencyFlag ? 'eap_emergency_submission_received' : 'eap_submission_received',
      context: { eapRequestId: request.id }
    })
  }

  await queueEmail({
    recipientExternalUserId: req.auth.userId,
    templateKey: emergencyFlag ? 'eap_emergency_submission_confirmed' : 'eap_submission_confirmed',
    title: emergencyFlag ? `Emergency EAP ${requestCode} submitted` : `EAP ${requestCode} submitted`,
    body: emergencyFlag
      ? 'Emergency EAP request submitted successfully. Team escalation has been triggered.'
      : 'Your EAP request has been submitted and entered intake review.',
    context: { eapRequestId: request.id, emergencyFlag: Boolean(emergencyFlag) }
  })

  await logAudit({
    actorType: 'external',
    actorId: String(req.auth.userId),
    actorLabel: req.auth.displayName,
    moduleKey: 'eap',
    entityType: 'eap_request',
    entityId: String(request.id),
    action: emergencyFlag ? 'eap_emergency_request_submitted' : 'eap_request_submitted',
    metadata: {
      requestCode,
      requestedDrug,
      conditionCategory,
      urgencyLevel,
      emergencyFlag: Boolean(emergencyFlag)
    }
  })

  return res.status(201).json({ request })
})

router.get('/my-submissions', async (req, res) => {
  const [grants, iit, eap] = await Promise.all([
    query(`SELECT id, application_code AS code, status, current_stage, created_at, 'grants' AS module_key FROM ieg_grant_applications WHERE external_user_id = $1 ORDER BY created_at DESC`, [req.auth.userId]),
    query(`SELECT id, proposal_code AS code, status, current_stage, created_at, 'iit' AS module_key FROM ieg_iit_proposals WHERE external_user_id = $1 ORDER BY created_at DESC`, [req.auth.userId]),
    query(`SELECT id, request_code AS code, status, current_stage, created_at, 'eap' AS module_key FROM ieg_eap_requests WHERE external_user_id = $1 ORDER BY created_at DESC`, [req.auth.userId])
  ])

  return res.json({
    submissions: [...grants.rows, ...iit.rows, ...eap.rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  })
})

module.exports = router
