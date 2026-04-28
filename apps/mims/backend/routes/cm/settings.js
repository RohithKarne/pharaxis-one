'use strict';
/**
 * cm/settings.js — CM Org-Level Settings API
 * Stores org-wide defaults: alert_days, default_alert_email_account_id, default_alert_roles
 */
const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');

function orgId(req) { return Number(req.user?.orgId || 0); }

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
