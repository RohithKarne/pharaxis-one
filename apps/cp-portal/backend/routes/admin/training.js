'use strict';

/**
 * Admin CME & REMS Training — /api/admin/training
 * CRUD management of educational modules per tenant client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');

// GET /api/admin/training/:clientId — list modules for client
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM cp_training_modules WHERE client_id = ? ORDER BY id DESC',
      [req.params.clientId]
    );
    res.json({ modules: rows });
  } catch (err) {
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
    res.json({ id: result.insertId, message: 'Training module created.' });
  } catch (err) {
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
    res.json({ message: 'Training module deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
