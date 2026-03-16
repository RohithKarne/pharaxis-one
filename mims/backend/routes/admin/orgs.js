/**
 * admin/orgs.js — Organisations & Sites API
 * Admin only. Manages pharma client companies and their sites.
 */

const express = require('express');
const router = express.Router();
const db = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');

// Helper: log to audit trail
function audit(userId, userName, action, entity, entityId, details) {
  db.prepare(`INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
    VALUES (?, ?, ?, ?, ?, ?)`).run(userId, userName, action, entity, entityId, JSON.stringify(details));
}

// GET /api/admin/orgs — list all
router.get('/', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const orgs = db.prepare('SELECT * FROM organisations ORDER BY name').all();
  res.json({ orgs });
});

// POST /api/admin/orgs — create
router.post('/', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Organisation name is required.' });
  try {
    const result = db.prepare('INSERT INTO organisations (name) VALUES (?)').run(name.trim());
    audit(req.user.userId, req.user.email, 'CREATE', 'organisation', result.lastInsertRowid, { name });
    const created_at = db.prepare('SELECT created_at FROM organisations WHERE id = ?').get(result.lastInsertRowid).created_at;
    res.status(201).json({ id: result.lastInsertRowid, name, is_active: 1, created_at });
  } catch (e) {
    res.status(409).json({ error: 'Organisation name already exists.' });
  }
});

// PUT /api/admin/orgs/:id — update
router.put('/:id', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { name, is_active } = req.body;
  db.prepare('UPDATE organisations SET name = ?, is_active = ?, updated_at = datetime("now") WHERE id = ?')
    .run(name, is_active ? 1 : 0, req.params.id);
  audit(req.user.userId, req.user.email, 'UPDATE', 'organisation', req.params.id, { name, is_active });
  res.json({ message: 'Updated.' });
});

// GET /api/admin/orgs/:id/sites — list sites for an org
router.get('/:id/sites', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const sites = db.prepare('SELECT * FROM sites WHERE org_id = ? ORDER BY name').all(req.params.id);
  res.json({ sites });
});

// POST /api/admin/orgs/:id/sites — create site
router.post('/:id/sites', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { name, country, is_primary } = req.body;
  if (!name) return res.status(400).json({ error: 'Site name is required.' });
  const result = db.prepare('INSERT INTO sites (org_id, name, country, is_primary) VALUES (?, ?, ?, ?)')
    .run(req.params.id, name.trim(), country || null, is_primary ? 1 : 0);
  audit(req.user.userId, req.user.email, 'CREATE', 'site', result.lastInsertRowid, { name, country });
  const created_at = db.prepare('SELECT created_at FROM sites WHERE id = ?').get(result.lastInsertRowid).created_at;
  res.status(201).json({ id: result.lastInsertRowid, name, country, is_primary, is_active: 1, created_at });
});

// PUT /api/admin/sites/:id — update site
router.put('/sites/:id', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const { name, country, is_primary, is_active } = req.body;
  db.prepare('UPDATE sites SET name = ?, country = ?, is_primary = ?, is_active = ? WHERE id = ?')
    .run(name, country, is_primary ? 1 : 0, is_active ? 1 : 0, req.params.id);
  audit(req.user.userId, req.user.email, 'UPDATE', 'site', req.params.id, req.body);
  res.json({ message: 'Updated.' });
});

module.exports = router;
