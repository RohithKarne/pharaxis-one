'use strict';

/**
 * Admin Clinical Trials — /api/admin/trials
 * CRUD management of clinical trial listings per tenant client
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const log = require('../../utils/logger');
const { audit } = require('../../utils/audit');

// GET /api/admin/trials/:clientId — list trials for client
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM cp_clinical_trials WHERE client_id = ? ORDER BY id DESC',
      [req.params.clientId]
    );
    res.json({ trials: rows });
  } catch (err) {
    log.error('admin.trials.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
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
    log.error('admin.trials.error', { err, route: 'POST /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/trials/:clientId/:trialId — correct or close an entry (CPPM-33)
router.put('/:clientId/:trialId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const ALLOWED = ['nct_id', 'title', 'phase', 'indication', 'status', 'site_location', 'pi'];
    const sets = [], values = [];
    for (const f of ALLOWED) {
      if (req.body[f] !== undefined) { sets.push(`${f} = ?`); values.push(f === 'pass_score' ? Number(req.body[f]) || 0 : String(req.body[f]).trim()); }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
    if (req.body.title !== undefined && !String(req.body.title).trim()) return res.status(400).json({ error: 'Title cannot be empty.' });
    sets.push('updated_at = NOW()');
    values.push(req.params.trialId, req.params.clientId);
    const [r] = await pool.execute(`UPDATE cp_clinical_trials SET ${sets.join(', ')} WHERE id = ? AND client_id = ?`, values);
    if (!r.affectedRows) return res.status(404).json({ error: 'Not found.' });
    await audit(req.admin, req.params.clientId, 'UPDATE', 'clinical_trial', Number(req.params.trialId), { fields: Object.keys(req.body).filter(f => ALLOWED.includes(f)) });
    res.json({ message: 'Updated.' });
  } catch (err) {
    log.error('admin.trials.error', { err, route: 'PUT /:clientId/:trialId', path: req.path, request_id: req.requestId || null });
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
    log.error('admin.trials.error', { err, route: 'DELETE /:clientId/:trialId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
