/**
 * Admin Templates — /api/admin/templates
 * Reply templates per client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const log = require('../../utils/logger');

router.use('/:clientId', authenticateAdmin, requireClientAccess);

router.get('/:clientId', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM cp_templates WHERE client_id=? AND is_active=1 ORDER BY name ASC', [req.params.clientId]);
    res.json({ templates: rows });
  } catch (err) {
    log.error('admin.templates.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/:clientId', authenticateAdmin, async (req, res) => {
  try {
    const { name, subject, body, category } = req.body;
    if (!name || !body) return res.status(400).json({ error: 'name and body are required.' });
    const [result] = await pool.execute(
      `INSERT INTO cp_templates (client_id, name, subject, body, category) VALUES (?,?,?,?,?)`,
      [req.params.clientId, name, subject ?? null, body, category ?? null]
    );
    res.status(201).json({ id: result.insertId, message: 'Template created.' });
  } catch (err) {
    log.error('admin.templates.error', { err, route: 'POST /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.patch('/:clientId/:id', authenticateAdmin, async (req, res) => {
  try {
    const allowed = ['name', 'subject', 'body', 'category', 'is_active'];
    const updates = [], params = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) { updates.push(`${key}=?`); params.push(req.body[key]); }
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
    updates.push(`updated_at=NOW()`);
    params.push(req.params.id, req.params.clientId);
    await pool.execute(`UPDATE cp_templates SET ${updates.join(',')} WHERE id=? AND client_id=?`, params);
    res.json({ message: 'Template updated.' });
  } catch (err) {
    log.error('admin.templates.error', { err, route: 'PATCH /:clientId/:id', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/:clientId/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.execute(`UPDATE cp_templates SET is_active=0 WHERE id=? AND client_id=?`, [req.params.id, req.params.clientId]);
    res.json({ message: 'Template deleted.' });
  } catch (err) {
    log.error('admin.templates.error', { err, route: 'DELETE /:clientId/:id', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
