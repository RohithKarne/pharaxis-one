/**
 * admin/orgs.js — Organisations & Sites API
 * Admin only. Manages pharma client companies and their sites.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { bootstrapOrg, getOrgReadiness } = require('../../services/orgBootstrapService');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');
const { logAudit } = require('../../utils/auditLog');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
const { cloneOrgConfig } = require('../../services/orgCloningService');

// WP1: non-platform admins may only access resources for their OWN org. Returns
// true (and sends 403) when a tenant admin targets another org via the URL.
function denyCrossOrg(req, res, pathOrgId) {
  if (!hasGlobalAdminScope(req.user) && Number(pathOrgId) !== Number(req.user.orgId)) {
    res.status(403).json({ error: 'You can only access your own organisation.' });
    return true;
  }
  return false;
}

// GET /api/admin/orgs — list all (platform admin sees all; admin sees only their org)
router.get('/', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const isSA = hasGlobalAdminScope(req.user);
    const [orgs] = await pool.execute(
      isSA ? 'SELECT * FROM organisations ORDER BY name'
           : 'SELECT * FROM organisations WHERE id = ? ORDER BY name',
      isSA ? [] : [req.user.orgId]
    );
    res.json({ orgs });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/admin/orgs — create (platform-admin only — clients cannot self-provision)
router.post('/', authenticate, requireRole('platform_admin'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Organisation name is required.' });
  try {
    const [result] = await pool.execute('INSERT INTO organisations (name) VALUES (?)', [name.trim()]);
    await logAudit(req.user.userId, req.user.email, 'CREATE', 'organisation', result.insertId, { name });
    const readiness = await bootstrapOrg(result.insertId, req.user.userId);
    const [[row]] = await pool.execute('SELECT created_at FROM organisations WHERE id = ?', [result.insertId]);
    res.status(201).json({ id: result.insertId, name, is_active: 1, created_at: row.created_at, readiness });
  } catch (e) {
    res.status(409).json({ error: 'Organisation name already exists.' });
  }
});

// POST /api/admin/orgs/clone — clone org (platform-admin only)
router.post('/clone', authenticate, requireRole('platform_admin'), async (req, res) => {
  const { source_org_id, target_name } = req.body;
  if (!source_org_id || !target_name) {
    return res.status(400).json({ error: 'source_org_id and target_name are required.' });
  }
  try {
    const result = await cloneOrgConfig({
      sourceOrgId: source_org_id,
      targetName: target_name.trim(),
      createdByUserId: req.user.userId,
      createdByEmail: req.user.email
    });
    res.status(201).json({ newOrgId: result.newOrgId, name: result.targetName, message: `Successfully cloned into ${result.targetName}` });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to clone organisation.' });
  }
});

// PUT /api/admin/orgs/:id — update (platform-admin only)
router.put('/:id', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const { name, is_active } = req.body;
    const [[current]] = await pool.execute('SELECT name, is_active FROM organisations WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Organisation not found.' });
    if (!current.is_active && is_active === 1) {
      const readiness = await getOrgReadiness(Number(req.params.id));
      if (!readiness.ready) {
        return res.status(409).json({ error: 'Organisation is not ready for activation.', readiness });
      }
    }
    await pool.execute(
      'UPDATE organisations SET name = ?, is_active = ?, updated_at = NOW() WHERE id = ?',
      [name ?? null, is_active ? 1 : 0, req.params.id]
    );
    await logAudit(req.user.userId, req.user.email, 'UPDATE', 'organisation', req.params.id, { name, is_active }, current, { name, is_active: is_active ? 1 : 0 });
    res.json({ message: 'Updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/admin/orgs/:id/sites — list sites for an org
router.get('/:id/sites', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    if (denyCrossOrg(req, res, req.params.id)) return;
    const [sites] = await pool.execute('SELECT * FROM sites WHERE org_id = ? ORDER BY name', [req.params.id]);
    res.json({ sites });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/admin/orgs/:id/sites — create site (platform-admin only)
router.post('/:id/sites', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const { name, country, is_primary } = req.body;
    if (!name) return res.status(400).json({ error: 'Site name is required.' });
    const [result] = await pool.execute(
      'INSERT INTO sites (org_id, name, country, is_primary) VALUES (?, ?, ?, ?)',
      [req.params.id, name.trim(), country || null, is_primary ? 1 : 0]
    );
    await logAudit(req.user.userId, req.user.email, 'CREATE', 'site', result.insertId, { name, country });
    const [[row]] = await pool.execute('SELECT created_at FROM sites WHERE id = ?', [result.insertId]);
    res.status(201).json({ id: result.insertId, name, country, is_primary, is_active: 1, created_at: row.created_at });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PUT /api/admin/sites/:id — update site (platform-admin only)
router.put('/sites/:id', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const { name, country, is_primary, is_active } = req.body;
    const [[siteCurrent]] = await pool.execute('SELECT name, country, is_primary, is_active FROM sites WHERE id = ?', [req.params.id]);
    if (!siteCurrent) return res.status(404).json({ error: 'Site not found.' });
    await pool.execute(
      'UPDATE sites SET name = ?, country = ?, is_primary = ?, is_active = ? WHERE id = ?',
      [name ?? null, country ?? null, is_primary ? 1 : 0, is_active ? 1 : 0, req.params.id]
    );
    await logAudit(req.user.userId, req.user.email, 'UPDATE', 'site', req.params.id, req.body, siteCurrent, { name, country, is_primary: is_primary ? 1 : 0, is_active: is_active ? 1 : 0 });
    res.json({ message: 'Updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/admin/orgs/:orgId/users — list users in org with access_expires_at
router.get('/:orgId/users', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    if (denyCrossOrg(req, res, req.params.orgId)) return;
    const [rows] = await pool.execute(
      `SELECT u.id, u.name, u.email, uoa.role_at_org, uoa.is_active, uoa.access_expires_at, uoa.last_accessed_at
       FROM users u
       JOIN user_org_access uoa ON uoa.user_id = u.id
       WHERE uoa.org_id = ? AND u.is_active = 1
       ORDER BY u.name`,
      [req.params.orgId]
    );
    res.json({ users: rows });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PUT /api/admin/orgs/:orgId/users/:userId/expiry — set access_expires_at
router.put('/:orgId/users/:userId/expiry', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    if (denyCrossOrg(req, res, req.params.orgId)) return;
    const { access_expires_at } = req.body;
    await pool.execute(
      'UPDATE user_org_access SET access_expires_at = ? WHERE user_id = ? AND org_id = ?',
      [access_expires_at || null, req.params.userId, req.params.orgId]
    );
    await logAudit(req.user.userId, req.user.email, 'UPDATE', 'user_org_access', req.params.userId, { access_expires_at });
    res.json({ message: 'Access expiry updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
