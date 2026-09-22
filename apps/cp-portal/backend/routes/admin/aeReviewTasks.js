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
 *   confirmed_ae            CPPM-18: a real side effect — restricted to the safety
 *                           role. Creates a new adverse_event submission that syncs
 *                           to MIMS by the ordinary path (and its retries). The
 *                           original submission is never reclassified (PD-2).
 *
 * CPPM-18: a task comes from a form submission OR a chat conversation.
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
const log = require('../../utils/logger');
const { syncToIntegration } = require('../portal/submit');

const OUTCOMES = ['reviewed_not_ae', 'cleared_administrative', 'confirmed_ae'];
const CLINICAL_ROLES = ['safety_reviewer', 'superadmin'];
const MIN_REASON = 10;

/**
 * CPPM-18: the confirmed side effect as a new adverse_event submission. The
 * reporter is whoever raised the task — the form's submitter or the chat user.
 */
async function createAeSubmission(conn, clientId, task, { productName, eventDescription, eventDate, reviewer }) {
  let reporter;
  if (task.submission_id) {
    const [[s]] = await conn.execute(
      'SELECT user_id, submitter_name, submitter_email, submitter_type FROM cp_submissions WHERE id = ?', [task.submission_id]);
    reporter = { userId: s.user_id, name: s.submitter_name, email: s.submitter_email, type: s.submitter_type };
  } else {
    const [[u]] = await conn.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email, c.user_type FROM cp_chat_conversations c
         LEFT JOIN cp_portal_users u ON u.id = c.portal_user_id AND u.client_id = c.client_id
        WHERE c.id = ?`, [task.chat_conversation_id]);
    reporter = { userId: u?.id || null, name: [u?.first_name, u?.last_name].filter(Boolean).join(' ') || null, email: u?.email || null, type: u?.user_type || null };
  }
  const formData = {
    name: reporter.name, email: reporter.email, user_type: reporter.type,
    product_name: productName, event_description: eventDescription, event_date: eventDate,
    source: task.submission_id ? 'safety_review_form' : 'safety_review_chat',
    review_task_id: task.id, confirmed_by: reviewer || null,
  };
  const [r] = await conn.execute(
    `INSERT INTO cp_submissions (client_id, submission_type, user_id, submitter_name, submitter_email, submitter_type, form_data)
     VALUES (?, 'adverse_event', ?, ?, ?, ?, ?)`,
    [clientId, reporter.userId, reporter.name, reporter.email, reporter.type, JSON.stringify(formData)]);
  return r.insertId;
}

// GET /api/admin/ae-review/:clientId?status=open|closed
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const status = ['open', 'closed'].includes(req.query.status) ? req.query.status : 'open';
    const [rows] = await pool.execute(
      `SELECT t.id, t.submission_id, t.chat_conversation_id, t.status, t.outcome, t.outcome_reason, t.reported_detail,
              t.ae_submission_id, t.closed_at, t.created_at,
              IF(t.chat_conversation_id IS NULL, 'form', 'chat') AS source,
              a.name AS closed_by_name,
              COALESCE(s.submission_type, 'chat') AS submission_type,
              COALESCE(s.submitter_name, NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '')) AS submitter_name,
              COALESCE(s.submitter_email, u.email) AS submitter_email,
              COALESCE(s.submitted_at, t.created_at) AS submitted_at, s.form_data,
              ae.status AS ae_sync_status, ae.external_ref AS ae_mims_case_id
         FROM cp_ae_review_tasks t
    LEFT JOIN cp_submissions s ON s.id = t.submission_id
    LEFT JOIN cp_chat_conversations c ON c.id = t.chat_conversation_id AND c.client_id = t.client_id
    LEFT JOIN cp_portal_users u ON u.id = c.portal_user_id AND u.client_id = t.client_id
    LEFT JOIN cp_submissions ae ON ae.id = t.ae_submission_id
    LEFT JOIN cp_admin_users a ON a.id = t.closed_by
        WHERE t.client_id = ? AND t.status = ?
        ORDER BY t.created_at ASC`,
      [req.params.clientId, status]
    );
    res.json({ items: rows });
  } catch (err) {
    log.error('admin.aeReviewTasks.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
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
    log.error('admin.aeReviewTasks.error', { err, route: 'GET /:clientId/count', path: req.path, request_id: req.requestId || null });
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
    if ((outcome === 'reviewed_not_ae' || outcome === 'confirmed_ae') && !CLINICAL_ROLES.includes(req.admin.role)) {
      return res.status(403).json({
        error: 'Only a safety reviewer can record a clinical outcome. Use "Clear administratively" with a reason instead.',
      });
    }
    const cleanReason = String(reason || '').trim();
    if (outcome === 'cleared_administrative' && cleanReason.length < MIN_REASON) {
      return res.status(400).json({ error: `A reason of at least ${MIN_REASON} characters is required to clear this task.` });
    }
    // A confirmed side effect becomes a case in MIMS; the two things MIMS triage
    // cannot start without are the product and what happened.
    const productName = String(req.body.product_name || '').trim();
    const eventDescription = String(req.body.event_description || '').trim();
    if (outcome === 'confirmed_ae' && (!productName || eventDescription.length < MIN_REASON)) {
      return res.status(400).json({ error: `To confirm a side effect, name the product and describe what happened (at least ${MIN_REASON} characters).` });
    }

    const [[task]] = await pool.execute(
      'SELECT id, status, submission_id, chat_conversation_id FROM cp_ae_review_tasks WHERE id = ? AND client_id = ?',
      [req.params.taskId, req.params.clientId]
    );
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    // Two reviewers on the same task: the second must not silently overwrite the
    // first one's decision.
    if (task.status === 'closed') return res.status(409).json({ error: 'This task is already closed.' });

    // Close the task and, for a confirmed side effect, create its AE submission in
    // one transaction: a task must never read "confirmed" with no case behind it.
    let aeSubmissionId = null;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.execute(
        `UPDATE cp_ae_review_tasks
            SET status = 'closed', outcome = ?, outcome_reason = ?, closed_by = ?, closed_at = NOW()
          WHERE id = ? AND client_id = ? AND status = 'open'`,
        [outcome, cleanReason || null, req.admin.adminId, req.params.taskId, req.params.clientId]
      );
      // Lost the race between the SELECT and the UPDATE.
      if (result.affectedRows === 0) {
        await conn.rollback();
        return res.status(409).json({ error: 'This task is already closed.' });
      }
      if (outcome === 'confirmed_ae') {
        aeSubmissionId = await createAeSubmission(conn, req.params.clientId, task,
          { productName, eventDescription, eventDate: req.body.event_date || null, reviewer: req.admin.name });
        await conn.execute('UPDATE cp_ae_review_tasks SET ae_submission_id = ? WHERE id = ?', [aeSubmissionId, task.id]);
      }
      await conn.commit();
    } catch (txErr) {
      await conn.rollback().catch(() => {});
      throw txErr;
    } finally {
      conn.release();
    }

    await audit(req.admin, req.params.clientId, 'AE_REVIEW_CLOSED', 'ae_review_task', req.params.taskId,
      { outcome, reason: cleanReason || null, ...(aeSubmissionId ? { ae_submission_id: aeSubmissionId } : {}) });

    if (!aeSubmissionId) return res.json({ message: 'Task closed.' });

    // Send to MIMS. syncToIntegration records its own failure as failed_sync, which
    // the MIMS retry job re-drives — so a MIMS outage delays the case, never loses it.
    await syncToIntegration(Number(req.params.clientId), aeSubmissionId, 'adverse_event')
      .catch(err => log.error('admin.aeReviewTasks.confirmed_sync_error', { err, ae_submission_id: aeSubmissionId }));
    const [[ae]] = await pool.execute('SELECT status, external_ref FROM cp_submissions WHERE id = ?', [aeSubmissionId]);
    res.json({
      message: ae.status === 'synced' ? `Confirmed and sent to MIMS as case ${ae.external_ref}.`
        : ae.status === 'failed_sync' ? 'Confirmed. MIMS could not be reached — it will be retried automatically.'
        : 'Confirmed. No MIMS connection is set up for this client, so the case is held in the portal.',
      ae_submission_id: aeSubmissionId, sync_status: ae.status, mims_case_id: ae.external_ref || null,
    });
  } catch (err) {
    log.error('admin.aeReviewTasks.error', { err, route: 'POST /:clientId/:taskId/close', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
