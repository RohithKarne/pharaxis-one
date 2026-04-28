'use strict';

/**
 * qaRulesEngine.js — Internal QA Rules Engine (Sprint 15)
 *
 * Stateless evaluator: input = case payload + org_id
 * → pulls active org rules from org_qa_rules (falls back to qa_knowledge_base defaults)
 * → evaluates each rule against the case payload
 * → returns structured flag array + quality score
 * → caller stores result to ai_qa_responses
 *
 * No external API calls. Fully internal. Regulator-friendly and explainable.
 */

const pool = require('../database/db');
const { seedKnowledgeBase } = require('./qaKnowledgeBaseSeed');

// ── Quality score: start 100, deduct per flag severity ────────────────────
const SEVERITY_DEDUCTION = { critical: 20, warning: 10 };

// ── Placeholder text patterns ─────────────────────────────────────────────
const PLACEHOLDER_PATTERNS = ['tbd', 'n/a', 'to be updated', 'pending', 'fill later', 'see attachment'];

let _seeded = false;

async function ensureSeeded() {
  if (_seeded) return;
  try {
    await seedKnowledgeBase(pool);
    _seeded = true;
  } catch (err) {
    console.error('[QA Engine] Knowledge base seed failed:', err.message);
  }
}

// ── Seed default org rules from knowledge base if org has none ────────────
async function ensureOrgRules(orgId) {
  await ensureSeeded(); // guarantee qa_knowledge_base is populated first

  const [existing] = await pool.execute(
    'SELECT COUNT(*) as cnt FROM org_qa_rules WHERE org_id = ?',
    [orgId]
  );
  if (existing[0].cnt > 0) return;

  const [seeds] = await pool.execute(
    'SELECT * FROM qa_knowledge_base WHERE is_seed = 1'
  );

  for (const s of seeds) {
    await pool.execute(
      `INSERT IGNORE INTO org_qa_rules
         (org_id, rule_key, rule_name, rule_type, case_types, target_field,
          condition_json, severity, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        orgId, s.kb_key, s.title, s.rule_type,
        s.case_type || 'ALL', s.target_field || null,
        JSON.stringify(s.condition_json), s.severity,
      ]
    );
  }
}

// ── Main evaluation function ──────────────────────────────────────────────
async function evaluateCase(casePayload, orgId) {
  await ensureSeeded();
  await ensureOrgRules(orgId);

  const [rules] = await pool.execute(
    `SELECT * FROM org_qa_rules
      WHERE org_id = ? AND is_active = 1
        AND (case_types = 'ALL' OR FIND_IN_SET(?, case_types))
      ORDER BY severity DESC, id ASC`,
    [orgId, casePayload.case_type || 'ALL']
  );

  const flags = [];

  for (const rule of rules) {
    let condition;
    try {
      condition = typeof rule.condition_json === 'string'
        ? JSON.parse(rule.condition_json)
        : rule.condition_json;
    } catch (_) { continue; }

    const triggered = evaluateCondition(condition, casePayload);
    if (!triggered) continue;

    flags.push({
      rule_key: rule.rule_key,
      rule_name: rule.rule_name,
      rule_type: rule.rule_type,
      target_field: rule.target_field || null,
      severity: rule.severity,
      message: buildFlagMessage(rule, casePayload),
    });
  }

  const criticalCount = flags.filter(f => f.severity === 'critical').length;
  const warningCount  = flags.filter(f => f.severity === 'warning').length;
  const score = Math.max(
    0,
    100 - (criticalCount * SEVERITY_DEDUCTION.critical) - (warningCount * SEVERITY_DEDUCTION.warning)
  );

  return {
    flags,
    flags_count: flags.length,
    critical_count: criticalCount,
    warning_count: warningCount,
    quality_score: score,
  };
}

// ── Rule condition evaluator ──────────────────────────────────────────────
function evaluateCondition(condition, payload) {
  const { operator } = condition;

  switch (operator) {

    case 'empty': {
      const val = getField(payload, condition.field);
      return isEmpty(val);
    }

    case 'empty_when': {
      const whenVal = getField(payload, condition.when_field);
      if (!matchesValue(whenVal, condition.when_value)) return false;
      const val = getField(payload, condition.field);
      return isEmpty(val);
    }

    case 'empty_both': {
      const v1 = getField(payload, condition.field);
      const v2 = getField(payload, condition.field2);
      return isEmpty(v1) && isEmpty(v2);
    }

    case 'word_count_lt': {
      const text = getField(payload, condition.field);
      if (isEmpty(text)) return true;
      const words = String(text).trim().split(/\s+/).filter(Boolean).length;
      return words < (condition.threshold || 20);
    }

    case 'contains_any': {
      const text = getField(payload, condition.field);
      if (isEmpty(text)) return false;
      const lower = String(text).toLowerCase();
      return (condition.values || PLACEHOLDER_PATTERNS).some(p => lower.includes(p.toLowerCase()));
    }

    case 'days_open_gt': {
      if (condition.when_field) {
        const whenVal = getField(payload, condition.when_field);
        if (!matchesValue(whenVal, condition.when_value)) return false;
      }
      const received = payload.date_received || payload.created_at;
      if (!received) return false;
      const daysOpen = Math.floor((Date.now() - new Date(received).getTime()) / 86400000);
      return daysOpen > condition.days;
    }

    case 'duplicate_check':
      // Duplicate detection handled separately in route — always return false here
      return false;

    case 'override_no_reason':
      // Override pattern — evaluated post-submission, not at evaluation time
      return false;

    default:
      return false;
  }
}

// ── Field accessor — supports dot notation ────────────────────────────────
function getField(payload, fieldPath) {
  if (!fieldPath) return undefined;
  return fieldPath.split('.').reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : undefined), payload);
}

function isEmpty(val) {
  if (val === undefined || val === null) return true;
  if (typeof val === 'string' && val.trim() === '') return true;
  return false;
}

function matchesValue(actual, expected) {
  if (typeof expected === 'boolean') return Boolean(actual) === expected;
  return String(actual).toLowerCase() === String(expected).toLowerCase();
}

function buildFlagMessage(rule, payload) {
  return rule.rule_name;
}

// ── Store evaluation result to ai_qa_responses ────────────────────────────
async function storeQaResponse({ caseId, orgId, evaluationType, triggeredBy, inputSnapshot, result }) {
  const [insertResult] = await pool.execute(
    `INSERT INTO ai_qa_responses
       (case_id, org_id, evaluation_type, triggered_by, input_snapshot, output_response,
        flags_count, critical_count, warning_count, quality_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      caseId, orgId, evaluationType || 'realtime', triggeredBy || null,
      JSON.stringify(inputSnapshot),
      JSON.stringify({ flags: result.flags }),
      result.flags_count, result.critical_count, result.warning_count, result.quality_score,
    ]
  );
  return insertResult.insertId;
}

// ── Store override against an existing ai_qa_response ─────────────────────
async function storeOverride({ responseId, overrideBy, overrideReason }) {
  await pool.execute(
    `UPDATE ai_qa_responses
        SET override_by = ?, override_reason = ?, override_at = NOW()
      WHERE id = ?`,
    [overrideBy, overrideReason || null, responseId]
  );
}

module.exports = { evaluateCase, storeQaResponse, storeOverride, ensureOrgRules };
