'use strict';

/**
 * routes/admin/dppr.js — Data Protection & Privacy Rules (DPPR)
 *
 * Tenant-level privacy rules: define what happens to PII after retention period expires.
 * Also handles Individual DPPR (per-case overrides via case_dppr_overrides table).
 *
 * Endpoints:
 *   GET    /api/admin/dppr/domains            — static list of data domains
 *   GET    /api/admin/dppr                    — list rules for org (paginated)
 *   POST   /api/admin/dppr                    — create rule
 *   GET    /api/admin/dppr/:id               — get single rule
 *   PUT    /api/admin/dppr/:id               — update rule
 *   DELETE /api/admin/dppr/:id               — soft delete
 *   PATCH  /api/admin/dppr/:id/toggle        — enable / disable rule
 *   GET    /api/admin/dppr/execution-log     — execution history (paginated)
 *   POST   /api/admin/dppr/run-now           — manual trigger for org
 *
 *   GET    /api/admin/dppr/cases/:caseId/overrides    — case-level overrides
 *   PUT    /api/admin/dppr/cases/:caseId/overrides    — upsert case override (must be >= restrictive)
 *   DELETE /api/admin/dppr/cases/:caseId/overrides/:domain — remove override
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validate');
const { applyDpprRules } = require('../../services/dpprScheduler');

// ── Data domains catalogue ────────────────────────────────────────────────────
const DPPR_DOMAINS = [
  {
    key: 'contact_pii',
    label: 'Contact Personal Information',
    description: 'Names, email addresses, phone numbers, and postal addresses stored in case contacts.',
    tables: ['case_contacts'],
    pii_fields: ['first_name', 'last_name', 'email', 'phone', 'address'],
  },
  {
    key: 'medical_data',
    label: 'Medical / Clinical Data',
    description: 'Patient demographics and adverse event clinical details (DOB, gender, weight, medical history).',
    tables: ['case_ae_patient_info', 'case_ae_general'],
    pii_fields: ['patient_dob', 'patient_gender', 'patient_age', 'patient_weight', 'patient_height', 'ethnicity'],
  },
  {
    key: 'case_narrative',
    label: 'Case Narrative Text',
    description: 'Case description and internal notes — free-text fields that may contain PII.',
    tables: ['cases'],
    pii_fields: ['description', 'internal_notes'],
  },
  {
    key: 'reporter_info',
    label: 'Reporter / HCP Information',
    description: 'Identifiers for the reporting healthcare professional or consumer.',
    tables: ['case_reporter'],
    pii_fields: ['reporter_name', 'reporter_email', 'reporter_phone', 'reporter_address', 'institution'],
  },
  {
    key: 'patient_demographics',
    label: 'Patient Demographics',
    description: 'Patient name, date of birth, address, and other demographic identifiers.',
    tables: ['case_patient'],
    pii_fields: ['patient_name', 'patient_dob', 'patient_address', 'patient_email', 'patient_phone'],
  },
  {
    key: 'inquiry_content',
    label: 'Inbox / Email Content',
    description: 'Email bodies and sender information received through the inbox.',
    tables: ['inquiries'],
    pii_fields: ['body', 'sender_name', 'sender_email', 'subject'],
  },
];

const ACTION_RANK = { None: 0, Anonymize: 1, Delete: 2 };

function orgScope(req) {
  if (req.user.role === 'superadmin') return null;
  return req.user.orgId;
}

// ── GET /api/admin/dppr/domains ───────────────────────────────────────────────
router.get('/dppr/domains', authenticate, (_req, res) => {
  res.json({ domains: DPPR_DOMAINS });
});

// ── GET /api/admin/dppr/execution-log ────────────────────────────────────────
router.get('/dppr/execution-log', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 50, org_id } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const scope  = orgScope(req);

    const resolvedOrg = scope ?? (org_id ? parseInt(org_id, 10) : null);
    const params = [];
    let where = 'WHERE 1=1';
    if (resolvedOrg) { where += ' AND l.org_id = ?'; params.push(resolvedOrg); }

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM dppr_execution_log l ${where}`, params
    );
    const [rows] = await pool.execute(
      `SELECT l.*, r.rule_name, o.name AS org_name
       FROM dppr_execution_log l
       LEFT JOIN dppr_rules r ON r.id = l.rule_id
       LEFT JOIN organisations o ON o.id = l.org_id
       ${where}
       ORDER BY l.executed_at DESC
       LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`,
      params
    );

    res.json({ logs: rows, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /api/admin/dppr/execution-log error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/dppr/run-now ──────────────────────────────────────────────
router.post('/dppr/run-now', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { org_id } = req.body;
    const scope = orgScope(req);
    const targetOrg = scope ?? (org_id ? parseInt(org_id, 10) : null);
    if (!targetOrg) return res.status(400).json({ error: 'org_id required for superadmin manual run.' });

    const results = await applyDpprRules(targetOrg, 'manual', req.user.userId);
    res.json({ message: 'DPPR run complete.', results });
  } catch (err) {
    console.error('POST /api/admin/dppr/run-now error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/dppr ───────────────────────────────────────────────────────
router.get('/dppr', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 50, domain, is_active, org_id } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const scope  = orgScope(req);
    const resolvedOrg = scope ?? (org_id ? parseInt(org_id, 10) : null);

    const params = [];
    let where = 'WHERE 1=1';
    if (resolvedOrg)         { where += ' AND r.org_id = ?';     params.push(resolvedOrg); }
    if (domain)              { where += ' AND r.domain = ?';      params.push(domain); }
    if (is_active !== undefined) { where += ' AND r.is_active = ?'; params.push(parseInt(is_active, 10)); }

    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM dppr_rules r ${where}`, params
    );
    const [rules] = await pool.execute(
      `SELECT r.*, u.name AS created_by_name, uu.name AS updated_by_name, o.name AS org_name
       FROM dppr_rules r
       LEFT JOIN users u  ON u.id  = r.created_by
       LEFT JOIN users uu ON uu.id = r.updated_by
       LEFT JOIN organisations o ON o.id = r.org_id
       ${where}
       ORDER BY r.domain ASC, r.retention_days ASC
       LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`,
      params
    );

    res.json({ rules, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /api/admin/dppr error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/dppr ──────────────────────────────────────────────────────
router.post('/dppr', authenticate, requireRole('admin', 'superadmin'), validate(schemas.createDpprRule), async (req, res) => {
  try {
    const { rule_name, domain, contact_type = 'all', consent_type = 'all',
            action = 'None', retention_days = 365, is_active = 1, org_id } = req.body;

    if (!rule_name || !domain) {
      return res.status(400).json({ error: 'rule_name and domain are required.' });
    }
    if (!DPPR_DOMAINS.find(d => d.key === domain)) {
      return res.status(400).json({ error: `Invalid domain: ${domain}` });
    }

    const scope = orgScope(req);
    const resolvedOrg = scope ?? (org_id ? parseInt(org_id, 10) : null);
    if (!resolvedOrg) return res.status(400).json({ error: 'org_id required.' });

    const [result] = await pool.execute(
      `INSERT INTO dppr_rules
         (org_id, rule_name, domain, contact_type, consent_type, action, retention_days, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [resolvedOrg, rule_name, domain, contact_type, consent_type, action,
       parseInt(retention_days, 10), is_active ? 1 : 0,
       req.user.userId, req.user.userId]
    );

    res.status(201).json({ message: 'DPPR rule created.', id: result.insertId });
  } catch (err) {
    console.error('POST /api/admin/dppr error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/dppr/:id ───────────────────────────────────────────────────
router.get('/dppr/:id', authenticate, async (req, res) => {
  try {
    const scope = orgScope(req);
    const params = [req.params.id];
    let where = 'WHERE r.id = ?';
    if (scope) { where += ' AND r.org_id = ?'; params.push(scope); }

    const [[rule]] = await pool.execute(
      `SELECT r.*, u.name AS created_by_name FROM dppr_rules r
       LEFT JOIN users u ON u.id = r.created_by
       ${where}`,
      params
    );
    if (!rule) return res.status(404).json({ error: 'Rule not found.' });
    res.json({ rule });
  } catch (err) {
    console.error('GET /api/admin/dppr/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/admin/dppr/:id ───────────────────────────────────────────────────
router.put('/dppr/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const scope = orgScope(req);
    const params = [req.params.id];
    let where = 'WHERE id = ?';
    if (scope) { where += ' AND org_id = ?'; params.push(scope); }

    const [[existing]] = await pool.execute(`SELECT * FROM dppr_rules ${where}`, params);
    if (!existing) return res.status(404).json({ error: 'Rule not found.' });

    const { rule_name, domain, contact_type, consent_type, action, retention_days, is_active } = req.body;

    await pool.execute(
      `UPDATE dppr_rules SET
         rule_name      = ?,
         domain         = ?,
         contact_type   = ?,
         consent_type   = ?,
         action         = ?,
         retention_days = ?,
         is_active      = ?,
         updated_by     = ?,
         updated_at     = NOW()
       WHERE id = ?`,
      [
        rule_name      ?? existing.rule_name,
        domain         ?? existing.domain,
        contact_type   ?? existing.contact_type,
        consent_type   ?? existing.consent_type,
        action         ?? existing.action,
        retention_days !== undefined ? parseInt(retention_days, 10) : existing.retention_days,
        is_active      !== undefined ? (is_active ? 1 : 0) : existing.is_active,
        req.user.userId,
        req.params.id,
      ]
    );

    res.json({ message: 'DPPR rule updated.' });
  } catch (err) {
    console.error('PUT /api/admin/dppr/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/admin/dppr/:id/toggle ─────────────────────────────────────────
router.patch('/dppr/:id/toggle', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const scope = orgScope(req);
    const params = [req.params.id];
    let where = 'WHERE id = ?';
    if (scope) { where += ' AND org_id = ?'; params.push(scope); }

    const [[rule]] = await pool.execute(`SELECT id, is_active FROM dppr_rules ${where}`, params);
    if (!rule) return res.status(404).json({ error: 'Rule not found.' });

    const newState = rule.is_active ? 0 : 1;
    await pool.execute(
      'UPDATE dppr_rules SET is_active = ?, updated_by = ?, updated_at = NOW() WHERE id = ?',
      [newState, req.user.userId, req.params.id]
    );
    res.json({ message: `Rule ${newState ? 'enabled' : 'disabled'}.`, is_active: newState });
  } catch (err) {
    console.error('PATCH /api/admin/dppr/:id/toggle error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/admin/dppr/:id ────────────────────────────────────────────────
router.delete('/dppr/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const scope = orgScope(req);
    const params = [req.params.id];
    let where = 'WHERE id = ?';
    if (scope) { where += ' AND org_id = ?'; params.push(scope); }

    const [[rule]] = await pool.execute(`SELECT id FROM dppr_rules ${where}`, params);
    if (!rule) return res.status(404).json({ error: 'Rule not found.' });

    await pool.execute(
      'UPDATE dppr_rules SET is_active = 0, updated_by = ?, updated_at = NOW() WHERE id = ?',
      [req.user.userId, req.params.id]
    );
    res.json({ message: 'Rule deactivated.' });
  } catch (err) {
    console.error('DELETE /api/admin/dppr/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Individual DPPR — Case-level overrides ────────────────────────────────────

// GET /api/admin/dppr/cases/:caseId/overrides
router.get('/dppr/cases/:caseId/overrides', authenticate, async (req, res) => {
  try {
    const [overrides] = await pool.execute(
      `SELECT o.*, u.name AS created_by_name
       FROM case_dppr_overrides o
       LEFT JOIN users u ON u.id = o.created_by
       WHERE o.case_id = ? AND o.org_id = ?`,
      [req.params.caseId, req.user.orgId ?? req.query.org_id]
    );

    // Also pull active tenant rules for comparison
    const [tenantRules] = await pool.execute(
      'SELECT id, domain, action, retention_days FROM dppr_rules WHERE org_id = ? AND is_active = 1',
      [req.user.orgId ?? req.query.org_id]
    );

    res.json({ overrides, tenant_rules: tenantRules });
  } catch (err) {
    console.error('GET case dppr overrides error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/dppr/cases/:caseId/overrides — upsert, must be >= restrictive than tenant
router.put('/dppr/cases/:caseId/overrides', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { domain, action, retention_days, override_reason } = req.body;
    if (!domain || !action) return res.status(400).json({ error: 'domain and action are required.' });

    const orgId = req.user.orgId ?? (req.body.org_id ? parseInt(req.body.org_id, 10) : null);
    if (!orgId) return res.status(400).json({ error: 'org_id required.' });

    // Validate against most restrictive tenant rule for this domain
    const [tenantRules] = await pool.execute(
      'SELECT action, retention_days FROM dppr_rules WHERE org_id = ? AND domain = ? AND is_active = 1',
      [orgId, domain]
    );

    if (tenantRules.length > 0) {
      const maxTenantAction = tenantRules.reduce((max, r) =>
        ACTION_RANK[r.action] > ACTION_RANK[max] ? r.action : max, 'None'
      );
      const minTenantRetention = Math.min(...tenantRules.map(r => r.retention_days));

      if (ACTION_RANK[action] < ACTION_RANK[maxTenantAction]) {
        return res.status(400).json({
          error: `Override action "${action}" is less restrictive than tenant rule "${maxTenantAction}". Individual DPPR must be equal or more restrictive.`,
        });
      }
      if (retention_days !== undefined && parseInt(retention_days, 10) > minTenantRetention) {
        return res.status(400).json({
          error: `Override retention_days (${retention_days}) is longer than tenant rule (${minTenantRetention}). Individual DPPR must be equal or shorter.`,
        });
      }
    }

    await pool.execute(
      `INSERT INTO case_dppr_overrides
         (case_id, org_id, domain, action, retention_days, override_reason, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         action = VALUES(action),
         retention_days = VALUES(retention_days),
         override_reason = VALUES(override_reason),
         updated_by = VALUES(updated_by),
         updated_at = NOW()`,
      [
        req.params.caseId, orgId, domain, action,
        retention_days !== undefined ? parseInt(retention_days, 10) : 365,
        override_reason || null,
        req.user.userId, req.user.userId,
      ]
    );

    res.json({ message: 'Case DPPR override saved.' });
  } catch (err) {
    console.error('PUT case dppr overrides error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/dppr/cases/:caseId/overrides/:domain
router.delete('/dppr/cases/:caseId/overrides/:domain', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    await pool.execute(
      'DELETE FROM case_dppr_overrides WHERE case_id = ? AND domain = ?',
      [req.params.caseId, req.params.domain]
    );
    res.json({ message: 'Override removed.' });
  } catch (err) {
    console.error('DELETE case dppr override error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
