/**
 * Admin Templates — /api/admin/templates
 * Reply templates per client
 */

const express = require('express');
const router  = express.Router();
const db      = require('../../database/db');
const { authenticateAdmin } = require('../../middleware/auth');

router.get('/:clientId', authenticateAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM cp_templates WHERE client_id=? AND is_active=1 ORDER BY name ASC').all(req.params.clientId);
  res.json({ templates: rows });
});

router.post('/:clientId', authenticateAdmin, (req, res) => {
  const { name, subject, body, category } = req.body;
  if (!name || !body) return res.status(400).json({ error: 'name and body are required.' });
  const info = db.prepare(`INSERT INTO cp_templates (client_id, name, subject, body, category) VALUES (?,?,?,?,?)`)
    .run(req.params.clientId, name, subject || null, body, category || null);
  res.status(201).json({ id: info.lastInsertRowid, message: 'Template created.' });
});

router.patch('/:clientId/:id', authenticateAdmin, (req, res) => {
  const allowed = ['name', 'subject', 'body', 'category', 'is_active'];
  const updates = [], params = [];
  for (const key of allowed) { if (req.body[key] !== undefined) { updates.push(`${key}=?`); params.push(req.body[key]); } }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
  updates.push(`updated_at=datetime('now')`);
  params.push(req.params.id, req.params.clientId);
  db.prepare(`UPDATE cp_templates SET ${updates.join(',')} WHERE id=? AND client_id=?`).run(...params);
  res.json({ message: 'Template updated.' });
});

router.delete('/:clientId/:id', authenticateAdmin, (req, res) => {
  db.prepare(`UPDATE cp_templates SET is_active=0 WHERE id=? AND client_id=?`).run(req.params.id, req.params.clientId);
  res.json({ message: 'Template deleted.' });
});

module.exports = router;
