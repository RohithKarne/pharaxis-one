/**
 * admin/orgs.js — Organisations & Sites API
 * Admin only. Manages pharma client companies and their sites.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

// GET /api/admin/orgs — list all (superadmin sees all; admin sees only their org)
router.get('/', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const isSA = req.user.role === 'superadmin';
    const [orgs] = await pool.execute(
      isSA ? 'SELECT * FROM organisations ORDER BY name'
           : 'SELECT * FROM organisations WHERE id = ? ORDER BY name',
      isSA ? [] : [req.user.orgId]
    );
    res.json({ orgs });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/admin/orgs — create (superadmin only — clients cannot self-provision)
router.post('/', authenticate, requireRole('superadmin'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Organisation name is required.' });
  try {
    const [result] = await pool.execute('INSERT INTO organisations (name) VALUES (?)', [name.trim()]);
    await audit(req.user.userId, req.user.email, 'CREATE', 'organisation', result.insertId, { name });
    const [[row]] = await pool.execute('SELECT created_at FROM organisations WHERE id = ?', [result.insertId]);
    res.status(201).json({ id: result.insertId, name, is_active: 1, created_at: row.created_at });
  } catch (e) {
    res.status(409).json({ error: 'Organisation name already exists.' });
  }
});

// PUT /api/admin/orgs/:id — update (superadmin only)
router.put('/:id', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { name, is_active } = req.body;
    await pool.execute(
      'UPDATE organisations SET name = ?, is_active = ?, updated_at = NOW() WHERE id = ?',
      [name ?? null, is_active ? 1 : 0, req.params.id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'organisation', req.params.id, { name, is_active });
    res.json({ message: 'Updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/admin/orgs/:id/sites — list sites for an org
router.get('/:id/sites', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const [sites] = await pool.execute('SELECT * FROM sites WHERE org_id = ? ORDER BY name', [req.params.id]);
    res.json({ sites });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/admin/orgs/:id/sites — create site (superadmin only)
router.post('/:id/sites', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { name, country, is_primary } = req.body;
    if (!name) return res.status(400).json({ error: 'Site name is required.' });
    const [result] = await pool.execute(
      'INSERT INTO sites (org_id, name, country, is_primary) VALUES (?, ?, ?, ?)',
      [req.params.id, name.trim(), country || null, is_primary ? 1 : 0]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'site', result.insertId, { name, country });
    const [[row]] = await pool.execute('SELECT created_at FROM sites WHERE id = ?', [result.insertId]);
    res.status(201).json({ id: result.insertId, name, country, is_primary, is_active: 1, created_at: row.created_at });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PUT /api/admin/sites/:id — update site (superadmin only)
router.put('/sites/:id', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { name, country, is_primary, is_active } = req.body;
    await pool.execute(
      'UPDATE sites SET name = ?, country = ?, is_primary = ?, is_active = ? WHERE id = ?',
      [name ?? null, country ?? null, is_primary ? 1 : 0, is_active ? 1 : 0, req.params.id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'site', req.params.id, req.body);
    res.json({ message: 'Updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

module.exports = router;
