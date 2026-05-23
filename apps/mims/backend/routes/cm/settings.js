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
    const settings = {};
    for (const row of rows) {
      settings[row.setting_key] = row.setting_value;
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

    const [mergeReportStatusRows] = await pool.execute(
      `SELECT mr.status, COUNT(*) AS total
       FROM cm_merge_reports mr
       JOIN cm_folders f ON f.id = mr.folder_id
       WHERE 1=1${scoped.clause}
       GROUP BY mr.status`,
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
        merge_reports: Object.fromEntries(mergeReportStatusRows.map((row) => [row.status, Number(row.total || 0)])),
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
    const { setting_key, setting_value } = req.body;
    if (!setting_key) return res.status(400).json({ error: 'setting_key is required.' });
    await pool.execute(
      `INSERT INTO cm_org_settings (org_id, setting_key, setting_value, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by), updated_at = NOW()`,
      [orgId(req), setting_key, JSON.stringify(setting_value), req.user?.id || null]
    );
    res.json({ message: 'Setting saved.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
