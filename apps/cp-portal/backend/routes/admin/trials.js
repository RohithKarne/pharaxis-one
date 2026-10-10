'use strict';

/**
 * Admin Clinical Trials — /api/admin/trials
 * CRUD management of clinical trial listings per tenant client
 */

const express = require('express');
const router  = express.Router();
const cache = require('../../utils/cache');
// CPPM-121: the portal keeps its settings for 20 seconds (CP-22). A successful write
// here changes what the portal offers — a page switched on or off, or a trial or
// training module that decides whether its page shows — so the copy is cleared at once.
router.use((req, res, next) => {
  if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) cache.invalidate('config:'); });
  next();
});
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const log = require('../../utils/logger');
const { audit, changesBetween } = require('../../utils/audit');

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
    // Row 21: a new trial is never live straight away. It is saved as a draft, or sent
    // for review, and someone else publishes it.
    const sendForReview = req.body.publish_status === 'review';
    const [result] = await pool.execute(
      `INSERT INTO cp_clinical_trials (client_id, nct_id, title, phase, indication, status, site_location, pi, publish_status, submitted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.clientId, nct_id, title, phase || 'Phase III', indication, status || 'Recruiting', site_location || '', pi || '',
       sendForReview ? 'review' : 'draft', sendForReview ? req.admin.adminId : null]
    );
    await audit(req.admin, req.params.clientId, 'CREATE', 'clinical_trial', result.insertId, { nct_id, title, publish_status: sendForReview ? 'review' : 'draft' });
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
    const ROW = 'SELECT * FROM cp_clinical_trials WHERE id = ? AND client_id = ?';
    const [[before]] = await pool.execute(ROW, [req.params.trialId, req.params.clientId]);
    const [r] = await pool.execute(`UPDATE cp_clinical_trials SET ${sets.join(', ')} WHERE id = ? AND client_id = ?`, values);
    if (!r.affectedRows) return res.status(404).json({ error: 'Not found.' });
    const [[after]] = await pool.execute(ROW, [req.params.trialId, req.params.clientId]);
    // CPPM-43: what changed, from → to — not just which fields the screen sent.
    await audit(req.admin, req.params.clientId, 'UPDATE', 'clinical_trial', Number(req.params.trialId), { changes: changesBetween(before, after, ALLOWED) });
    res.json({ message: 'Updated.' });
  } catch (err) {
    log.error('admin.trials.error', { err, route: 'PUT /:clientId/:trialId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/trials/:clientId/:trialId/publishing — move a trial along
// draft → review → published (CP ease-of-use plan, phase 3 row 21; Rohith, 10 Oct
// 2026: trials need review before going live). Body: { to: 'review' | 'published' | 'draft' }.
//   review    from draft: anyone who may change trials sends it for review.
//   published from review: an admin who did not send it for review.
//   draft     from review: the sender takes it back, or an admin sends it back;
//             from published: an admin takes it off the portal.
const PUBLISH_ROLES = ['superadmin', 'admin'];
const TRIAL_MOVES = { draft: ['review'], review: ['published', 'draft'], published: ['draft'] };
router.post('/:clientId/:trialId/publishing', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { clientId, trialId } = req.params;
    const to = req.body.to;
    const [[trial]] = await pool.execute('SELECT id, title, publish_status, submitted_by FROM cp_clinical_trials WHERE id = ? AND client_id = ?', [trialId, clientId]);
    if (!trial) return res.status(404).json({ error: 'Not found.' });
    const from = trial.publish_status;
    if (!(TRIAL_MOVES[from] || []).includes(to)) {
      return res.status(409).json({ error: `This trial is ${WORDS[from] || from}, so it cannot be ${WORDS_TO[to] || to} now. Reload the page.` });
    }
    const isAdmin = PUBLISH_ROLES.includes(req.admin.role);
    const isSender = trial.submitted_by != null && trial.submitted_by === req.admin.adminId;
    if (to === 'published') {
      if (!isAdmin) return res.status(403).json({ error: 'Only an admin can publish a trial.' });
      if (isSender) return res.status(403).json({ error: 'You sent this trial for review, so someone else must publish it.' });
    }
    if (to === 'draft' && !isAdmin && !(from === 'review' && isSender)) {
      return res.status(403).json({ error: 'Only an admin, or the person who sent it for review, can do that.' });
    }
    const [r] = await pool.execute(
      `UPDATE cp_clinical_trials SET publish_status = ?, submitted_by = ?, updated_at = NOW()
        WHERE id = ? AND client_id = ? AND publish_status = ?`,
      [to, to === 'review' ? req.admin.adminId : to === 'published' ? trial.submitted_by : null, trialId, clientId, from]
    );
    if (!r.affectedRows) return res.status(409).json({ error: 'Someone else changed this trial just now. Reload the page.' });
    await audit(req.admin, clientId, 'UPDATE', 'clinical_trial', Number(trialId), { changes: { publish_status: { from, to } } });
    res.json({ message: { review: 'Sent for review.', published: 'Published. Doctors can see it now.', draft: from === 'published' ? 'Taken off the portal.' : 'Sent back to draft.' }[to] });
  } catch (err) {
    log.error('admin.trials.error', { err, route: 'POST /:clientId/:trialId/publishing', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});
const WORDS = { draft: 'a draft', review: 'waiting for review', published: 'live in the portal' };
const WORDS_TO = { draft: 'sent back to draft', review: 'sent for review', published: 'published' };

// DELETE /api/admin/trials/:clientId/:trialId — delete clinical trial
router.delete('/:clientId/:trialId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM cp_clinical_trials WHERE id = ? AND client_id = ?',
      [req.params.trialId, req.params.clientId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Not found.' });
    await audit(req.admin, req.params.clientId, 'DELETE', 'clinical_trial', Number(req.params.trialId), {});
    res.json({ message: 'Trial deleted.' });
  } catch (err) {
    log.error('admin.trials.error', { err, route: 'DELETE /:clientId/:trialId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
