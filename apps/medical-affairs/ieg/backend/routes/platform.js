const express = require('express')
const { query } = require('../database/db')
const { requireAuth, requireInternal } = require('../middleware/auth')
const { requireRoles } = require('../middleware/authorize')
const { actorFromAuth } = require('../utils/actor')
const { makeCode } = require('../utils/codes')
const { logAudit } = require('../services/auditService')
const { createTask } = require('../services/taskService')
const { transitionState } = require('../services/workflowService')
const { generateAiSummary, generateAiScore } = require('../services/aiLlmService')

const router = express.Router()
router.use(requireAuth, requireInternal)

function asNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function summarizeRecord(moduleKey, record) {
  if (moduleKey === 'grants') {
    return `Grant ${record.application_code}: ${record.applicant_name}, requested ${record.requested_amount} USD, stage ${record.current_stage}, status ${record.status}.`
  }
  if (moduleKey === 'iit') {
    return `IIT ${record.proposal_code}: investigator ${record.investigator_name}, support ${record.support_type}, requested ${record.requested_amount} USD, stage ${record.current_stage}.`
  }
  if (moduleKey === 'eap') {
    return `EAP ${record.request_code}: physician ${record.physician_name}, drug ${record.requested_drug}, urgency ${record.urgency_level}, pathway ${record.regulatory_pathway}.`
  }
  return `Summary not available for module ${moduleKey}.`
}

function scoreRecord(moduleKey, record) {
  let base = 75
  if (moduleKey === 'grants') {
    const amount = asNumber(record.requested_amount)
    if (amount > 400000) base -= 18
    if (String(record.current_stage).includes('warning')) base -= 10
  }
  if (moduleKey === 'iit') {
    const amount = asNumber(record.requested_amount)
    if (amount > 350000) base -= 15
    if (record.fmv_warning) base -= 12
  }
  if (moduleKey === 'eap') {
    if (record.emergency_flag) base += 8
    if (String(record.current_stage).includes('closed')) base -= 25
  }
  const recommendation = Math.max(0, Math.min(100, base))
  const confidence = Math.max(40, Math.min(96, 60 + Math.round((recommendation - 50) * 0.4)))
  return {
    recommendation,
    confidence,
    rationale: `Automated advisory score based on stage, risk markers, and requested amount for module ${moduleKey}. Human decision is mandatory.`
  }
}

async function fetchModuleRecord({ moduleKey, entityId }) {
  if (moduleKey === 'grants') {
    const { rows } = await query(`SELECT * FROM ieg_grant_applications WHERE id = $1`, [Number(entityId)])
    return rows[0] || null
  }
  if (moduleKey === 'iit') {
    const { rows } = await query(`SELECT * FROM ieg_iit_proposals WHERE id = $1`, [Number(entityId)])
    return rows[0] || null
  }
  if (moduleKey === 'eap') {
    const { rows } = await query(`SELECT * FROM ieg_eap_requests WHERE id = $1`, [Number(entityId)])
    return rows[0] || null
  }
  return null
}

