'use strict';

/**
 * Admin Clinical Trials — /api/admin/trials
 * CRUD management of clinical trial listings per tenant client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');

// GET /api/admin/trials/:clientId — list trials for client
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM cp_clinical_trials WHERE client_id = ? ORDER BY id DESC',
      [req.params.clientId]
    );
    res.json({ trials: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/trials/:clientId — add clinical trial
router.post('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { nct_id, title, phase, indication, status, site_location, pi } = req.body;
    if (!nct_id || !title || !indication) {
      return res.status(400).json({ error: 'NCT ID, title, and indication are required.' });
    }
    const [result] = await pool.execute(
      `INSERT INTO cp_clinical_trials (client_id, nct_id, title, phase, indication, status, site_location, pi)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.clientId, nct_id, title, phase || 'Phase III', indication, status || 'Recruiting', site_location || '', pi || '']
    );
    res.json({ id: result.insertId, message: 'Clinical trial created.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/trials/:clientId/:trialId — delete clinical trial
router.delete('/:clientId/:trialId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    await pool.execute(
      'DELETE FROM cp_clinical_trials WHERE id = ? AND client_id = ?',
      [req.params.trialId, req.params.clientId]
    );
    res.json({ message: 'Trial deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
