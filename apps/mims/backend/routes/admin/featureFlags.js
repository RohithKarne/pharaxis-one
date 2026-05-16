'use strict';

/**
 * admin/featureFlags.js — admin CRUD for per-tenant feature flag rollout.
 * Surface for the Wave 0 Feature Flags admin screen.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const flags   = require('../../services/featureFlagsService');

const ROLE = ['admin', 'superadmin'];

// GET /api/admin/feature-flags — full catalog (per-flag rollout summary)
router.get('/feature-flags', authenticate, requireRole(...ROLE), async (_req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT f.id, f.flag_key, f.label, f.description, f.wave, f.theme,
             f.default_state, f.is_strict_mode, f.created_at, f.updated_at,
             COUNT(tf.id) AS enabled_tenant_count
        FROM feature_flags f
   LEFT JOIN tenant_feature_flags tf ON tf.flag_id = f.id AND tf.enabled = 1
    GROUP BY f.id
    ORDER BY f.wave, f.flag_key
    `);
    res.json({ flags: rows });
  } catch (err) {
    console.error('GET /feature-flags error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/feature-flags/:id/tenants — enabled-state per active org
router.get('/feature-flags/:id/tenants', authenticate, requireRole(...ROLE), async (req, res) => {
  try {
    const [[flag]] = await pool.execute('SELECT id, flag_key, label FROM feature_flags WHERE id = ?', [req.params.id]);
    if (!flag) return res.status(404).json({ error: 'Flag not found.' });
    const [rows] = await pool.execute(`
      SELECT o.id AS org_id, o.name AS org_name, o.is_active,
             COALESCE(tf.enabled, 0) AS enabled,
             tf.enabled_at, tf.notes,
             u.name AS enabled_by_name
        FROM organisations o
   LEFT JOIN tenant_feature_flags tf ON tf.org_id = o.id AND tf.flag_id = ?
   LEFT JOIN users u ON u.id = tf.enabled_by
       WHERE o.is_active = 1
    ORDER BY o.name ASC
    `, [flag.id]);
    res.json({ flag, tenants: rows });
  } catch (err) {
    console.error('GET /feature-flags/:id/tenants error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/feature-flags/:id/tenant/:orgId — toggle for a single tenant
router.put('/feature-flags/:id/tenant/:orgId', authenticate, requireRole(...ROLE), async (req, res) => {
  const { enabled, notes } = req.body || {};
  try {
    const [[flag]] = await pool.execute('SELECT id, flag_key FROM feature_flags WHERE id = ?', [req.params.id]);
    if (!flag) return res.status(404).json({ error: 'Flag not found.' });

    await pool.execute(`
      INSERT INTO tenant_feature_flags (flag_id, org_id, enabled, enabled_by, enabled_at, notes)
      VALUES (?, ?, ?, ?, NOW(), ?)
      ON DUPLICATE KEY UPDATE
        enabled    = VALUES(enabled),
        enabled_by = VALUES(enabled_by),
        enabled_at = VALUES(enabled_at),
        notes      = VALUES(notes),
        updated_at = NOW()
    `, [req.params.id, req.params.orgId, enabled ? 1 : 0, req.user.userId, notes || null]);

    flags.invalidate(flag.flag_key, req.params.orgId);
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /feature-flags/:id/tenant/:orgId error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/feature-flags/:id/bulk — enable/disable for many tenants at once
router.post('/feature-flags/:id/bulk', authenticate, requireRole(...ROLE), async (req, res) => {
  const { org_ids = [], enabled = true, notes } = req.body || {};
  if (!Array.isArray(org_ids) || !org_ids.length) {
    return res.status(400).json({ error: 'org_ids (array) is required.' });
  }
  try {
    const [[flag]] = await pool.execute('SELECT id, flag_key FROM feature_flags WHERE id = ?', [req.params.id]);
    if (!flag) return res.status(404).json({ error: 'Flag not found.' });
    for (const oid of org_ids) {
      await pool.execute(`
        INSERT INTO tenant_feature_flags (flag_id, org_id, enabled, enabled_by, enabled_at, notes)
        VALUES (?, ?, ?, ?, NOW(), ?)
        ON DUPLICATE KEY UPDATE
          enabled = VALUES(enabled), enabled_by = VALUES(enabled_by),
          enabled_at = VALUES(enabled_at), notes = VALUES(notes), updated_at = NOW()
      `, [req.params.id, oid, enabled ? 1 : 0, req.user.userId, notes || null]);
    }
    flags.invalidate(flag.flag_key);
    res.json({ ok: true, count: org_ids.length });
  } catch (err) {
    console.error('POST /feature-flags/:id/bulk error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/feature-flags/resolved — public (authenticated) — flag map for current user's tenant
// Used by frontend at app boot to gate UI features.
router.get('/feature-flags/resolved', authenticate, async (req, res) => {
  try {
    const map = await flags.resolveAllForOrg(req.user.orgId ?? null);
    res.json({ flags: map });
  } catch (err) {
    console.error('GET /feature-flags/resolved error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
