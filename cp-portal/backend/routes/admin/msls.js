/**
 * Admin MSLs — /api/admin/msls
 * Medical Science Liaison directory per client
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');

router.get('/:clientId', authenticateAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM cp_msls WHERE client_id = ? ORDER BY display_order ASC, name ASC').all(req.params.clientId);
  res.json({ msls: rows.map(r => ({ ...r, therapeutic_areas: r.therapeutic_areas ? JSON.parse(r.therapeutic_areas) : [] })) });
});

router.post('/:clientId', authenticateAdmin, (req, res) => {
  const { name, title, specialty, region, territory, email, phone, profile_image_url, therapeutic_areas, display_order } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const info = db.prepare(`
    INSERT INTO cp_msls (client_id, name, title, specialty, region, territory, email, phone, profile_image_url, therapeutic_areas, display_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.clientId, name, title || null, specialty || null, region || null, territory || null, email || null, phone || null, profile_image_url || null, therapeutic_areas ? JSON.stringify(therapeutic_areas) : null, display_order || 0);
  audit(req.admin, req.params.clientId, 'CREATE', 'msl', info.lastInsertRowid, { name });
  res.status(201).json({ id: info.lastInsertRowid, message: 'MSL created.' });
});

router.patch('/:clientId/:id', authenticateAdmin, (req, res) => {
  const allowed = ['name', 'title', 'specialty', 'region', 'territory', 'email', 'phone', 'profile_image_url', 'display_order', 'is_active'];
  const updates = [], params = [];
  for (const key of allowed) {
    if (req.body[key] !== undefined) { updates.push(`${key} = ?`); params.push(req.body[key]); }
  }
  if (req.body.therapeutic_areas !== undefined) {
    updates.push('therapeutic_areas = ?');
    params.push(JSON.stringify(req.body.therapeutic_areas));
  }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
  params.push(req.params.id, req.params.clientId);
  db.prepare(`UPDATE cp_msls SET ${updates.join(', ')}, updated_at=datetime('now') WHERE id=? AND client_id=?`).run(...params);
  audit(req.admin, req.params.clientId, 'UPDATE', 'msl', req.params.id, {});
  res.json({ message: 'MSL updated.' });
});

router.delete('/:clientId/:id', authenticateAdmin, (req, res) => {
  db.prepare(`UPDATE cp_msls SET is_active=0, updated_at=datetime('now') WHERE id=? AND client_id=?`).run(req.params.id, req.params.clientId);
  audit(req.admin, req.params.clientId, 'DELETE', 'msl', req.params.id, {});
  res.json({ message: 'MSL deactivated.' });
});

module.exports = router;
