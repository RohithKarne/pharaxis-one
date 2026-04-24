'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');
const {
  normalizeContentType,
  normalizeMode,
  compileEvidenceChain,
  listEvidenceRuns,
  runContradictionScan,
  listContradictionFindings,
  simulateDigitalTwinRelease,
  listDigitalTwinRuns,
  listAdaptiveRiskRules,
  evaluateAdaptiveRisk,
  listAdaptiveRiskDecisions,
} = require('../../services/contentIntelligenceService');

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseJson(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function isSuperadmin(req) {
  return req.user?.role === 'superadmin';
}

function resolveScopedOrgId(req, providedOrgId) {
  if (!isSuperadmin(req)) {
    return parsePositiveInt(req.user?.orgId);
  }
  return parsePositiveInt(providedOrgId);
}

async function writeAudit(req, action, entity, entityId, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user?.userId || null,
        req.user?.email || 'system',
        action,
        entity,
        entityId || null,
        JSON.stringify(details || {}),
      ]
    );
  } catch (_) {
    // best effort
  }
}

function validateEvidenceRulePayload(body = {}) {
  const ruleName = String(body.rule_name || '').trim();
  const appliesTo = String(body.applies_to || 'all').trim().toLowerCase();
  const modeScope = String(body.mode_scope || 'both').trim().toLowerCase();
  const checkType = String(body.check_type || '').trim().toLowerCase();
  const checkConfig = typeof body.check_config === 'object' && body.check_config !== null
    ? body.check_config
    : parseJson(body.check_config, {});
  const severity = String(body.severity || 'block').trim().toLowerCase();
  const priority = Number.isInteger(Number(body.priority)) ? Number(body.priority) : 100;
  const isActive = body.is_active === undefined ? 1 : (body.is_active ? 1 : 0);

  const allowedAppliesTo = new Set(['all', 'document', 'faq', 'template', 'module']);
  const allowedModeScope = new Set(['publish', 'response', 'both', 'release']);
  const allowedCheckType = new Set([
    'status_in',
    'not_expired',
    'min_content_length',
    'min_attachment_count',
    'min_reference_count',
    'max_open_contradictions',
  ]);
  const allowedSeverity = new Set(['block', 'warning']);

  if (!ruleName) return { ok: false, error: 'rule_name is required.' };
  if (!allowedAppliesTo.has(appliesTo)) return { ok: false, error: 'applies_to must be all, document, faq, template, or module.' };
  if (!allowedModeScope.has(modeScope)) return { ok: false, error: 'mode_scope must be publish, response, release, or both.' };
  if (!allowedCheckType.has(checkType)) return { ok: false, error: 'Invalid check_type.' };
  if (!allowedSeverity.has(severity)) return { ok: false, error: 'severity must be block or warning.' };

  return {
    ok: true,
    payload: {
      rule_name: ruleName,
      applies_to: appliesTo,
      mode_scope: modeScope,
      check_type: checkType,
      check_config: checkConfig || {},
      severity,
      priority,
      is_active: isActive,
    },
  };
}