router.post('/convert/iit-to-grant', requireRoles(['superadmin', 'admin']), async (req, res) => {
  const { iitProposalId, reason, applicantName = null } = req.body || {}
  if (!iitProposalId || !reason) {
    return res.status(400).json({ error: 'iitProposalId and reason are required' })
  }

  const iitResult = await query(`SELECT * FROM ieg_iit_proposals WHERE id = $1`, [Number(iitProposalId)])
  const iit = iitResult.rows[0]
  if (!iit) return res.status(404).json({ error: 'IIT proposal not found' })

  const appCode = makeCode('GRANT')
  const grantInsert = await query(
    `
      INSERT INTO ieg_grant_applications
      (external_user_id, application_code, applicant_type, applicant_name, country_code, requested_amount, status, current_stage, data)
      VALUES ($1, $2, 'institution', $3, 'US', $4, 'submitted', 'administrative_check', $5::jsonb)
      RETURNING *
    `,
    [
      iit.external_user_id,
      appCode,
      applicantName || iit.investigator_name,
      iit.requested_amount,
      JSON.stringify({ convertedFrom: { module: 'iit', proposalId: iit.id, proposalCode: iit.proposal_code, reason } })
    ]
  )

  await query(
    `
      UPDATE ieg_iit_proposals
      SET status = 'converted_to_grant',
          current_stage = 'closed_converted'
      WHERE id = $1
    `,
    [Number(iitProposalId)]
  )

  const conversion = await query(
    `
      INSERT INTO ieg_request_conversions
      (source_module, source_entity_type, source_entity_id, target_module, target_entity_type, target_entity_id, reason, converted_by)
      VALUES ('iit', 'iit_proposal', $1, 'grants', 'grant_application', $2, $3, $4)
      RETURNING *
    `,
    [String(iit.id), String(grantInsert.rows[0].id), reason, req.auth.userId]
  )

  const actor = actorFromAuth(req.auth)
  await transitionState({
    moduleKey: 'iit',
    entityType: 'iit_proposal',
    entityId: String(iit.id),
    toState: 'closed_converted',
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    note: `Converted to grant ${grantInsert.rows[0].application_code}`
  })

  await transitionState({
    moduleKey: 'grants',
    entityType: 'grant_application',
    entityId: String(grantInsert.rows[0].id),
    toState: 'administrative_check',
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    note: `Converted from IIT ${iit.proposal_code}`
  })

  await createTask({
    moduleKey: 'grants',
    assignedUserId: req.auth.userId,
    entityType: 'grant_application',
    entityId: String(grantInsert.rows[0].id),
    actionType: 'completeness_check',
    payload: { convertedFromIit: iit.id }
  })

  await logAudit({
    ...actor,
    moduleKey: 'iit',
    entityType: 'iit_proposal',
    entityId: String(iit.id),
    action: 'iit_converted_to_grant',
    metadata: { targetGrantId: grantInsert.rows[0].id, reason }
  })

  await logAudit({
    ...actor,
    moduleKey: 'grants',
    entityType: 'grant_application',
    entityId: String(grantInsert.rows[0].id),
    action: 'grant_created_from_iit_conversion',
    metadata: { sourceIitId: iit.id, reason }
  })

  return res.status(201).json({
    conversion: conversion.rows[0],
    sourceIit: { id: iit.id, proposalCode: iit.proposal_code },
    targetGrant: grantInsert.rows[0]
  })
})

