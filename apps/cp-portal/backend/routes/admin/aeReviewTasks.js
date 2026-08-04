/**
 * Admin AE Review Queue — /api/admin/ae-review
 * PD-2: safety review tasks raised when a portal submitter reports that someone
 * became unwell.
 *
 * The control is that a task CANNOT be closed without a recorded outcome, and
 * that the two outcomes stay distinct:
 *
 *   reviewed_not_ae         a clinical judgement — restricted to the safety role
 *   cleared_administrative  housekeeping (stale, duplicate, not required) — any
 *                           admin, but a reason is mandatory
 *
 * Same button for both and within a year every task closes as "reviewed" and the
 * number means nothing (Sowmya). The split is what makes the aged-out rate a
 * metric someone can actually report on (Vasu).
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');

const OUTCOMES = ['reviewed_not_ae', 'cleared_administrative'];
const CLINICAL_ROLES = ['safety_reviewer', 'superadmin'];
const MIN_REASON = 10;

// GET /api/admin/ae-review/:clientId?status=open|closed
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const status = ['open', 'closed'].includes(req.query.status) ? req.query.status : 'open';
    const [rows] = await pool.execute(
      `SELECT t.id, t.submission_id, t.status, t.outcome, t.outcome_reason, t.reported_detail,
              t.closed_at, t.created_at,
              a.name AS closed_by_name,
              s.submission_type, s.submitter_name, s.submitter_email, s.submitted_at, s.form_data
         FROM cp_ae_review_tasks t
         JOIN cp_submissions s ON s.id = t.submission_id
    LEFT JOIN cp_admin_users a ON a.id = t.closed_by
        WHERE t.client_id = ? AND t.status = ?
        ORDER BY t.created_at ASC`,
      [req.params.clientId, status]
    );
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/ae-review/:clientId/count — badge for the sidebar
router.get('/:clientId/count', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [[row]] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM cp_ae_review_tasks WHERE client_id = ? AND status = 'open'`,
      [req.params.clientId]
    );
    res.json({ count: row.cnt });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/ae-review/:clientId/:taskId/close
router.post('/:clientId/:taskId/close', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { outcome, reason } = req.body;

    // A task closed with no outcome is the failure mode this whole feature exists
    // to prevent — a queue that empties without anyone deciding anything.
    if (!outcome || !OUTCOMES.includes(outcome)) {
      return res.status(400).json({ error: 'An outcome is required to close this task.' });
    }

    // The clinical judgement is restricted. The administrative one is not, but it
    // has to say why — that reason is what makes the aged-out rate readable later.
    if (outcome === 'reviewed_not_ae' && !CLINICAL_ROLES.includes(req.admin.role)) {
      return res.status(403).json({
        error: 'Only a safety reviewer can record a clinical outcome. Use "Clear administratively" with a reason instead.',
      });
    }
    const cleanReason = String(reason || '').trim();
    if (outcome === 'cleared_administrative' && cleanReason.length < MIN_REASON) {
      return res.status(400).json({ error: `A reason of at least ${MIN_REASON} characters is required to clear this task.` });
    }

    const [[task]] = await pool.execute(
      'SELECT id, status FROM cp_ae_review_tasks WHERE id = ? AND client_id = ?',
      [req.params.taskId, req.params.clientId]
    );
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    // Two reviewers on the same task: the second must not silently overwrite the
    // first one's decision.
    if (task.status === 'closed') return res.status(409).json({ error: 'This task is already closed.' });

    const [result] = await pool.execute(
      `UPDATE cp_ae_review_tasks
          SET status = 'closed', outcome = ?, outcome_reason = ?, closed_by = ?, closed_at = NOW()
        WHERE id = ? AND client_id = ? AND status = 'open'`,
      [outcome, cleanReason || null, req.admin.adminId, req.params.taskId, req.params.clientId]
    );
    // Lost the race between the SELECT and the UPDATE.
    if (result.affectedRows === 0) return res.status(409).json({ error: 'This task is already closed.' });

    await audit(req.admin, req.params.clientId, 'AE_REVIEW_CLOSED', 'ae_review_task', req.params.taskId,
      { outcome, reason: cleanReason || null });

    res.json({ message: 'Task closed.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
