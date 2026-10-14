'use strict';
/**
 * cm/settings.js — CM Org-Level Settings API
 * Stores org-wide defaults: alert_days, default_alert_email_account_id, default_alert_roles
 */
const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const { hasGlobalAdminScope } = require('../../utils/adminScope');

function orgId(req) { return Number(req.user?.orgId || 0); }
function hasPlatformAdminScope(req) { return hasGlobalAdminScope(req.user); }

function getScopedOrgId(req) {
  if (!hasPlatformAdminScope(req)) return orgId(req);
  const requested = Number(req.query.org_id || req.body?.org_id || 0);
  return requested > 0 ? requested : null;
}

// The settings this screen keeps, and what each may hold. Any key was accepted.
const ALERT_ROLES = ['admin', 'manager', 'content_manager', 'agent', 'reviewer'];
const parseValue = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch (_) { return v; } };
const cleanDays = (v) => (Array.isArray(v) ? [...new Set(v.map(Number).filter((d) => Number.isInteger(d) && d > 0 && d <= 3650))].sort((a, b) => a - b) : null);

// A mailbox that can send, in this organisation (or null).
async function orgMailbox(id, org) {
  if (id === null || id === undefined || id === '') return { ok: true, value: null };
  const [[box]] = await pool.execute('SELECT id FROM email_accounts WHERE id = ? AND org_id = ? AND is_active = 1 AND smtp_host IS NOT NULL', [Number(id), org]);
  return box ? { ok: true, value: box.id } : { ok: false };
}

function scopedFilterSql(scopedOrgId) {
  return {
    clause: scopedOrgId ? ' AND f.org_id = ?' : '',
    params: scopedOrgId ? [scopedOrgId] : [],
  };
}

// GET /api/cm/settings — get all settings for org
router.get('/settings', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT setting_key, setting_value FROM cm_org_settings WHERE org_id = ?',
      [orgId(req)]
    );
    // Values are stored as JSON text; they were sent as text, so the screen
    // found no list and showed saved alert days and roles as empty.
    const settings = {};
    for (const row of rows) {
      settings[row.setting_key] = parseValue(row.setting_value);
    }
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/overview', authenticate, async (req, res) => {
  try {
    const scopedOrgId = getScopedOrgId(req);
    const scoped = scopedFilterSql(scopedOrgId);

    const [documentStatusRows] = await pool.execute(
      `SELECT d.status, COUNT(*) AS total
       FROM cm_documents d
       JOIN cm_folders f ON f.id = d.folder_id
       WHERE 1=1${scoped.clause}
       GROUP BY d.status`,
      scoped.params
    );

    const [faqStatusRows] = await pool.execute(
      `SELECT q.status, COUNT(*) AS total
       FROM cm_faqs q
       JOIN cm_folders f ON f.id = q.folder_id
       WHERE 1=1${scoped.clause}
       GROUP BY q.status`,
      scoped.params
    );

    const [templateStatusRows] = await pool.execute(
      `SELECT t.status, COUNT(*) AS total
       FROM cm_templates t
       JOIN cm_folders f ON f.id = t.folder_id
       WHERE 1=1${scoped.clause}
       GROUP BY t.status`,
      scoped.params
    );

    const [expiringDocuments] = await pool.execute(
      `SELECT d.id, d.doc_id, d.name, d.status, d.expiry_date, f.name AS folder_name
       FROM cm_documents d
       JOIN cm_folders f ON f.id = d.folder_id
       WHERE d.expiry_date IS NOT NULL
         AND d.status <> 'Archived'
         AND d.expiry_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
         ${scoped.clause}
       ORDER BY d.expiry_date ASC
       LIMIT 8`,
      scoped.params
    );

    const [checkedOutDocuments] = await pool.execute(
      `SELECT d.id, d.doc_id, d.name, d.checkout_expires_at, d.checked_out_at,
              u.name AS checked_out_by_name, f.name AS folder_name
       FROM cm_documents d
       JOIN cm_folders f ON f.id = d.folder_id
       LEFT JOIN users u ON u.id = d.checked_out_by
       WHERE d.status = 'CheckedOut'
         ${scoped.clause}
       ORDER BY d.checkout_expires_at IS NULL ASC, d.checkout_expires_at ASC, d.updated_at DESC
       LIMIT 8`,
      scoped.params
    );

    res.json({
      counts: {
        documents: Object.fromEntries(documentStatusRows.map((row) => [row.status, Number(row.total || 0)])),
        faqs: Object.fromEntries(faqStatusRows.map((row) => [row.status, Number(row.total || 0)])),
        templates: Object.fromEntries(templateStatusRows.map((row) => [row.status, Number(row.total || 0)])),
      },
      queues: {
        expiring_documents: expiringDocuments,
        checked_out_documents: checkedOutDocuments,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/cm/settings — upsert a setting key
router.put('/settings', authenticate, async (req, res) => {
  try {
    const { setting_key } = req.body;
    let { setting_value } = req.body;
    if (setting_key === 'default_alert_days') {
      setting_value = cleanDays(setting_value);
      if (!setting_value) return res.status(400).json({ error: 'Alert days must be a list of whole days.' });
    } else if (setting_key === 'default_alert_roles') {
      if (!Array.isArray(setting_value) || setting_value.some((r) => !ALERT_ROLES.includes(r))) {
        return res.status(400).json({ error: `Roles must be from: ${ALERT_ROLES.join(', ')}.` });
      }
    } else if (setting_key === 'default_alert_email_account_id') {
      const box = await orgMailbox(setting_value, orgId(req));
      if (!box.ok) return res.status(400).json({ error: 'That mailbox is not an active sending mailbox of this organisation.' });
      setting_value = box.value;
    } else {
      return res.status(400).json({ error: 'Unknown setting.' });
    }
    await pool.execute(
      `INSERT INTO cm_org_settings (org_id, setting_key, setting_value, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by), updated_at = NOW()`,
      [orgId(req), setting_key, JSON.stringify(setting_value), req.user?.userId || null] /* WP5: was req.user.id (undefined) — actor id is req.user.userId */
    );
    res.json({ message: 'Setting saved.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cm/publishing-checks — the checks run before content is published
// (and before a template goes into a letter), read-only. They were built-in
// defaults with no reachable screen.
router.get('/publishing-checks', authenticate, async (req, res) => {
  try {
    const { listEvidenceRules } = require('../../services/contentIntelligenceService');
    const org = orgId(req);
    const out = [];
    for (const [type, mode] of [['document', 'publish'], ['faq', 'publish'], ['template', 'response']]) {
      for (const r of await listEvidenceRules(org, type, mode)) {
        out.push({ content: type, name: r.rule_name, check_type: r.check_type, config: r.check_config, severity: r.severity });
      }
    }
    res.json({ checks: out });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/mailboxes — the organisation's sending mailboxes, for expiry
// alerts. The screens read the admin mailbox list, which refuses content
// managers, and showed names from fields that do not exist.
router.get('/mailboxes', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, account_name AS name, COALESCE(from_email, mailbox_email) AS address, smtp_host
         FROM email_accounts WHERE org_id = ? AND is_active = 1 AND smtp_host IS NOT NULL ORDER BY account_name`,
      [orgId(req)]);
    res.json({ mailboxes: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
module.exports.orgMailbox = orgMailbox;
module.exports.cleanDays = cleanDays;
