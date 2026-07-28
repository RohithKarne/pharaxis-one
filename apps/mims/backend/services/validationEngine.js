'use strict';

/**
 * validationEngine.js — Theme 3 server-side validator.
 *
 * Wave 1. Evaluates a payload of field values against the rules configured
 * via Customize Forms ⚙ Rules (regex, range, length, format hint, duplicates,
 * phase-aware required). Returns a per-field error map; UI mirrors the
 * same rules client-side via /api/validation/schema.
 *
 * Caching: rule set is loaded per (orgId, section) and memoized for 60s
 * via the feature-flag cache pattern.
 *
 * Surface:
 *   loadRules(orgId, section)                       → { fields:[...] }
 *   buildClientSchema(orgId, section)               → { fields:[...] }  (for UI)
 *   validatePayload({ orgId, section, payload, phase?, entityId?, entityType? })
 *     → { ok, errors:{fieldName:msg}, warnings:{fieldName:msg} }
 *
 * Behaviour:
 *   - regex compiled once per rule, errors logged + skipped on bad regex
 *   - phase-aware required pulled from field_phase_required (org or global)
 *   - duplicate check honors duplicate_scope (org|global|case)
 *     - 'hard' severity → returned as error (block save)
 *     - 'soft' severity → returned as warning + logged
 *
 * NOTE: feature-flag gating is the caller's responsibility — admin routes
 * use featureFlagsService.requireFlag('cf.theme3_inline_validation').
 */

const pool = require('../database/db');
const { logger } = require('./logger');
const redisClient = require('./redisClient');

const RULE_CACHE_TTL_MS = 60 * 1000;
const _ruleCache = new Map(); // key=`${orgId}|${section}` → { rules, expiresAt }

function _cacheKey(orgId, section) {
  return `${orgId == null ? 'null' : orgId}|${section}`;
}

function invalidate(orgId = null, section = null, broadcast = true) {
  if (orgId == null && section == null) {
    _ruleCache.clear();
  } else {
    for (const k of [..._ruleCache.keys()]) {
      const [oid, sec] = k.split('|');
      const matchOrg = orgId == null || oid === String(orgId);
      const matchSec = section == null || sec === section;
      if (matchOrg && matchSec) _ruleCache.delete(k);
    }
  }

  if (broadcast) {
    redisClient.publish('mims:cache:validation_rules:invalidate', { orgId, section });
  }
}

// Subscribe to invalidation broadcasts from other nodes
const sub = redisClient.createSubscriber();
sub.subscribe('mims:cache:validation_rules:invalidate').catch(() => {});
sub.on('message', (channel, message) => {
  if (channel === 'mims:cache:validation_rules:invalidate') {
    try {
      const { orgId, section } = JSON.parse(message);
      invalidate(orgId, section, false);
    } catch (e) {
      // Ignore invalid payloads
    }
  }
});

async function loadRules(orgId, section) {
  const k = _cacheKey(orgId, section);
  const hit = _ruleCache.get(k);
  if (hit && hit.expiresAt > Date.now()) return hit.rules;

  const [fields] = await pool.execute(`
    SELECT id, section_name, field_name, field_type,
           is_required, is_hidden, is_disabled,
           min_length, max_length, min_value, max_value,
           format_hint, validation_regex, validation_message,
           duplicate_check, duplicate_scope, duplicate_match
      FROM field_setup
     WHERE section_name = ?
       AND (org_id = ? OR org_id IS NULL)
  `, [section, orgId ?? 0]);

  const [phaseRows] = await pool.execute(`
    SELECT section_name, field_name, phase, is_required, message
      FROM field_phase_required
     WHERE section_name = ?
       AND (org_id = ? OR org_id IS NULL)
  `, [section, orgId ?? 0]);

  const phaseMap = new Map(); // `${field}|${phase}` → {required, message}
  for (const p of phaseRows) {
    phaseMap.set(`${p.field_name}|${p.phase}`, { required: !!p.is_required, message: p.message });
  }

  // Org-specific row beats global row when both exist.
  const byField = new Map();
  for (const f of fields) {
    const prev = byField.get(f.field_name);
    if (!prev || (prev.orgScope === 'global' && f.org_id)) {
      byField.set(f.field_name, { ...f, orgScope: f.org_id ? 'org' : 'global' });
    }
  }

  const rules = { phaseMap, fields: [...byField.values()] };
  _ruleCache.set(k, { rules, expiresAt: Date.now() + RULE_CACHE_TTL_MS });
  return rules;
}

function buildClientSchema(rules) {
  // Strip server-only fields, surface only what the UI needs.
  return {
    fields: rules.fields
      .filter(f => !f.is_hidden)
      .map(f => ({
        field_name:    f.field_name,
        field_type:    f.field_type,
        is_required:   !!f.is_required,
        is_disabled:   !!f.is_disabled,
        min_length:    f.min_length,
        max_length:    f.max_length,
        min_value:     f.min_value,
        max_value:     f.max_value,
        format_hint:   f.format_hint,
        regex:         f.validation_regex,
        regex_message: f.validation_message,
        duplicate:     !!f.duplicate_check,
      })),
  };
}

function _safeRegex(pattern) {
  // M-10: cap admin-configured pattern length to bound ReDoS exposure.
  if (typeof pattern !== 'string' || pattern.length > 1000) {
    logger.warn({ patternLength: pattern == null ? 0 : String(pattern).length }, 'validationEngine: regex pattern too long or invalid type, skipping');
    return null;
  }
  try { return new RegExp(pattern); }
  catch (err) {
    logger.warn({ err: err.message, pattern }, 'validationEngine: invalid regex, skipping');
    return null;
  }
}