router.get('/evidence-chain/rules', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.query.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const [rows] = await pool.execute(
      `SELECT id, org_id, rule_name, applies_to, mode_scope, check_type, check_config, severity, priority, is_active, created_at, updated_at
         FROM evidence_chain_rules
        WHERE org_id = ?
        ORDER BY priority ASC, id ASC`,
      [scopedOrgId]
    );

    res.json({
      org_id: scopedOrgId,
      rules: rows.map((row) => ({ ...row, check_config: parseJson(row.check_config, {}) })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load evidence chain rules.' });
  }
});

router.post('/evidence-chain/rules', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.body.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const validated = validateEvidenceRulePayload(req.body || {});
    if (!validated.ok) return res.status(400).json({ error: validated.error });

    const { payload } = validated;
    const [insert] = await pool.execute(
      `INSERT INTO evidence_chain_rules
        (org_id, rule_name, applies_to, mode_scope, check_type, check_config, severity, priority, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        scopedOrgId,
        payload.rule_name,
        payload.applies_to,
        payload.mode_scope,
        payload.check_type,
        JSON.stringify(payload.check_config),
        payload.severity,
        payload.priority,
        payload.is_active,
        req.user.userId,
        req.user.userId,
      ]
    );

    await writeAudit(req, 'CREATE', 'evidence_chain_rule', insert.insertId, {
      org_id: scopedOrgId,
      ...payload,
    });

    res.status(201).json({
      id: insert.insertId,
      org_id: scopedOrgId,
      ...payload,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create evidence chain rule.' });
  }
});

router.put('/evidence-chain/rules/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.body.org_id ?? req.query.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const ruleId = parsePositiveInt(req.params.id);
    if (!ruleId) return res.status(400).json({ error: 'Valid rule id is required.' });

    const validated = validateEvidenceRulePayload(req.body || {});
    if (!validated.ok) return res.status(400).json({ error: validated.error });

    const { payload } = validated;

    const [result] = await pool.execute(
      `UPDATE evidence_chain_rules
          SET rule_name = ?,
              applies_to = ?,
              mode_scope = ?,
              check_type = ?,
              check_config = ?,
              severity = ?,
              priority = ?,
              is_active = ?,
              updated_by = ?,
              updated_at = NOW()
        WHERE id = ?
          AND org_id = ?`,
      [
        payload.rule_name,
        payload.applies_to,
        payload.mode_scope,
        payload.check_type,
        JSON.stringify(payload.check_config),
        payload.severity,
        payload.priority,
        payload.is_active,
        req.user.userId,
        ruleId,
        scopedOrgId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Rule not found in organisation scope.' });
    }

    await writeAudit(req, 'UPDATE', 'evidence_chain_rule', ruleId, {
      org_id: scopedOrgId,
      ...payload,
    });

    res.json({ id: ruleId, org_id: scopedOrgId, ...payload });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update evidence chain rule.' });
  }
});

router.post('/evidence-chain/compile', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.body.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const contentType = normalizeContentType(req.body.content_type);
    const contentId = parsePositiveInt(req.body.content_id);
    const mode = normalizeMode(req.body.mode || 'publish');

    if (!contentType) return res.status(400).json({ error: 'content_type must be document, faq, template, or module.' });
    if (!contentId) return res.status(400).json({ error: 'Valid content_id is required.' });
    if (!mode) return res.status(400).json({ error: 'mode must be publish, response, or release.' });

    const compiled = await compileEvidenceChain({
      orgId: scopedOrgId,
      contentType,
      contentId,
      mode,
      requestedBy: req.user.userId,
      metadata: req.body.metadata || {},
    });

    res.status(compiled.allow ? 200 : 422).json(compiled);
  } catch (err) {
    res.status(500).json({ error: 'Failed to compile evidence chain.' });
  }
});

router.get('/evidence-chain/runs', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.query.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });
    const runs = await listEvidenceRuns({ orgId: scopedOrgId, limit: req.query.limit });
    res.json({ org_id: scopedOrgId, runs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch evidence chain runs.' });
  }
});

router.post('/contradiction-radar/scan', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.body.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const report = await runContradictionScan({
      orgId: scopedOrgId,
      minTokenOverlap: req.body.min_token_overlap,
      limit: req.body.limit,
      includeNonPublished: Boolean(req.body.include_non_published),
      requestedBy: req.user.userId,
    });

    await writeAudit(req, 'SCAN', 'contradiction_radar', null, {
      org_id: scopedOrgId,
      generated_findings: report.generated_findings,
      scanned_sources: report.scanned_sources,
    });

    res.json({ org_id: scopedOrgId, ...report });
  } catch (err) {
    res.status(500).json({ error: 'Failed to run contradiction radar scan.' });
  }
});

router.get('/contradiction-radar/findings', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.query.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const findings = await listContradictionFindings({
      orgId: scopedOrgId,
      status: String(req.query.status || 'open').toLowerCase(),
      limit: req.query.limit,
    });

    res.json({ org_id: scopedOrgId, findings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch contradiction findings.' });
  }
});

router.put('/contradiction-radar/findings/:id/status', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.body.org_id ?? req.query.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const findingId = parsePositiveInt(req.params.id);
    if (!findingId) return res.status(400).json({ error: 'Valid finding id is required.' });

    const status = String(req.body.status || '').trim().toLowerCase();
    const allowedStatus = new Set(['open', 'acknowledged', 'dismissed', 'resolved']);
    if (!allowedStatus.has(status)) return res.status(400).json({ error: 'status must be open, acknowledged, dismissed, or resolved.' });

    const resolutionNote = String(req.body.resolution_note || '').trim() || null;
    const isResolved = status === 'resolved' || status === 'dismissed';

    const [result] = await pool.execute(
      `UPDATE contradiction_radar_findings
          SET status = ?,
              resolution_note = ?,
              resolved_by = ?,
              resolved_at = ${isResolved ? 'NOW()' : 'NULL'}
        WHERE id = ?
          AND org_id = ?`,
      [status, resolutionNote, isResolved ? req.user.userId : null, findingId, scopedOrgId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Finding not found in organisation scope.' });
    }

    await writeAudit(req, 'STATUS_CHANGE', 'contradiction_finding', findingId, {
      org_id: scopedOrgId,
      status,
      resolution_note: resolutionNote,
    });

    res.json({ id: findingId, org_id: scopedOrgId, status, resolution_note: resolutionNote });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update contradiction finding status.' });
  }
});

router.post('/digital-twin/simulate', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.body.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const simulation = await simulateDigitalTwinRelease({
      orgId: scopedOrgId,
      scenarioName: req.body.scenario_name,
      changes: req.body.changes,
      context: req.body.context,
      simulatedBy: req.user.userId,
    });

    await writeAudit(req, 'SIMULATE', 'digital_twin_release', simulation.run_id, {
      org_id: scopedOrgId,
      scenario_name: simulation.scenario_name,
      risk_score: simulation.metrics?.risk_score,
      recommended_gate: simulation.metrics?.recommended_gate,
    });

    res.json({ org_id: scopedOrgId, ...simulation });
  } catch (err) {
    res.status(500).json({ error: 'Failed to run digital twin simulation.' });
  }
});

router.get('/digital-twin/runs', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.query.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const runs = await listDigitalTwinRuns({ orgId: scopedOrgId, limit: req.query.limit });
    res.json({ org_id: scopedOrgId, runs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch digital twin runs.' });
  }
});

router.get('/adaptive-risk/rules', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.query.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const rules = await listAdaptiveRiskRules(scopedOrgId);
    res.json({ org_id: scopedOrgId, rules });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch adaptive risk rules.' });
  }
});

router.post('/adaptive-risk/rules', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.body.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const ruleName = String(req.body.rule_name || '').trim();
    const minScore = Number.isInteger(Number(req.body.min_score)) ? Number(req.body.min_score) : null;
    const maxScore = Number.isInteger(Number(req.body.max_score)) ? Number(req.body.max_score) : null;
    const decisionAction = String(req.body.decision_action || '').trim().toLowerCase();
    const escalationRole = String(req.body.escalation_role || 'manager').trim().toLowerCase();
    const slaHours = Number.isInteger(Number(req.body.sla_hours)) ? Number(req.body.sla_hours) : 12;
    const priority = Number.isInteger(Number(req.body.priority)) ? Number(req.body.priority) : 100;
    const isActive = req.body.is_active === undefined ? 1 : (req.body.is_active ? 1 : 0);

    const allowedActions = new Set(['auto_approve', 'manager_review', 'medical_review', 'compliance_escalation', 'block_release']);
    if (!ruleName) return res.status(400).json({ error: 'rule_name is required.' });
    if (!Number.isInteger(minScore)) return res.status(400).json({ error: 'min_score must be a valid integer.' });
    if (!Number.isInteger(maxScore)) return res.status(400).json({ error: 'max_score must be a valid integer.' });
    if (maxScore < minScore) return res.status(400).json({ error: 'max_score must be >= min_score.' });
    if (!allowedActions.has(decisionAction)) return res.status(400).json({ error: 'Invalid decision_action.' });

    const [insert] = await pool.execute(
      `INSERT INTO adaptive_risk_rules
        (org_id, rule_name, min_score, max_score, decision_action, escalation_role, sla_hours, priority, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        scopedOrgId,
        ruleName,
        minScore,
        maxScore,
        decisionAction,
        escalationRole,
        slaHours,
        priority,
        isActive,
        req.user.userId,
        req.user.userId,
      ]
    );

    await writeAudit(req, 'CREATE', 'adaptive_risk_rule', insert.insertId, {
      org_id: scopedOrgId,
      rule_name: ruleName,
      min_score: minScore,
      max_score: maxScore,
      decision_action: decisionAction,
      escalation_role: escalationRole,
      sla_hours: slaHours,
      priority,
      is_active: isActive,
    });

    res.status(201).json({
      id: insert.insertId,
      org_id: scopedOrgId,
      rule_name: ruleName,
      min_score: minScore,
      max_score: maxScore,
      decision_action: decisionAction,
      escalation_role: escalationRole,
      sla_hours: slaHours,
      priority,
      is_active: isActive,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create adaptive risk rule.' });
  }
});

router.put('/adaptive-risk/rules/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.body.org_id ?? req.query.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const ruleId = parsePositiveInt(req.params.id);
    if (!ruleId) return res.status(400).json({ error: 'Valid rule id is required.' });

    const ruleName = String(req.body.rule_name || '').trim();
    const minScore = Number.isInteger(Number(req.body.min_score)) ? Number(req.body.min_score) : null;
    const maxScore = Number.isInteger(Number(req.body.max_score)) ? Number(req.body.max_score) : null;
    const decisionAction = String(req.body.decision_action || '').trim().toLowerCase();
    const escalationRole = String(req.body.escalation_role || 'manager').trim().toLowerCase();
    const slaHours = Number.isInteger(Number(req.body.sla_hours)) ? Number(req.body.sla_hours) : 12;
    const priority = Number.isInteger(Number(req.body.priority)) ? Number(req.body.priority) : 100;
    const isActive = req.body.is_active === undefined ? 1 : (req.body.is_active ? 1 : 0);

    const allowedActions = new Set(['auto_approve', 'manager_review', 'medical_review', 'compliance_escalation', 'block_release']);
    if (!ruleName) return res.status(400).json({ error: 'rule_name is required.' });
    if (!Number.isInteger(minScore) || !Number.isInteger(maxScore)) return res.status(400).json({ error: 'min_score and max_score must be integers.' });
    if (maxScore < minScore) return res.status(400).json({ error: 'max_score must be >= min_score.' });
    if (!allowedActions.has(decisionAction)) return res.status(400).json({ error: 'Invalid decision_action.' });

    const [result] = await pool.execute(
      `UPDATE adaptive_risk_rules
          SET rule_name = ?,
              min_score = ?,
              max_score = ?,
              decision_action = ?,
              escalation_role = ?,
              sla_hours = ?,
              priority = ?,
              is_active = ?,
              updated_by = ?,
              updated_at = NOW()
        WHERE id = ?
          AND org_id = ?`,
      [
        ruleName,
        minScore,
        maxScore,
        decisionAction,
        escalationRole,
        slaHours,
        priority,
        isActive,
        req.user.userId,
        ruleId,
        scopedOrgId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Adaptive risk rule not found in organisation scope.' });
    }

    await writeAudit(req, 'UPDATE', 'adaptive_risk_rule', ruleId, {
      org_id: scopedOrgId,
      rule_name: ruleName,
      min_score: minScore,
      max_score: maxScore,
      decision_action: decisionAction,
      escalation_role: escalationRole,
      sla_hours: slaHours,
      priority,
      is_active: isActive,
    });

    res.json({
      id: ruleId,
      org_id: scopedOrgId,
      rule_name: ruleName,
      min_score: minScore,
      max_score: maxScore,
      decision_action: decisionAction,
      escalation_role: escalationRole,
      sla_hours: slaHours,
      priority,
      is_active: isActive,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update adaptive risk rule.' });
  }
});

router.post('/adaptive-risk/evaluate', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.body.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const decision = await evaluateAdaptiveRisk({
      orgId: scopedOrgId,
      contextType: req.body.context_type,
      contextId: req.body.context_id,
      context: req.body.context || {},
      decidedBy: req.user.userId,
    });

    await writeAudit(req, 'EVALUATE', 'adaptive_risk_decision', decision.decision_id, {
      org_id: scopedOrgId,
      context_type: req.body.context_type || 'release',
      context_id: req.body.context_id || null,
      decision_action: decision.decision_action,
      computed_score: decision.computed_score,
    });

    res.json({ org_id: scopedOrgId, ...decision });
  } catch (err) {
    res.status(500).json({ error: 'Failed to evaluate adaptive risk workflow.' });
  }
});

router.get('/adaptive-risk/decisions', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const scopedOrgId = resolveScopedOrgId(req, req.query.org_id);
    if (!scopedOrgId) return res.status(400).json({ error: 'org_id is required for superadmin scope.' });

    const decisions = await listAdaptiveRiskDecisions({ orgId: scopedOrgId, limit: req.query.limit });
    res.json({ org_id: scopedOrgId, decisions });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch adaptive risk decisions.' });
  }
});

module.exports = router;
