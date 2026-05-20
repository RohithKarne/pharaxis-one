'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { evaluateRule } = require('../../../shared/services/ruleEvaluator');
const { hasGlobalAdminScope } = require('../../utils/adminScope');

const ROLE = ['admin', 'platform_admin'];
const CASE_TYPES = new Set(['AE', 'MI', 'PC', 'ALL']);
const RULE_TYPES = new Set(['visibility', 'required', 'default', 'validation', 'cascade']);

function parseJson(value, fallback = {}) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function normalizeRule(row) {
  return {
    ...row,
    condition_json: parseJson(row.condition_json, {}),
    action_json: parseJson(row.action_json, {}),
    is_active: !!row.is_active,
  };
}

function scopedOrgId(req, input) {
  if (hasGlobalAdminScope(req.user)) return Number(input || req.query.org_id || req.user.orgId || 0);
  return Number(req.user.orgId || 0);
}

async function audit(userId, action, entityId, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, entity, entity_id, action, details)
       VALUES (?, 'case_form_rule', ?, ?, ?)`,
      [userId, entityId || null, action, JSON.stringify(details || {})]
    );
  } catch (_) {}
}

function validatePayload(req, isUpdate = false) {
  const body = req.body || {};
  const orgId = scopedOrgId(req, body.org_id);
  if (!orgId) return { error: 'org_id is required.' };
  const caseType = body.case_type || 'ALL';
  const ruleType = body.rule_type;
  if (!isUpdate || body.case_type !== undefined) {
    if (!CASE_TYPES.has(caseType)) return { error: 'case_type must be AE, MI, PC, or ALL.' };
  }
  if (!isUpdate || body.rule_type !== undefined) {
    if (!RULE_TYPES.has(ruleType)) return { error: 'rule_type is invalid.' };
  }
  return { orgId, caseType, ruleType };
}

router.get('/case-form-rules', authenticate, requireRole(...ROLE), async (req, res) => {
  try {
    const orgId = scopedOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'org_id is required.' });
    const where = ['org_id = ?'];
    const params = [orgId];
    if (req.query.case_type) { where.push('(case_type = ? OR case_type = "ALL")'); params.push(req.query.case_type); }
    if (req.query.section) { where.push('section_name = ?'); params.push(req.query.section); }
    if (req.query.field_name) { where.push('field_name = ?'); params.push(req.query.field_name); }
    const [rows] = await pool.execute(
      `SELECT * FROM case_form_rules
       WHERE ${where.join(' AND ')}
       ORDER BY priority DESC, id ASC`,
      params
    );
    res.json({ rules: rows.map(normalizeRule) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/case-form-rules', authenticate, requireRole(...ROLE), async (req, res) => {
  const valid = validatePayload(req);
  if (valid.error) return res.status(400).json({ error: valid.error });
  const body = req.body || {};
  try {
    const [result] = await pool.execute(
      `INSERT INTO case_form_rules
        (org_id, case_type, section_name, field_name, rule_type, condition_json, action_json, is_active, priority, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        valid.orgId,
        valid.caseType,
        body.section_name || null,
        body.field_name || null,
        valid.ruleType,
        JSON.stringify(body.condition_json || {}),
        JSON.stringify(body.action_json || {}),
        body.is_active === false ? 0 : 1,
        Number(body.priority || 0),
        req.user.userId,
        req.user.userId,
      ]
    );
    await audit(req.user.userId, 'CREATE_CASE_FORM_RULE', result.insertId, body);
    const [[created]] = await pool.execute('SELECT * FROM case_form_rules WHERE id = ?', [result.insertId]);
    res.status(201).json({ rule: normalizeRule(created) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/case-form-rules/:id', authenticate, requireRole(...ROLE), async (req, res) => {
  const valid = validatePayload(req, true);
  if (valid.error) return res.status(400).json({ error: valid.error });
  try {
    const orgId = scopedOrgId(req, req.body?.org_id);
    const [[existing]] = await pool.execute('SELECT * FROM case_form_rules WHERE id = ? AND org_id = ?', [req.params.id, orgId]);
    if (!existing) return res.status(404).json({ error: 'Rule not found.' });
    const body = req.body || {};
    const next = { ...existing, ...body };
    await pool.execute(
      `UPDATE case_form_rules SET
        case_type = ?, section_name = ?, field_name = ?, rule_type = ?,
        condition_json = ?, action_json = ?,
        is_active = ?, priority = ?, updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        next.case_type,
        next.section_name || null,
        next.field_name || null,
        next.rule_type,
        JSON.stringify(parseJson(next.condition_json, {})),
        JSON.stringify(parseJson(next.action_json, {})),
        next.is_active === false || Number(next.is_active) === 0 ? 0 : 1,
        Number(next.priority || 0),
        req.user.userId,
        req.params.id,
      ]
    );
    await audit(req.user.userId, 'UPDATE_CASE_FORM_RULE', req.params.id, { before: normalizeRule(existing), after: body });
    const [[updated]] = await pool.execute('SELECT * FROM case_form_rules WHERE id = ?', [req.params.id]);
    res.json({ rule: normalizeRule(updated) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/case-form-rules/:id', authenticate, requireRole(...ROLE), async (req, res) => {
  try {
    const orgId = scopedOrgId(req);
    const [[existing]] = await pool.execute('SELECT * FROM case_form_rules WHERE id = ? AND org_id = ?', [req.params.id, orgId]);
    if (!existing) return res.status(404).json({ error: 'Rule not found.' });
    await pool.execute('DELETE FROM case_form_rules WHERE id = ?', [req.params.id]);
    await audit(req.user.userId, 'DELETE_CASE_FORM_RULE', req.params.id, normalizeRule(existing));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/case-form-rules/test', authenticate, requireRole(...ROLE), (req, res) => {
  try {
    const result = evaluateRule(req.body?.rule || req.body || {}, req.body?.formData || req.body?.sample || {});
    res.json({ result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