function _isEmpty(v) {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

async function _duplicateExists({ rule, orgId, section, value, entityId, entityType }) {
  if (_isEmpty(value)) return null;
  const match = rule.duplicate_match || 'exact';
  const scope = rule.duplicate_scope || 'org';

  // Cases store structured fields in case_*_version tables AND a flat JSON in cases.
  // We do a best-effort lookup against the `cases.fields_json` blob (production builds
  // index it via virtual columns). Caller can pass entityType='case' for the common path.
  if (entityType !== 'case') return null;

  let valExpr = '?';
  let arg = String(value);
  if (match === 'case-insensitive') { valExpr = 'LOWER(?)'; arg = arg.toLowerCase(); }
  if (match === 'normalized')       { valExpr = "LOWER(REGEXP_REPLACE(?, '[^a-z0-9]', ''))";
                                      arg = arg.toLowerCase().replace(/[^a-z0-9]/g, ''); }

  // The fields_json column is added in migration 029. Tolerate its absence.
  try {
    const params = [arg];
    let sql = `
      SELECT id
        FROM cases
       WHERE deleted_at IS NULL
         AND ${ /* match value */ '' }`;
    // Use JSON_EXTRACT for the candidate field; not all dialects need it but MySQL 8 does.
    sql += ` JSON_UNQUOTE(JSON_EXTRACT(fields_json, ?)) = ${valExpr}`;
    params.unshift(`$.${rule.field_name}`);
    if (scope === 'org') {
      sql += ' AND org_id = ?'; params.push(orgId);
    }
    if (entityId) {
      sql += ' AND id <> ?'; params.push(entityId);
    }
    sql += ' LIMIT 1';
    const [[hit]] = await pool.execute(sql, params);
    return hit ? hit.id : null;
  } catch (err) {
    // fields_json may not exist on older schemas — gracefully no-op.
    if (!/Unknown column.*fields_json/i.test(err.message || '')) {
      logger.warn({ err: err.message, field: rule.field_name }, 'duplicate check error');
    }
    return null;
  }
}

async function validatePayload({
  orgId, section, payload = {},
  phase = null, entityId = null, entityType = 'case',
}) {
  const rules = await loadRules(orgId, section);
  const errors = {};
  const warnings = {};

  for (const rule of rules.fields) {
    const v = payload[rule.field_name];

    // 1. required (base + phase-aware)
    let required = !!rule.is_required;
    let requiredMsg = `${rule.field_name} is required.`;
    if (phase) {
      const pr = rules.phaseMap.get(`${rule.field_name}|${phase}`);
      if (pr) {
        required = pr.required;
        if (pr.message) requiredMsg = pr.message;
      }
    }
    if (required && _isEmpty(v)) {
      errors[rule.field_name] = requiredMsg;
      continue;
    }
    if (_isEmpty(v)) continue;

    // 2. length
    if (rule.min_length && String(v).length < rule.min_length) {
      errors[rule.field_name] = `Minimum length ${rule.min_length}.`;
      continue;
    }
    if (rule.max_length && String(v).length > rule.max_length) {
      errors[rule.field_name] = `Maximum length ${rule.max_length}.`;
      continue;
    }

    // 3. numeric range (skip non-numeric values)
    if (rule.min_value != null || rule.max_value != null) {
      const n = Number(v);
      if (Number.isFinite(n)) {
        if (rule.min_value != null && n < Number(rule.min_value)) {
          errors[rule.field_name] = `Must be ≥ ${rule.min_value}.`; continue;
        }
        if (rule.max_value != null && n > Number(rule.max_value)) {
          errors[rule.field_name] = `Must be ≤ ${rule.max_value}.`; continue;
        }
      }
    }

    // 4. regex
    if (rule.validation_regex) {
      const re = _safeRegex(rule.validation_regex);
      // M-10: cap tested-value length to bound ReDoS exposure on user input.
      if (re && String(v).length <= 100000 && !re.test(String(v))) {
        errors[rule.field_name] = rule.validation_message || `Invalid format.`;
        continue;
      }
    }

    // 5. duplicate detection
    if (rule.duplicate_check) {
      const matchedId = await _duplicateExists({
        rule, orgId, section, value: v, entityId, entityType,
      });
      if (matchedId) {
        // 'hard' severity → blocking error; 'soft' → warning + log
        const severity = (rule.duplicate_scope === 'global') ? 'hard' : 'soft';
        const msg = severity === 'hard'
          ? `Duplicate of record #${matchedId}.`
          : `Possible duplicate of record #${matchedId}. Review before saving.`;
        if (severity === 'hard') errors[rule.field_name] = msg;
        else warnings[rule.field_name] = msg;
        // Best-effort audit log
        pool.execute(
          `INSERT INTO duplicate_detection_log
             (org_id, entity_type, entity_id, section_name, field_name,
              submitted_value, matched_entity_id, severity)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [orgId, entityType, entityId || null, section, rule.field_name,
           String(v).slice(0, 500), matchedId, severity]
        ).catch(() => {});
      }
    }
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    warnings,
  };
}

module.exports = {
  loadRules,
  buildClientSchema,
  validatePayload,
  invalidate,
};
