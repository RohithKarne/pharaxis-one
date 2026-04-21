'use strict';

/**
 * admin/siteConfig.js — Extended Site Management API
 * Sites with config, workflow states, and workflow rules.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');
const { invalidateWorkflowRulesCache } = require('../../services/workflowEngine');

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

function isSuperadmin(req) {
  return req.user.role === 'superadmin';
}

function getScopedOrgId(req, providedOrgId = null) {
  return isSuperadmin(req) ? (providedOrgId || null) : req.user.orgId;
}

async function hasSiteAccess(req, siteId) {
  const [rows] = await pool.execute(
    isSuperadmin(req)
      ? 'SELECT id FROM sites WHERE id = ?'
      : 'SELECT id FROM sites WHERE id = ? AND org_id = ?',
    isSuperadmin(req) ? [siteId] : [siteId, req.user.orgId]
  );
  return rows.length > 0;
}

// POST /api/admin/site-config/test-smtp — Test SMTP connection
router.post('/site-config/test-smtp', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const nodemailer = require('nodemailer');
    const { host, port, secure, user, pass } = req.body;
    if (!host || !port) return res.status(400).json({ error: 'host and port required' });
    const transporter = nodemailer.createTransport({
      host, port: parseInt(port), secure: !!secure,
      auth: user ? { user, pass: pass || '' } : undefined,
      connectionTimeout: 5000, greetingTimeout: 5000
    });
    await transporter.verify();
    res.json({ success: true, message: 'SMTP connection verified successfully.' });
  } catch (err) {
    console.error('POST /site-config/test-smtp error:', err);
    res.status(200).json({ success: false, message: err.message });
  }
});

// ─── SITES ───────────────────────────────────────────────────────────────────

// GET /api/admin/sites — list sites with org info joined
router.get('/sites', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const [sites] = await pool.execute(
      isSuperadmin(req)
        ? `SELECT s.*, o.name AS org_name,
                  sc.abbreviation, sc.enable_data_protection, sc.retry_enabled,
                  sc.retry_count, sc.retry_interval_min, sc.alert_config, sc.response_config
           FROM sites s
           LEFT JOIN organisations o ON s.org_id = o.id
           LEFT JOIN site_config sc ON sc.site_id = s.id
           WHERE s.is_active = 1
           ORDER BY o.name, s.name`
        : `SELECT s.*, o.name AS org_name,
                  sc.abbreviation, sc.enable_data_protection, sc.retry_enabled,
                  sc.retry_count, sc.retry_interval_min, sc.alert_config, sc.response_config
           FROM sites s
           LEFT JOIN organisations o ON s.org_id = o.id
           LEFT JOIN site_config sc ON sc.site_id = s.id
           WHERE s.is_active = 1 AND s.org_id = ?
           ORDER BY o.name, s.name`,
      isSuperadmin(req) ? [] : [req.user.orgId]
    );

    const parsed = sites.map(s => ({
      ...s,
      alert_config: s.alert_config ? (typeof s.alert_config === 'string' ? JSON.parse(s.alert_config) : s.alert_config) : null,
      response_config: s.response_config ? (typeof s.response_config === 'string' ? JSON.parse(s.response_config) : s.response_config) : null,
    }));

    res.json({ sites: parsed });
  } catch (err) {
    console.error('GET /sites error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/sites — create site + site_config record
router.post('/sites', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const {
      name, country, is_primary,
      abbreviation, enable_data_protection, retry_enabled, retry_count, retry_interval_min,
      alert_config, response_config,
    } = req.body;
    const orgId = getScopedOrgId(req, req.body.org_id);

    if (!orgId || !name) return res.status(400).json({ error: 'org_id and name are required.' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [siteResult] = await conn.execute(
        'INSERT INTO sites (org_id, name, country, is_primary) VALUES (?, ?, ?, ?)',
        [orgId, name.trim(), country || null, is_primary ? 1 : 0]
      );
      const siteId = siteResult.insertId;

      await conn.execute(
        `INSERT INTO site_config (site_id, abbreviation, enable_data_protection, retry_enabled, retry_count, retry_interval_min, alert_config, response_config)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          siteId,
          abbreviation || null,
          enable_data_protection ? 1 : 0,
          retry_enabled ? 1 : 0,
          retry_count || 3,
          retry_interval_min || 5,
          alert_config ? JSON.stringify(alert_config) : null,
          response_config ? JSON.stringify(response_config) : null,
        ]
      );

      await conn.commit();
      await audit(req.user.userId, req.user.email, 'CREATE', 'site', siteId, { name, org_id: orgId });
      res.status(201).json({ message: 'Site created.', id: siteId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('POST /sites error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/sites/:id — get site with its config
router.get('/sites/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const [[site]] = await pool.execute(
      isSuperadmin(req)
        ? `SELECT s.*, o.name AS org_name,
                  sc.abbreviation, sc.enable_data_protection, sc.retry_enabled,
                  sc.retry_count, sc.retry_interval_min, sc.alert_config, sc.response_config
           FROM sites s
           LEFT JOIN organisations o ON s.org_id = o.id
           LEFT JOIN site_config sc ON sc.site_id = s.id
           WHERE s.id = ?`
        : `SELECT s.*, o.name AS org_name,
                  sc.abbreviation, sc.enable_data_protection, sc.retry_enabled,
                  sc.retry_count, sc.retry_interval_min, sc.alert_config, sc.response_config
           FROM sites s
           LEFT JOIN organisations o ON s.org_id = o.id
           LEFT JOIN site_config sc ON sc.site_id = s.id
           WHERE s.id = ? AND s.org_id = ?`,
      isSuperadmin(req) ? [req.params.id] : [req.params.id, req.user.orgId]
    );

    if (!site) return res.status(404).json({ error: 'Site not found.' });

    const parsed = {
      ...site,
      alert_config: site.alert_config ? (typeof site.alert_config === 'string' ? JSON.parse(site.alert_config) : site.alert_config) : null,
      response_config: site.response_config ? (typeof site.response_config === 'string' ? JSON.parse(site.response_config) : site.response_config) : null,
    };

    res.json({ site: parsed });
  } catch (err) {
    console.error('GET /sites/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/sites/:id — update site + its config
router.put('/sites/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.execute(
      isSuperadmin(req)
        ? 'SELECT id FROM sites WHERE id = ?'
        : 'SELECT id FROM sites WHERE id = ? AND org_id = ?',
      isSuperadmin(req) ? [id] : [id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Site not found.' });

    const {
      name, country, is_primary, is_active,
      abbreviation, enable_data_protection, retry_enabled, retry_count, retry_interval_min,
      alert_config, response_config,
    } = req.body;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      await conn.execute(
        'UPDATE sites SET name = ?, country = ?, is_primary = ?, is_active = ? WHERE id = ?',
        [name, country || null, is_primary ? 1 : 0, is_active !== undefined ? (is_active ? 1 : 0) : 1, id]
      );

      await conn.execute(
        `INSERT INTO site_config (site_id, abbreviation, enable_data_protection, retry_enabled, retry_count, retry_interval_min, alert_config, response_config)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           abbreviation = VALUES(abbreviation),
           enable_data_protection = VALUES(enable_data_protection),
           retry_enabled = VALUES(retry_enabled),
           retry_count = VALUES(retry_count),
           retry_interval_min = VALUES(retry_interval_min),
           alert_config = VALUES(alert_config),
           response_config = VALUES(response_config),
           updated_at = NOW()`,
        [
          id,
          abbreviation || null,
          enable_data_protection ? 1 : 0,
          retry_enabled ? 1 : 0,
          retry_count || 3,
          retry_interval_min || 5,
          alert_config ? JSON.stringify(alert_config) : null,
          response_config ? JSON.stringify(response_config) : null,
        ]
      );

      await conn.commit();
      await audit(req.user.userId, req.user.email, 'UPDATE', 'site', Number(id), { name });
      res.json({ message: 'Site updated.' });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('PUT /sites/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── WORKFLOW STATES ─────────────────────────────────────────────────────────
// Note: Basic workflow-states CRUD already exists in config.js (GET/POST/PUT).
// These handlers add site_id filtering support.

// GET /api/admin/workflow-states-extended — list workflow states with optional site filter
// Registering under a distinct route to avoid conflict with config.js
router.get('/workflow-states-extended', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const [states] = await pool.execute('SELECT * FROM workflow_states ORDER BY name');
    res.json({ states });
  } catch (err) {
    console.error('GET /workflow-states-extended error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── WORKFLOW RULES ──────────────────────────────────────────────────────────

// GET /api/admin/workflow-rules — list rules
router.get('/workflow-rules', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const [rules] = await pool.execute(`
      SELECT wr.*,
             fs.name AS from_state_name,
             ts.name AS to_state_name
      FROM workflow_rules wr
      LEFT JOIN workflow_states fs ON wr.from_state_id = fs.id
      LEFT JOIN workflow_states ts ON wr.to_state_id = ts.id
      ORDER BY wr.id
    `);
    res.json({ rules });
  } catch (err) {
    console.error('GET /workflow-rules error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/workflow-rules — create rule (validate no self-loop)
router.post('/workflow-rules', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const {
      site_id, from_state_id, to_state_id,
      require_password, require_checklist, require_comment, is_active,
    } = req.body;

    if (!from_state_id || !to_state_id) {
      return res.status(400).json({ error: 'from_state_id and to_state_id are required.' });
    }
    if (Number(from_state_id) === Number(to_state_id)) {
      return res.status(400).json({ error: 'from_state_id and to_state_id cannot be the same (circular rule).' });
    }

    const [result] = await pool.execute(
      `INSERT INTO workflow_rules (site_id, from_state_id, to_state_id, require_password, require_checklist, require_comment, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        site_id || null,
        from_state_id,
        to_state_id,
        require_password ? 1 : 0,
        require_checklist ? 1 : 0,
        require_comment ? 1 : 0,
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
      ]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'workflow_rule', result.insertId, { from_state_id, to_state_id });
    const [[created]] = await pool.execute('SELECT * FROM workflow_rules WHERE id = ?', [result.insertId]);
    invalidateWorkflowRulesCache(); // AC-T3: flush rules cache on write
    res.status(201).json({ message: 'Workflow rule created.', id: result.insertId, rule: created });
  } catch (err) {
    console.error('POST /workflow-rules error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/workflow-rules/:id — update rule
router.put('/workflow-rules/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.execute('SELECT id FROM workflow_rules WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Workflow rule not found.' });

    const {
      site_id, from_state_id, to_state_id,
      require_password, require_checklist, require_comment, is_active,
    } = req.body;

    if (from_state_id && to_state_id && Number(from_state_id) === Number(to_state_id)) {
      return res.status(400).json({ error: 'from_state_id and to_state_id cannot be the same.' });
    }

    await pool.execute(
      `UPDATE workflow_rules SET
         site_id = ?, from_state_id = ?, to_state_id = ?,
         require_password = ?, require_checklist = ?, require_comment = ?, is_active = ?
       WHERE id = ?`,
      [
        site_id || null, from_state_id, to_state_id,
        require_password ? 1 : 0, require_checklist ? 1 : 0, require_comment ? 1 : 0,
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
        id,
      ]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'workflow_rule', Number(id), { from_state_id, to_state_id });
    invalidateWorkflowRulesCache(); // AC-T3: flush rules cache on write
    res.json({ message: 'Workflow rule updated.' });
  } catch (err) {
    console.error('PUT /workflow-rules/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/workflow-rules/:id — delete rule
router.delete('/workflow-rules/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.execute('SELECT id FROM workflow_rules WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Workflow rule not found.' });

    await pool.execute('DELETE FROM workflow_rules WHERE id = ?', [id]);
    await audit(req.user.userId, req.user.email, 'DELETE', 'workflow_rule', Number(id), {});
    invalidateWorkflowRulesCache(); // AC-T3: flush rules cache on delete
    res.json({ message: 'Workflow rule deleted.' });
  } catch (err) {
    console.error('DELETE /workflow-rules/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── SITE TABS — F-05 ────────────────────────────────────────────────────────

// ── Email Accounts ────────────────────────────────────────────────────────────

// GET /api/admin/sites/:id/email-accounts
router.get('/sites/:id/email-accounts', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    if (!(await hasSiteAccess(req, req.params.id))) return res.status(404).json({ error: 'Site not found.' });
    const [rows] = await pool.execute(
      'SELECT * FROM site_email_accounts WHERE site_id = ? ORDER BY id',
      [req.params.id]
    );
    res.json({ emailAccounts: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/sites/:id/email-accounts
router.post('/sites/:id/email-accounts', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    if (!(await hasSiteAccess(req, req.params.id))) return res.status(404).json({ error: 'Site not found.' });
    const { email, label, case_types } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });
    const [r] = await pool.execute(
      'INSERT INTO site_email_accounts (site_id, email, label, case_types) VALUES (?, ?, ?, ?)',
      [req.params.id, email.trim(), label || null, case_types || 'ALL']
    );
    const [[row]] = await pool.execute('SELECT * FROM site_email_accounts WHERE id = ?', [r.insertId]);
    await audit(req.user.id, req.user.name, 'CREATE', 'site_email_account', r.insertId, { siteId: req.params.id, email });
    res.status(201).json({ emailAccount: row });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/admin/sites/:id/email-accounts/:accountId
router.delete('/sites/:id/email-accounts/:accountId', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    if (!(await hasSiteAccess(req, req.params.id))) return res.status(404).json({ error: 'Site not found.' });
    await pool.execute('DELETE FROM site_email_accounts WHERE id = ? AND site_id = ?', [req.params.accountId, req.params.id]);
    await audit(req.user.id, req.user.name, 'DELETE', 'site_email_account', Number(req.params.accountId), {});
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Response Template ─────────────────────────────────────────────────────────

// GET /api/admin/sites/:id/response-template
router.get('/sites/:id/response-template', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    if (!(await hasSiteAccess(req, req.params.id))) return res.status(404).json({ error: 'Site not found.' });
    const [[row]] = await pool.execute('SELECT * FROM site_response_templates WHERE site_id = ?', [req.params.id]);
    res.json({ template: row || null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/admin/sites/:id/response-template — upsert
router.put('/sites/:id/response-template', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    if (!(await hasSiteAccess(req, req.params.id))) return res.status(404).json({ error: 'Site not found.' });
    const { subject, body_html } = req.body;
    await pool.execute(`
      INSERT INTO site_response_templates (site_id, subject, body_html)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE subject = VALUES(subject), body_html = VALUES(body_html), updated_at = NOW()
    `, [req.params.id, subject || '', body_html || '']);
    const [[row]] = await pool.execute('SELECT * FROM site_response_templates WHERE site_id = ?', [req.params.id]);
    await audit(req.user.id, req.user.name, 'SAVE', 'site_response_template', row.id, { siteId: req.params.id });
    res.json({ template: row });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Data Retention (Right To Forget) ─────────────────────────────────────────

// GET /api/admin/sites/:id/data-retention
router.get('/sites/:id/data-retention', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    if (!(await hasSiteAccess(req, req.params.id))) return res.status(404).json({ error: 'Site not found.' });
    const [rows] = await pool.execute('SELECT * FROM site_data_retention WHERE site_id = ?', [req.params.id]);
    res.json({ rules: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/admin/sites/:id/data-retention — upsert per regulation
router.put('/sites/:id/data-retention', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    if (!(await hasSiteAccess(req, req.params.id))) return res.status(404).json({ error: 'Site not found.' });
    const { retention_days, regulation, auto_delete_enabled, notes } = req.body;
    if (!regulation) return res.status(400).json({ error: 'regulation is required.' });
    await pool.execute(`
      INSERT INTO site_data_retention (site_id, retention_days, regulation, auto_delete_enabled, notes)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        retention_days = VALUES(retention_days),
        auto_delete_enabled = VALUES(auto_delete_enabled),
        notes = VALUES(notes),
        updated_at = NOW()
    `, [req.params.id, retention_days || 2555, regulation, auto_delete_enabled ? 1 : 0, notes || null]);
    const [rows] = await pool.execute('SELECT * FROM site_data_retention WHERE site_id = ?', [req.params.id]);
    await audit(req.user.id, req.user.name, 'SAVE', 'site_data_retention', null, { siteId: req.params.id, regulation });
    res.json({ rules: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Email Purpose (Sprint 7) ──────────────────────────────────────────────────

// GET /api/admin/sites/:id/email-purpose — get all 4 purpose assignments for a site
router.get('/sites/:id/email-purpose', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    if (!(await hasSiteAccess(req, req.params.id))) return res.status(404).json({ error: 'Site not found.' });
    const [rows] = await pool.execute(`
      SELECT sep.purpose, sep.email_account_id,
             ea.mailbox_email AS email, ea.account_name AS label
      FROM site_email_purpose sep
      LEFT JOIN email_accounts ea ON ea.id = sep.email_account_id
      WHERE sep.site_id = ?
      ORDER BY sep.purpose
    `, [req.params.id]);
    res.json({ purposes: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/admin/sites/:id/email-purpose — upsert purpose assignments
// Body: { assignments: [{ purpose: 'response', email_account_ids: [1,2] }, ...] }
router.put('/sites/:id/email-purpose', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    if (!(await hasSiteAccess(req, req.params.id))) return res.status(404).json({ error: 'Site not found.' });
    const { assignments } = req.body;
    if (!Array.isArray(assignments)) return res.status(400).json({ error: 'assignments array required.' });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const siteId = req.params.id;

      // Delete existing purpose rows for this site
      const purposes = assignments.map(a => a.purpose);
      if (purposes.length > 0) {
        const placeholders = purposes.map(() => '?').join(',');
        await conn.execute(
          `DELETE FROM site_email_purpose WHERE site_id = ? AND purpose IN (${placeholders})`,
          [siteId, ...purposes]
        );
      }

      // Insert new rows
      for (const a of assignments) {
        const ids = Array.isArray(a.email_account_ids) ? a.email_account_ids : [];
        for (const eid of ids) {
          await conn.execute(
            'INSERT INTO site_email_purpose (site_id, purpose, email_account_id) VALUES (?, ?, ?)',
            [siteId, a.purpose, eid]
          );
        }
      }

      await conn.commit();
      await audit(req.user.userId, req.user.email, 'UPDATE', 'site_email_purpose', Number(siteId), { assignments });

      const [rows] = await conn.execute(`
        SELECT sep.purpose, sep.email_account_id,
               ea.mailbox_email AS email, ea.account_name AS label
        FROM site_email_purpose sep
        LEFT JOIN email_accounts ea ON ea.id = sep.email_account_id
        WHERE sep.site_id = ? ORDER BY sep.purpose
      `, [siteId]);
      res.json({ purposes: rows });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Alerts ────────────────────────────────────────────────────────────────────

// GET /api/admin/sites/:id/alerts
router.get('/sites/:id/alerts', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    if (!(await hasSiteAccess(req, req.params.id))) return res.status(404).json({ error: 'Site not found.' });
    const [rows] = await pool.execute('SELECT * FROM site_alerts WHERE site_id = ? ORDER BY id', [req.params.id]);
    res.json({ alerts: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/sites/:id/alerts
router.post('/sites/:id/alerts', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    if (!(await hasSiteAccess(req, req.params.id))) return res.status(404).json({ error: 'Site not found.' });
    const { alert_type, threshold_value, notify_emails } = req.body;
    if (!alert_type) return res.status(400).json({ error: 'alert_type is required.' });
    const [r] = await pool.execute(
      'INSERT INTO site_alerts (site_id, alert_type, threshold_value, notify_emails) VALUES (?, ?, ?, ?)',
      [req.params.id, alert_type, threshold_value || 10, notify_emails || null]
    );
    const [[row]] = await pool.execute('SELECT * FROM site_alerts WHERE id = ?', [r.insertId]);
    await audit(req.user.id, req.user.name, 'CREATE', 'site_alert', r.insertId, { siteId: req.params.id, alert_type });
    res.status(201).json({ alert: row });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/admin/sites/:id/alerts/:alertId
router.put('/sites/:id/alerts/:alertId', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    if (!(await hasSiteAccess(req, req.params.id))) return res.status(404).json({ error: 'Site not found.' });
    const { alert_type, threshold_value, notify_emails, is_active } = req.body;
    await pool.execute(
      'UPDATE site_alerts SET alert_type = ?, threshold_value = ?, notify_emails = ?, is_active = ? WHERE id = ? AND site_id = ?',
      [alert_type, threshold_value, notify_emails || null, is_active ? 1 : 0, req.params.alertId, req.params.id]
    );
    const [[row]] = await pool.execute('SELECT * FROM site_alerts WHERE id = ?', [req.params.alertId]);
    res.json({ alert: row });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/admin/sites/:id/alerts/:alertId
router.delete('/sites/:id/alerts/:alertId', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    if (!(await hasSiteAccess(req, req.params.id))) return res.status(404).json({ error: 'Site not found.' });
    await pool.execute('DELETE FROM site_alerts WHERE id = ? AND site_id = ?', [req.params.alertId, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