router.post('/ai/summary', async (req, res) => {
  const { moduleKey, entityType, entityId } = req.body || {}
  if (!moduleKey || !entityType || !entityId) {
    return res.status(400).json({ error: 'moduleKey, entityType, entityId are required' })
  }

  const record = await fetchModuleRecord({ moduleKey, entityId })
  if (!record) return res.status(404).json({ error: 'Entity not found' })

  const aiRequest = await query(
    `
      INSERT INTO ieg_ai_requests (module_key, entity_type, entity_id, request_type, requested_by)
      VALUES ($1, $2, $3, 'summary', $4)
      RETURNING *
    `,
    [moduleKey, entityType, String(entityId), req.auth.userId]
  )

  const fallbackSummaryText = summarizeRecord(moduleKey, record)
  const aiResult = await generateAiSummary({
    moduleKey,
    entityType,
    entityId: String(entityId),
    record,
    fallbackText: fallbackSummaryText
  })

  const summaryText = aiResult.summaryText
  const summary = await query(
    `
      INSERT INTO ieg_ai_summaries
      (ai_request_id, module_key, entity_type, entity_id, summary_text, confidence_score, model_label)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
    [aiRequest.rows[0].id, moduleKey, entityType, String(entityId), summaryText, aiResult.confidenceScore, aiResult.modelLabel]
  )

  if (moduleKey === 'eap') {
    await query(`UPDATE ieg_eap_requests SET ai_summary = $1 WHERE id = $2`, [summaryText, Number(entityId)])
  }

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey,
    entityType,
    entityId: String(entityId),
    action: 'ai_summary_generated',
    metadata: {
      aiRequestId: aiRequest.rows[0].id,
      aiSummaryId: summary.rows[0].id,
      mode: aiResult.mode,
      warning: aiResult.warning || null
    }
  })

  return res.status(201).json({
    summary: summary.rows[0],
    sourceMode: aiResult.mode,
    disclaimer: 'AI-generated summary only. Final decision must be human-approved.'
  })
})

router.post('/ai/score', async (req, res) => {
  const { moduleKey, entityType, entityId } = req.body || {}
  if (!moduleKey || !entityType || !entityId) {
    return res.status(400).json({ error: 'moduleKey, entityType, entityId are required' })
  }

  const record = await fetchModuleRecord({ moduleKey, entityId })
  if (!record) return res.status(404).json({ error: 'Entity not found' })

  const aiRequest = await query(
    `
      INSERT INTO ieg_ai_requests (module_key, entity_type, entity_id, request_type, requested_by)
      VALUES ($1, $2, $3, 'recommendation_score', $4)
      RETURNING *
    `,
    [moduleKey, entityType, String(entityId), req.auth.userId]
  )

  const fallbackScore = scoreRecord(moduleKey, record)
  const aiResult = await generateAiScore({
    moduleKey,
    entityType,
    entityId: String(entityId),
    record,
    fallbackScore
  })

  const score = aiResult.score
  const scoreInsert = await query(
    `
      INSERT INTO ieg_ai_scores
      (ai_request_id, module_key, entity_type, entity_id, recommendation_score, confidence_score, rationale, human_override_required)
      VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
      RETURNING *
    `,
    [aiRequest.rows[0].id, moduleKey, entityType, String(entityId), score.recommendation, score.confidence, score.rationale]
  )

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey,
    entityType,
    entityId: String(entityId),
    action: 'ai_recommendation_generated',
    metadata: {
      aiRequestId: aiRequest.rows[0].id,
      aiScoreId: scoreInsert.rows[0].id,
      mode: aiResult.mode
    }
  })

  return res.status(201).json({
    score: scoreInsert.rows[0],
    sourceMode: aiResult.mode,
    disclaimer: 'AI decision support only. Human override is mandatory.'
  })
})

router.post('/compliance-overlay/rules', requireRoles(['superadmin', 'admin']), async (req, res) => {
  const { jurisdiction, moduleKey, ruleKey, severity, threshold = {}, message } = req.body || {}
  if (!jurisdiction || !moduleKey || !ruleKey || !severity || !message) {
    return res.status(400).json({ error: 'jurisdiction, moduleKey, ruleKey, severity, message are required' })
  }

  const { rows } = await query(
    `
      INSERT INTO ieg_compliance_overlay_rules
      (jurisdiction, module_key, rule_key, severity, threshold, message, created_by)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
      RETURNING *
    `,
    [jurisdiction, moduleKey, ruleKey, severity, JSON.stringify(threshold), message, req.auth.userId]
  )

  return res.status(201).json({ rule: rows[0] })
})

router.get('/compliance-overlay/rules', async (req, res) => {
  const { jurisdiction, moduleKey } = req.query
  const params = []
  const where = ['is_active = TRUE']
  if (jurisdiction) {
    params.push(jurisdiction)
    where.push(`jurisdiction = $${params.length}`)
  }
  if (moduleKey) {
    params.push(moduleKey)
    where.push(`module_key = $${params.length}`)
  }
  const { rows } = await query(
    `SELECT * FROM ieg_compliance_overlay_rules WHERE ${where.join(' AND ')} ORDER BY jurisdiction, module_key, rule_key`,
    params
  )
  return res.json({ rules: rows })
})

router.post('/compliance-overlay/evaluate', async (req, res) => {
  const { jurisdiction = 'US', moduleKey, requestedAmount = 0 } = req.body || {}
  if (!moduleKey) return res.status(400).json({ error: 'moduleKey is required' })

  const { rows } = await query(
    `
      SELECT *
      FROM ieg_compliance_overlay_rules
      WHERE jurisdiction = $1 AND module_key = $2 AND is_active = TRUE
      ORDER BY created_at DESC
    `,
    [jurisdiction, moduleKey]
  )

  const warnings = []
  for (const rule of rows) {
    const maxAmount = asNumber(rule.threshold?.maxAmountUSD, null)
    if (maxAmount !== null && asNumber(requestedAmount) > maxAmount) {
      warnings.push({
        ruleKey: rule.rule_key,
        severity: rule.severity,
        message: rule.message
      })
    }
  }

  return res.json({ jurisdiction, moduleKey, requestedAmount: asNumber(requestedAmount), warnings })
})

async function computePortfolioMetrics() {
  const [grants, iit, eap, grantDecisions] = await Promise.all([
    query(`SELECT status, COUNT(*) AS count FROM ieg_grant_applications GROUP BY status`),
    query(`SELECT status, COUNT(*) AS count FROM ieg_iit_proposals GROUP BY status`),
    query(`SELECT status, COUNT(*) AS count FROM ieg_eap_requests GROUP BY status`),
    query(`SELECT decision, COUNT(*) AS count FROM ieg_grant_decisions GROUP BY decision`)
  ])

  const totalGrantDecisions = grantDecisions.rows.reduce((sum, row) => sum + asNumber(row.count), 0)
  const approvedGrantDecisions = grantDecisions.rows
    .filter((row) => ['approved', 'partially_funded'].includes(row.decision))
    .reduce((sum, row) => sum + asNumber(row.count), 0)

  return {
    grantsByStatus: grants.rows,
    iitByStatus: iit.rows,
    eapByStatus: eap.rows,
    grantApprovalRatePercent: totalGrantDecisions === 0
      ? 0
      : Number(((approvedGrantDecisions / totalGrantDecisions) * 100).toFixed(2))
  }
}

router.get('/analytics/portfolio', async (_req, res) => {
  const metrics = await computePortfolioMetrics()
  return res.json({ metrics })
})

router.post('/analytics/snapshot', requireRoles(['superadmin', 'admin']), async (req, res) => {
  const { periodFrom = null, periodTo = null, snapshotType = 'portfolio' } = req.body || {}
  const metrics = await computePortfolioMetrics()
  const { rows } = await query(
    `
      INSERT INTO ieg_analytics_snapshots (snapshot_type, period_from, period_to, metric_payload, generated_by)
      VALUES ($1, $2, $3, $4::jsonb, $5)
      RETURNING *
    `,
    [snapshotType, periodFrom, periodTo, JSON.stringify(metrics), req.auth.userId]
  )
  return res.status(201).json({ snapshot: rows[0] })
})

router.post('/policies/rules', requireRoles(['superadmin', 'admin']), async (req, res) => {
  const { moduleKey, policyType, policyKey, configPayload = {}, actions = [] } = req.body || {}
  if (!moduleKey || !policyType || !policyKey) {
    return res.status(400).json({ error: 'moduleKey, policyType, policyKey are required' })
  }

  const existing = await query(
    `SELECT * FROM ieg_policy_rules WHERE module_key = $1 AND policy_type = $2 AND policy_key = $3`,
    [moduleKey, policyType, policyKey]
  )

  let rule
  if (existing.rows[0]) {
    const updated = await query(
      `
        UPDATE ieg_policy_rules
        SET config_payload = $1::jsonb,
            is_active = TRUE
        WHERE id = $2
        RETURNING *
      `,
      [JSON.stringify(configPayload), existing.rows[0].id]
    )
    rule = updated.rows[0]
  } else {
    const inserted = await query(
      `
        INSERT INTO ieg_policy_rules (module_key, policy_type, policy_key, config_payload, created_by)
        VALUES ($1, $2, $3, $4::jsonb, $5)
        RETURNING *
      `,
      [moduleKey, policyType, policyKey, JSON.stringify(configPayload), req.auth.userId]
    )
    rule = inserted.rows[0]
  }

  await query(`DELETE FROM ieg_policy_actions WHERE policy_rule_id = $1`, [rule.id])
  for (const action of actions) {
    await query(
      `
        INSERT INTO ieg_policy_actions (policy_rule_id, action_type, action_payload)
        VALUES ($1, $2, $3::jsonb)
      `,
      [rule.id, action.actionType || 'notify', JSON.stringify(action.payload || {})]
    )
  }

  const actionRows = await query(`SELECT * FROM ieg_policy_actions WHERE policy_rule_id = $1 ORDER BY id ASC`, [rule.id])
  return res.status(201).json({ rule, actions: actionRows.rows })
})

router.get('/policies/rules', async (req, res) => {
  const moduleKey = req.query.moduleKey
  const params = []
  let where = ''
  if (moduleKey) {
    params.push(moduleKey)
    where = `WHERE module_key = $${params.length}`
  }

  const rules = await query(`SELECT * FROM ieg_policy_rules ${where} ORDER BY created_at DESC`, params)
  const byRuleId = new Map()
  for (const rule of rules.rows) {
    byRuleId.set(Number(rule.id), [])
  }

  const actions = await query(`SELECT * FROM ieg_policy_actions ORDER BY id ASC`)
  for (const action of actions.rows) {
    const id = Number(action.policy_rule_id)
    if (byRuleId.has(id)) {
      byRuleId.get(id).push(action)
    }
  }

  return res.json({
    rules: rules.rows.map((rule) => ({
      ...rule,
      actions: byRuleId.get(Number(rule.id)) || []
    }))
  })
})

router.post('/policies/evaluate', async (req, res) => {
  const { moduleKey, entityType, entityId, policyType, signalValue = 0 } = req.body || {}
  if (!moduleKey || !entityType || !entityId || !policyType) {
    return res.status(400).json({ error: 'moduleKey, entityType, entityId, policyType are required' })
  }

  const rules = await query(
    `
      SELECT *
      FROM ieg_policy_rules
      WHERE module_key = $1 AND policy_type = $2 AND is_active = TRUE
      ORDER BY created_at DESC
    `,
    [moduleKey, policyType]
  )

  const results = []
  for (const rule of rules.rows) {
    const threshold = asNumber(rule.config_payload?.threshold, 0)
    const triggered = asNumber(signalValue) >= threshold
    const event = await query(
      `
        INSERT INTO ieg_policy_events (policy_rule_id, module_key, entity_type, entity_id, event_status, details)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        RETURNING *
      `,
      [rule.id, moduleKey, entityType, String(entityId), triggered ? 'triggered' : 'not_triggered', JSON.stringify({ signalValue, threshold })]
    )
    results.push(event.rows[0])
  }

  return res.status(201).json({ events: results })
})

module.exports = router
