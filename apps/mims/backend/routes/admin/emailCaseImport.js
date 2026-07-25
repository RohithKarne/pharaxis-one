'use strict';

/**
 * emailCaseImport.js — Email Case Import admin configuration (MIMS-31, MIMS-40, MIMS-41)
 *
 *   GET    /api/admin/email-case-import/config           — org import settings
 *   PUT    /api/admin/email-case-import/config           — update settings (validated)
 *   GET    /api/admin/email-case-import/intake-fields    — org intake field definitions
 *   POST   /api/admin/email-case-import/intake-fields
 *   PUT    /api/admin/email-case-import/intake-fields/:id
 *   DELETE /api/admin/email-case-import/intake-fields/:id
 *   GET    /api/admin/email-case-import/mailboxes        — org mailboxes + intake flags
 *   PUT    /api/admin/email-case-import/mailboxes/:id    — toggle is_case_intake
 *   GET    /api/admin/email-case-import/metrics          — % auto-converted, email→case time
 *
 * All org-scoped: a tenant admin only ever reads/writes their own org's rows.
 * The platform floor (sender, received ts, subject, body, case type, org,
 * source) is not stored in intake_field_definitions and therefore can never be
 * removed here — admins configure on top of the floor (decision #9).
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
const { CONFIG_DEFAULTS } = require('../../services/emailCaseImportService');

const ADMIN = ['admin', 'platform_admin'];

function resolveOrgId(req) {
  return hasGlobalAdminScope(req.user)
    ? (Number(req.query.org_id || req.body?.org_id || 0) || null)
    : req.user.orgId;
}

async function audit(req, action, entity, entityId, details) {
  await pool.execute(
    `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [req.user?.userId || null, req.user?.email || 'unknown', action, entity, entityId, JSON.stringify(details || {})]
  ).catch(() => {});
}

// Mapping allowlists — an intake definition may only target these columns.
const TARGETS = {
  reporter: ['first_name', 'last_name', 'email', 'phone', 'country', 'organisation', 'reporter_type'],
  case: ['description', 'priority'],
};
const ASSIGNMENT_RULES = ['round_robin_workload'];
const ALERT_RECIPIENTS = ['agent_lead', 'agent_only'];

// ── Config ──────────────────────────────────────────────────────────────────

router.get('/email-case-import/config', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'org_id is required.' });
    const [[row]] = await pool.execute('SELECT * FROM email_case_import_config WHERE org_id = ?', [orgId]);
    res.json({ ...CONFIG_DEFAULTS, org_id: orgId, ...(row || {}) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load configuration.' });
  }
});

router.put('/email-case-import/config', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'org_id is required.' });

    const b = req.body || {};
    const threshold = Number(b.confidence_threshold);
    if (b.confidence_threshold !== undefined && (!Number.isFinite(threshold) || threshold < 0.5 || threshold > 1)) {
      return res.status(400).json({ error: 'confidence_threshold must be between 0.5 and 1.' });
    }
    const slaHours = Number(b.sla_hours);
    if (b.sla_hours !== undefined && (!Number.isInteger(slaHours) || slaHours < 1 || slaHours > 720)) {
      return res.status(400).json({ error: 'sla_hours must be an integer between 1 and 720.' });
    }
    if (b.assignment_rule !== undefined && !ASSIGNMENT_RULES.includes(b.assignment_rule)) {
      return res.status(400).json({ error: `assignment_rule must be one of: ${ASSIGNMENT_RULES.join(', ')}.` });
    }
    if (b.alert_recipients !== undefined && !ALERT_RECIPIENTS.includes(b.alert_recipients)) {
      return res.status(400).json({ error: `alert_recipients must be one of: ${ALERT_RECIPIENTS.join(', ')}.` });
    }
    for (const key of ['ack_template', 'ack_missing_fields_template']) {
      if (b[key] !== undefined && b[key] !== null && String(b[key]).length > 4000) {
        return res.status(400).json({ error: `${key} must be 4000 characters or fewer.` });
      }
    }

    const [[existing]] = await pool.execute('SELECT * FROM email_case_import_config WHERE org_id = ?', [orgId]);
    const bool = (v, fallback) => (v === undefined ? fallback : (v ? 1 : 0));
    const next = {
      is_enabled: bool(b.is_enabled, existing?.is_enabled ?? CONFIG_DEFAULTS.is_enabled),
      confidence_threshold: b.confidence_threshold !== undefined ? threshold : (existing?.confidence_threshold ?? CONFIG_DEFAULTS.confidence_threshold),
      assignment_rule: b.assignment_rule ?? existing?.assignment_rule ?? CONFIG_DEFAULTS.assignment_rule,
      enable_mi: bool(b.enable_mi, existing?.enable_mi ?? 1),
      enable_ae: bool(b.enable_ae, existing?.enable_ae ?? 1),
      enable_pc: bool(b.enable_pc, existing?.enable_pc ?? 1),
      ack_enabled: bool(b.ack_enabled, existing?.ack_enabled ?? 1),
      ack_template: b.ack_template !== undefined ? (b.ack_template || null) : (existing?.ack_template ?? null),
      ack_missing_fields_template: b.ack_missing_fields_template !== undefined ? (b.ack_missing_fields_template || null) : (existing?.ack_missing_fields_template ?? null),
      sla_hours: b.sla_hours !== undefined ? slaHours : (existing?.sla_hours ?? CONFIG_DEFAULTS.sla_hours),
      alert_recipients: b.alert_recipients ?? existing?.alert_recipients ?? CONFIG_DEFAULTS.alert_recipients,
    };

    await pool.execute(
      `INSERT INTO email_case_import_config
         (org_id, is_enabled, confidence_threshold, assignment_rule, enable_mi, enable_ae, enable_pc,
          ack_enabled, ack_template, ack_missing_fields_template, sla_hours, alert_recipients)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         is_enabled = VALUES(is_enabled), confidence_threshold = VALUES(confidence_threshold),
         assignment_rule = VALUES(assignment_rule), enable_mi = VALUES(enable_mi),
         enable_ae = VALUES(enable_ae), enable_pc = VALUES(enable_pc),
         ack_enabled = VALUES(ack_enabled), ack_template = VALUES(ack_template),
         ack_missing_fields_template = VALUES(ack_missing_fields_template),
         sla_hours = VALUES(sla_hours), alert_recipients = VALUES(alert_recipients)`,
      [orgId, next.is_enabled, next.confidence_threshold, next.assignment_rule, next.enable_mi,
       next.enable_ae, next.enable_pc, next.ack_enabled, next.ack_template,
       next.ack_missing_fields_template, next.sla_hours, next.alert_recipients]
    );

    await audit(req, 'ECI_CONFIG_UPDATED', 'email_case_import_config', orgId, { from: existing || null, to: next });
    const [[saved]] = await pool.execute('SELECT * FROM email_case_import_config WHERE org_id = ?', [orgId]);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save configuration.' });
  }
});

// ── Intake field definitions ────────────────────────────────────────────────

function validateFieldDef(b) {
  const fieldKey = String(b.field_key || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,99}$/.test(fieldKey)) {
    return { error: 'field_key must be 2-100 chars: lowercase letters, digits, underscores.' };
  }
  const label = String(b.label || '').trim();
  if (!label || label.length > 255) return { error: 'label is required (max 255 chars).' };
  const targetEntity = String(b.target_entity || 'case');
  if (!TARGETS[targetEntity]) return { error: `target_entity must be one of: ${Object.keys(TARGETS).join(', ')}.` };
  const targetField = String(b.target_field || '');
  if (!TARGETS[targetEntity].includes(targetField)) {
    return { error: `target_field for ${targetEntity} must be one of: ${TARGETS[targetEntity].join(', ')}.` };
  }
  const aliases = b.aliases == null ? null : String(b.aliases).slice(0, 1000);
  return {
    value: {
      field_key: fieldKey, label, aliases,
      target_entity: targetEntity, target_field: targetField,
      is_required: b.is_required === undefined ? 1 : (b.is_required ? 1 : 0),
      sort_order: Number.isInteger(Number(b.sort_order)) ? Number(b.sort_order) : 0,
      is_active: b.is_active === undefined ? 1 : (b.is_active ? 1 : 0),
    },
  };
}

router.get('/email-case-import/intake-fields', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'org_id is required.' });
    const [rows] = await pool.execute(
      `SELECT * FROM intake_field_definitions WHERE org_id = ? ORDER BY sort_order ASC, id ASC`,
      [orgId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load intake fields.' });
  }
});

router.post('/email-case-import/intake-fields', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'org_id is required.' });
    const check = validateFieldDef(req.body || {});
    if (check.error) return res.status(400).json({ error: check.error });
    const v = check.value;
    const [result] = await pool.execute(
      `INSERT INTO intake_field_definitions
         (org_id, field_key, label, aliases, target_entity, target_field, is_required, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orgId, v.field_key, v.label, v.aliases, v.target_entity, v.target_field, v.is_required, v.sort_order, v.is_active]
    );
    await audit(req, 'ECI_INTAKE_FIELD_CREATED', 'intake_field_definitions', result.insertId, v);
    const [[row]] = await pool.execute('SELECT * FROM intake_field_definitions WHERE id = ?', [result.insertId]);
    res.status(201).json(row);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A field with this field_key already exists for this organisation.' });
    }
    res.status(500).json({ error: 'Failed to create intake field.' });
  }
});

router.put('/email-case-import/intake-fields/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'org_id is required.' });
    const [[existing]] = await pool.execute(
      'SELECT * FROM intake_field_definitions WHERE id = ? AND org_id = ?',
      [Number(req.params.id), orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Intake field not found.' });
    const check = validateFieldDef({ ...existing, ...(req.body || {}) });
    if (check.error) return res.status(400).json({ error: check.error });
    const v = check.value;
    await pool.execute(
      `UPDATE intake_field_definitions
          SET field_key = ?, label = ?, aliases = ?, target_entity = ?, target_field = ?,
              is_required = ?, sort_order = ?, is_active = ?
        WHERE id = ? AND org_id = ?`,
      [v.field_key, v.label, v.aliases, v.target_entity, v.target_field,
       v.is_required, v.sort_order, v.is_active, existing.id, orgId]
    );
    await audit(req, 'ECI_INTAKE_FIELD_UPDATED', 'intake_field_definitions', existing.id, { from: existing, to: v });
    const [[row]] = await pool.execute('SELECT * FROM intake_field_definitions WHERE id = ?', [existing.id]);
    res.json(row);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A field with this field_key already exists for this organisation.' });
    }
    res.status(500).json({ error: 'Failed to update intake field.' });
  }
});

router.delete('/email-case-import/intake-fields/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'org_id is required.' });
    const [[existing]] = await pool.execute(
      'SELECT * FROM intake_field_definitions WHERE id = ? AND org_id = ?',
      [Number(req.params.id), orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Intake field not found.' });
    await pool.execute('DELETE FROM intake_field_definitions WHERE id = ? AND org_id = ?', [existing.id, orgId]);
    await audit(req, 'ECI_INTAKE_FIELD_DELETED', 'intake_field_definitions', existing.id, existing);
    res.json({ message: 'Intake field removed.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete intake field.' });
  }
});

// ── Mailbox intake flags (MIMS-30) ──────────────────────────────────────────

router.get('/email-case-import/mailboxes', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'org_id is required.' });
    const [rows] = await pool.execute(
      `SELECT id, account_name, mailbox_email, direction, is_active, is_case_intake,
              imap_host IS NOT NULL AND imap_username IS NOT NULL AS imap_configured
         FROM email_accounts
        WHERE org_id = ?
        ORDER BY account_name ASC, id ASC`,
      [orgId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load mailboxes.' });
  }
});

router.put('/email-case-import/mailboxes/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'org_id is required.' });
    const flag = req.body?.is_case_intake ? 1 : 0;
    const [[account]] = await pool.execute(
      'SELECT id, account_name, is_case_intake FROM email_accounts WHERE id = ? AND org_id = ?',
      [Number(req.params.id), orgId]
    );
    if (!account) return res.status(404).json({ error: 'Mailbox not found.' });
    await pool.execute('UPDATE email_accounts SET is_case_intake = ? WHERE id = ? AND org_id = ?',
      [flag, account.id, orgId]);
    await audit(req, 'ECI_MAILBOX_FLAG_UPDATED', 'email_accounts', account.id,
      { account_name: account.account_name, from: account.is_case_intake, to: flag });
    res.json({ id: account.id, is_case_intake: flag });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update mailbox flag.' });
  }
});

// ── Metrics (MIMS-41) ───────────────────────────────────────────────────────
// Keyed off email_case_sources (authoritative record of auto-imports), NOT
// cases.intake_channel — legacy seed data reuses 'email' as a channel value.

router.get('/email-case-import/metrics', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'org_id is required.' });
    const from = req.query.from ? String(req.query.from).slice(0, 10) : null;
    const to = req.query.to ? String(req.query.to).slice(0, 10) : null;
    const range = [];
    let rangeSql = '';
    if (from) { rangeSql += ' AND s.created_at >= ?'; range.push(`${from} 00:00:00`); }
    if (to) { rangeSql += ' AND s.created_at <= ?'; range.push(`${to} 23:59:59`); }

    // Auto-created cases + email→case latency (received ts → case created ts).
    const [[auto]] = await pool.execute(
      `SELECT COUNT(*) AS auto_created,
              AVG(TIMESTAMPDIFF(SECOND, s.received_at, c.created_at)) AS avg_seconds_to_case
         FROM email_case_sources s
         JOIN cases c ON c.id = s.case_id
        WHERE s.org_id = ? AND s.kind = 'original'${rangeSql}`,
      [orgId, ...range]
    );

    // Total pipeline inflow: inquiries the importer touched (auto-created,
    // follow-ups, needs-review, junk-suspected) in the same window.
    const inqRange = [];
    let inqRangeSql = '';
    if (from) { inqRangeSql += ' AND i.created_at >= ?'; inqRange.push(`${from} 00:00:00`); }
    if (to) { inqRangeSql += ' AND i.created_at <= ?'; inqRange.push(`${to} 23:59:59`); }
    const [[flow]] = await pool.execute(
      `SELECT
         SUM(CASE WHEN i.routing_reason = 'auto: email case import' THEN 1 ELSE 0 END) AS converted,
         SUM(CASE WHEN i.routing_reason LIKE 'auto: needs review%' THEN 1 ELSE 0 END) AS needs_review,
         SUM(CASE WHEN i.routing_reason LIKE 'auto: follow-up attached%' THEN 1 ELSE 0 END) AS followups,
         SUM(CASE WHEN i.routing_reason LIKE 'auto: junk suspected%' THEN 1 ELSE 0 END) AS junk
        FROM inquiries i
       WHERE i.org_id = ? AND i.routing_reason LIKE 'auto:%'${inqRangeSql}`,
      [orgId, ...inqRange]
    );

    const converted = Number(flow?.converted || 0);
    const needsReview = Number(flow?.needs_review || 0);
    const followups = Number(flow?.followups || 0);
    const junk = Number(flow?.junk || 0);
    const totalEligible = converted + needsReview; // junk/follow-ups aren't conversion candidates

    res.json({
      auto_created_cases: Number(auto?.auto_created || 0),
      avg_seconds_email_to_case: auto?.avg_seconds_to_case != null ? Math.round(Number(auto.avg_seconds_to_case)) : null,
      pct_auto_converted: totalEligible > 0 ? Number(((converted / totalEligible) * 100).toFixed(1)) : null,
      breakdown: { converted, needs_review: needsReview, followups_attached: followups, junk_suspected: junk },
      window: { from, to },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to compute metrics.' });
  }
});

module.exports = router;
