'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');

// ── AC-T2: In-process dependency check cache ────────────────────────────────
// TTL-keyed Map: key → { data, expiresAt }
const _depCache = new Map();
const DEP_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function depCacheGet(key) {
  const entry = _depCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _depCache.delete(key); return null; }
  return entry.data;
}

function depCacheSet(key, data) {
  _depCache.set(key, { data, expiresAt: Date.now() + DEP_CACHE_TTL_MS });
}

// GET /api/admin/dependencies/picklist/:id
router.get('/dependencies/picklist/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const cacheKey = `picklist:${req.user.orgId}:${id}`;
    const cached = depCacheGet(cacheKey);
    if (cached) return res.json(cached);

    const [picklist] = await pool.execute('SELECT value, field_type FROM picklists WHERE id = ?', [id]);
    if (!picklist.length) return res.status(404).json({ error: 'Picklist not found.' });
    const fieldType = picklist[0].field_type;
    const [fieldUsage] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM field_setup WHERE picklist_type = ?',
      [fieldType]
    );
    const [picklistCount] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM picklists WHERE field_type = ? AND id != ?',
      [fieldType, id]
    );
    const result = {
      picklist_value: picklist[0].value,
      field_type: fieldType,
      field_setup_usage: fieldUsage[0].cnt,
      sibling_values: picklistCount[0].cnt,
      safe_to_delete: fieldUsage[0].cnt === 0,
    };
    depCacheSet(cacheKey, result);
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/admin/dependencies/user/:userId
router.get('/dependencies/user/:userId', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const cacheKey = `user:${req.user.orgId}:${userId}`;
    const cached = depCacheGet(cacheKey);
    if (cached) return res.json(cached);

    const [open] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM cases WHERE case_owner_id = ? AND is_deleted = 0',
      [userId]
    );
    const [total] = await pool.execute('SELECT COUNT(*) AS cnt FROM cases WHERE case_owner_id = ?', [userId]);
    const result = { open_cases: open[0].cnt, total_cases: total[0].cnt, safe_to_remove: open[0].cnt === 0 };
    depCacheSet(cacheKey, result);
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/admin/dependencies/org/:orgId
router.get('/dependencies/org/:orgId', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const orgId = parseInt(req.params.orgId, 10);
    const cacheKey = `org:${orgId}`;
    const cached = depCacheGet(cacheKey);
    if (cached) return res.json(cached);

    const [users] = await pool.execute('SELECT COUNT(*) AS cnt FROM user_org_access WHERE org_id = ? AND is_active = 1', [orgId]);
    const [sites] = await pool.execute('SELECT COUNT(*) AS cnt FROM sites WHERE org_id = ?', [orgId]);
    const [cases] = await pool.execute('SELECT COUNT(*) AS cnt FROM cases WHERE org_id = ?', [orgId]);
    const total = users[0].cnt + cases[0].cnt;
    const result = { active_users: users[0].cnt, sites: sites[0].cnt, cases: cases[0].cnt, safe_to_delete: total === 0 };
    depCacheSet(cacheKey, result);
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/admin/dependencies/field-definition/:id
router.get('/dependencies/field-definition/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const fieldId = parseInt(req.params.id, 10);
    const cacheKey = `field:${req.user.orgId}:${fieldId}`;
    const cached = depCacheGet(cacheKey);
    if (cached) return res.json(cached);

    const [field] = await pool.execute('SELECT field_name, field_type, picklist_type FROM field_setup WHERE id = ?', [fieldId]);
    if (!field.length) return res.status(404).json({ error: 'Field not found.' });
    const [picklists] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM picklists WHERE field_id = ?',
      [fieldId]
    );
    const result = {
      field_name: field[0].field_name,
      field_type: field[0].field_type,
      picklist_values_count: picklists[0].cnt,
      safe_to_delete: picklists[0].cnt === 0,
    };
    depCacheSet(cacheKey, result);
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
