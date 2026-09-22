'use strict';

/**
 * Admin CME & REMS Training — /api/admin/training
 * CRUD management of educational modules per tenant client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const log = require('../../utils/logger');
const { audit } = require('../../utils/audit');

// GET /api/admin/training/:clientId — list modules for client
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM cp_training_modules WHERE client_id = ? ORDER BY id DESC',
      [req.params.clientId]
    );
    res.json({ modules: rows });
  } catch (err) {
    log.error('admin.training.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/training/:clientId — add training module
router.post('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { title, type, duration, credits, pass_score, status } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required.' });
    const [result] = await pool.execute(
      `INSERT INTO cp_training_modules (client_id, title, type, duration, credits, pass_score, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.clientId, title, type || 'CME Accredited', duration || '30 mins', credits || '1.5 CME', Number(pass_score) || 80, status || 'Available']
    );
    await audit(req.admin, req.params.clientId, 'CREATE', 'training_module', result.insertId, { title });
    res.json({ id: result.insertId, message: 'Training module created.' });
  } catch (err) {
    log.error('admin.training.error', { err, route: 'POST /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/training/:clientId/:moduleId — correct or close an entry (CPPM-33)
router.put('/:clientId/:moduleId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const ALLOWED = ['title', 'type', 'duration', 'credits', 'pass_score', 'status'];
    const sets = [], values = [];
    for (const f of ALLOWED) {
      if (req.body[f] !== undefined) { sets.push(`${f} = ?`); values.push(f === 'pass_score' ? Number(req.body[f]) || 0 : String(req.body[f]).trim()); }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
    if (req.body.title !== undefined && !String(req.body.title).trim()) return res.status(400).json({ error: 'Title cannot be empty.' });
    sets.push('updated_at = NOW()');
    values.push(req.params.moduleId, req.params.clientId);
    const [r] = await pool.execute(`UPDATE cp_training_modules SET ${sets.join(', ')} WHERE id = ? AND client_id = ?`, values);
    if (!r.affectedRows) return res.status(404).json({ error: 'Not found.' });
    await audit(req.admin, req.params.clientId, 'UPDATE', 'training_module', Number(req.params.moduleId), { fields: Object.keys(req.body).filter(f => ALLOWED.includes(f)) });
    res.json({ message: 'Updated.' });
  } catch (err) {
    log.error('admin.training.error', { err, route: 'PUT /:clientId/:moduleId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/training/:clientId/:moduleId — delete training module
router.delete('/:clientId/:moduleId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    await pool.execute(
      'DELETE FROM cp_training_modules WHERE id = ? AND client_id = ?',
      [req.params.moduleId, req.params.clientId]
    );
    await audit(req.admin, req.params.clientId, 'DELETE', 'training_module', Number(req.params.moduleId), {});
    res.json({ message: 'Training module deleted.' });
  } catch (err) {
    log.error('admin.training.error', { err, route: 'DELETE /:clientId/:moduleId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
