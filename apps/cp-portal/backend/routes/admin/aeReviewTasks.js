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
 * CPPM-6: an open task can be held by one staff member at a time — taken, released
 * or handed to a colleague — so two people do not work the same task and nobody
 * assumes somebody else has it. Every one of those moves is written to the audit
 * trail. Holding a task is never a condition for closing it: anyone who could close
 * a task before still can, and the close record names the holder when it was someone
 * else.
 *
 * Same button for both and within a year every task closes as "reviewed" and the
 * number means nothing (Sowmya). The split is what makes the aged-out rate a
 * metric someone can actually report on (Vasu).
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { auditWithin } = require('../../utils/audit');
const log = require('../../utils/logger');
const { syncToIntegration, toDateOnly } = require('../portal/submit');
const { clearAlerts } = require('../../services/adminAlerts');

const OUTCOMES = ['reviewed_not_ae', 'cleared_administrative', 'confirmed_ae'];
const CLINICAL_ROLES = ['safety_reviewer', 'superadmin'];
const MIN_REASON = 10;

// CPPM-6: any staff role except viewer can hold a task. A team lead (admin) can
// also move a task somebody else holds — that is how work is covered when the
// holder is away.
// CPPM-56: the same rule covers closing. A viewer could clear a task
// administratively, because that outcome was open to "any admin" and nothing
// excluded the read-only role.
const LEAD_ROLES = ['admin', 'superadmin'];
function requireHolder(req, res, next) {
  if (req.admin.role === 'viewer') return res.status(403).json({ error: 'A viewer can see the Safety Queue but cannot take, hand over or close a task.' });
  next();
}

// CPPM-53: a change to a task and its audit line are written together, or not at
// all. `work(conn)` does both on one connection; returning { refuse: [status, body] }
// rolls back and answers with that. Anything thrown rolls back too, and the person
// is told nothing was changed rather than left to assume it was.
const NOT_RECORDED = 'Nothing was changed, because the action could not be recorded. Please try again.';
async function changeWithAudit(res, work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await work(conn);
    if (out?.refuse) {
      await conn.rollback();
      res.status(out.refuse[0]).json(out.refuse[1]);
      return null;
    }
    await conn.commit();
    return out || {};
  } catch (err) {
    await conn.rollback().catch(() => {});
    log.error('admin.aeReviewTasks.not_recorded', { err, request_id: res.req?.requestId || null });
    res.status(500).json({ error: NOT_RECORDED });
    return null;
  } finally {
    conn.release();
  }
}

// The task as the ownership routes need it: its state and who holds it now.
async function taskWithOwner(clientId, taskId) {
  const [[task]] = await pool.execute(
    `SELECT t.id, t.status, t.owner_id, o.name AS owner_name
       FROM cp_ae_review_tasks t
  LEFT JOIN cp_admin_users o ON o.id = t.owner_id
      WHERE t.id = ? AND t.client_id = ?`,
    [taskId, clientId]
  );
  return task || null;
}

/**
 * CPPM-18: the confirmed side effect as a new adverse_event submission. The
 * reporter is whoever raised the task — the form's submitter or the chat user.
 */
async function createAeSubmission(conn, clientId, task, { productName, eventDescription, eventDate, reviewer }) {
  let reporter;
  if (task.submission_id) {
    const [[s]] = await conn.execute(
      'SELECT user_id, submitter_name, submitter_email, submitter_type, submitted_at FROM cp_submissions WHERE id = ?', [task.submission_id]);
    // CPPM-66: an erasure made before CPPM-66 could delete the request and leave the
    // review. The side effect is still reported — with the reporter unknown, dated
    // when the review was raised — rather than the confirmation failing.
    // CPPM-63: a task raised by a reply was told to us when the reply arrived, not
    // when the enquiry did — that is the task's own creation time.
    reporter = s
      ? { userId: s.user_id, name: s.submitter_name, email: s.submitter_email, type: s.submitter_type,
          reportedAt: task.reply_id ? task.created_at : s.submitted_at }
      : { userId: null, name: null, email: null, type: null, reportedAt: task.created_at };
  } else {
    const [[u]] = await conn.execute(
      `SELECT u.id, u.first_name, u.last_name, u.email, c.user_type FROM cp_chat_conversations c
         LEFT JOIN cp_portal_users u ON u.id = c.portal_user_id AND u.client_id = c.client_id
        WHERE c.id = ?`, [task.chat_conversation_id]);
    reporter = { userId: u?.id || null, name: [u?.first_name, u?.last_name].filter(Boolean).join(' ') || null, email: u?.email || null, type: u?.user_type || null, reportedAt: task.created_at };
  }
  const formData = {
    name: reporter.name, email: reporter.email, user_type: reporter.type,
    product_name: productName, event_description: eventDescription, event_date: eventDate,
    source: task.submission_id ? 'safety_review_form' : 'safety_review_chat',
    review_task_id: task.id, confirmed_by: reviewer || null,
    // Bridge row 6: the enquiry this side effect was found in, so MIMS links the two cases.
    related_reference: task.submission_id ? `CP-${String(task.submission_id).padStart(6, '0')}` : null,
    // Day zero is when the person told us, not when a reviewer confirmed it.
    awareness_date: toDateOnly(reporter.reportedAt),
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
      `SELECT t.id, t.submission_id, t.chat_conversation_id, t.reply_id, t.status, t.outcome, t.outcome_reason, t.reported_detail,
              t.ae_submission_id, t.closed_at, t.created_at,
              IF(t.chat_conversation_id IS NULL, 'form', 'chat') AS source,
              a.name AS closed_by_name,
              t.owner_id, t.owner_since, o.name AS owner_name,
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
    LEFT JOIN cp_admin_users o ON o.id = t.owner_id
        WHERE t.client_id = ? AND t.status = ?
        ORDER BY t.created_at ASC`,
      [req.params.clientId, status]
    );
    rows.forEach(r => { r.owned_by_me = r.owner_id != null && r.owner_id === req.admin.adminId; });
    res.json({ items: rows });
  } catch (err) {
    log.error('admin.aeReviewTasks.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/ae-review/:clientId/count — badge for the sidebar
router.get('/:clientId/count', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    // CPPM-6: `mine` is how many of the open tasks the signed-in person holds.
    const [[row]] = await pool.execute(
      `SELECT COUNT(*) AS cnt, COALESCE(SUM(owner_id = ?), 0) AS mine
         FROM cp_ae_review_tasks WHERE client_id = ? AND status = 'open'`,
      [req.admin.adminId, req.params.clientId]
    );
    res.json({ count: row.cnt, mine: Number(row.mine) });
  } catch (err) {
    log.error('admin.aeReviewTasks.error', { err, route: 'GET /:clientId/count', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/ae-review/:clientId/staff — who a task can be handed to (CPPM-6).
// Its own list rather than the Admin Users one, which only admins may read: a
// reviewer needs to hand a task over too. Names and roles only.
router.get('/:clientId/staff', authenticateAdmin, requireClientAccess, requireHolder, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, role FROM cp_admin_users
        WHERE client_id = ? AND is_active = 1 AND role <> 'viewer'
        ORDER BY name`,
      [req.params.clientId]
    );
    res.json({ staff: rows });
  } catch (err) {
    log.error('admin.aeReviewTasks.error', { err, route: 'GET /:clientId/staff', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/ae-review/:clientId/:taskId/take — hold an open task nobody holds (CPPM-6)
router.post('/:clientId/:taskId/take', authenticateAdmin, requireClientAccess, requireHolder, async (req, res) => {
  try {
    const done = await changeWithAudit(res, async (conn) => {
      // The check ("nobody holds it") and the write are one statement, so two people
      // pressing Take at the same moment cannot both end up holding the task.
      const [result] = await conn.execute(
        `UPDATE cp_ae_review_tasks
            SET owner_id = ?, owner_since = NOW()
          WHERE id = ? AND client_id = ? AND status = 'open' AND owner_id IS NULL`,
        [req.admin.adminId, req.params.taskId, req.params.clientId]
      );
      if (result.affectedRows === 0) {
        const task = await taskWithOwner(req.params.clientId, req.params.taskId);
        if (!task) return { refuse: [404, { error: 'Task not found.' }] };
        if (task.status === 'closed') return { refuse: [409, { error: 'This task is already closed.' }] };
        return { refuse: [409, {
          error: task.owner_id === req.admin.adminId
            ? 'You already hold this task.'
            : `${task.owner_name || 'Someone else'} is already working on this task.`,
        }] };
      }
      await auditWithin(conn, req.admin, req.params.clientId, 'AE_TASK_TAKEN', 'ae_review_task', req.params.taskId,
        { owner_id: req.admin.adminId, owner: req.admin.name });
    });
    if (done) res.json({ message: 'You now hold this task.' });
  } catch (err) {
    log.error('admin.aeReviewTasks.error', { err, route: 'POST /:clientId/:taskId/take', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/ae-review/:clientId/:taskId/release — put a held task back for anyone (CPPM-6)
router.post('/:clientId/:taskId/release', authenticateAdmin, requireClientAccess, requireHolder, async (req, res) => {
  try {
    const task = await taskWithOwner(req.params.clientId, req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    if (task.status === 'closed') return res.status(409).json({ error: 'This task is already closed.' });
    if (task.owner_id == null) return res.status(409).json({ error: 'Nobody holds this task.' });
    if (task.owner_id !== req.admin.adminId && !LEAD_ROLES.includes(req.admin.role)) {
      return res.status(403).json({ error: `Only ${task.owner_name || 'the holder'} or an admin can release this task.` });
    }
    // Only if the holder is still the one read above — otherwise somebody moved the
    // task in between and this would silently undo their change.
    const done = await changeWithAudit(res, async (conn) => {
      const [result] = await conn.execute(
        `UPDATE cp_ae_review_tasks
            SET owner_id = NULL, owner_since = NULL
          WHERE id = ? AND client_id = ? AND status = 'open' AND owner_id = ?`,
        [req.params.taskId, req.params.clientId, task.owner_id]
      );
      if (result.affectedRows === 0) return { refuse: [409, { error: 'This task changed while you were looking at it. Refresh and try again.' }] };
      await auditWithin(conn, req.admin, req.params.clientId, 'AE_TASK_RELEASED', 'ae_review_task', req.params.taskId,
        { from_id: task.owner_id, from: task.owner_name });
    });
    if (done) res.json({ message: 'Task released. Anyone can take it now.' });
  } catch (err) {
    log.error('admin.aeReviewTasks.error', { err, route: 'POST /:clientId/:taskId/release', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/ae-review/:clientId/:taskId/hand — give a task to a colleague (CPPM-6)
// The holder can hand over their own task. An admin can hand over any open task,
// held or not, which is how work is covered when the holder is away.
router.post('/:clientId/:taskId/hand', authenticateAdmin, requireClientAccess, requireHolder, async (req, res) => {
  try {
    const toId = Number(req.body.to_admin_id);
    if (!Number.isInteger(toId) || toId <= 0) return res.status(400).json({ error: 'Choose who to hand this task to.' });

    const task = await taskWithOwner(req.params.clientId, req.params.taskId);
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    if (task.status === 'closed') return res.status(409).json({ error: 'This task is already closed.' });
    if (task.owner_id !== req.admin.adminId && !LEAD_ROLES.includes(req.admin.role)) {
      return res.status(403).json({
        error: task.owner_id == null
          ? 'Take this task first, or ask an admin to hand it over.'
          : `Only ${task.owner_name || 'the holder'} or an admin can hand this task over.`,
      });
    }
    if (task.owner_id === toId) return res.status(409).json({ error: `${task.owner_name || 'That person'} already holds this task.` });

    // The receiver must be someone who could have taken it themselves: active
    // staff of this client, and not a viewer.
    const [[to]] = await pool.execute(
      `SELECT id, name FROM cp_admin_users WHERE id = ? AND client_id = ? AND is_active = 1 AND role <> 'viewer'`,
      [toId, req.params.clientId]
    );
    if (!to) return res.status(400).json({ error: 'That person cannot hold tasks for this client.' });

    // <=> also matches "nobody holds it". Same reason as release: never overwrite
    // a move somebody else made in between.
    const done = await changeWithAudit(res, async (conn) => {
      const [result] = await conn.execute(
        `UPDATE cp_ae_review_tasks
            SET owner_id = ?, owner_since = NOW()
          WHERE id = ? AND client_id = ? AND status = 'open' AND owner_id <=> ?`,
        [to.id, req.params.taskId, req.params.clientId, task.owner_id]
      );
      if (result.affectedRows === 0) return { refuse: [409, { error: 'This task changed while you were looking at it. Refresh and try again.' }] };
      await auditWithin(conn, req.admin, req.params.clientId, 'AE_TASK_HANDED', 'ae_review_task', req.params.taskId,
        { from_id: task.owner_id, from: task.owner_name || null, to_id: to.id, to: to.name });
    });
    if (done) res.json({ message: `Task handed to ${to.name}.` });
  } catch (err) {
    log.error('admin.aeReviewTasks.error', { err, route: 'POST /:clientId/:taskId/hand', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/ae-review/:clientId/:taskId/close
router.post('/:clientId/:taskId/close', authenticateAdmin, requireClientAccess, requireHolder, async (req, res) => {
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
      `SELECT t.id, t.status, t.submission_id, t.chat_conversation_id, t.reply_id, t.created_at, t.owner_id, o.name AS owner_name
         FROM cp_ae_review_tasks t
    LEFT JOIN cp_admin_users o ON o.id = t.owner_id
        WHERE t.id = ? AND t.client_id = ?`,
      [req.params.taskId, req.params.clientId]
    );
    if (!task) return res.status(404).json({ error: 'Task not found.' });
    // Two reviewers on the same task: the second must not silently overwrite the
    // first one's decision.
    if (task.status === 'closed') return res.status(409).json({ error: 'This task is already closed.' });

    // Close the task and, for a confirmed side effect, create its AE submission in
    // one transaction: a task must never read "confirmed" with no case behind it.
    // CPPM-53: the audit line is part of the same transaction.
    let aeSubmissionId = null;
    // CPPM-6: closing never needs the holder's leave, but the record says when the
    // person who closed it was not the person holding it.
    const heldByOther = task.owner_id != null && task.owner_id !== req.admin.adminId;
    const done = await changeWithAudit(res, async (conn) => {
      const [result] = await conn.execute(
        `UPDATE cp_ae_review_tasks
            SET status = 'closed', outcome = ?, outcome_reason = ?, closed_by = ?, closed_at = NOW()
          WHERE id = ? AND client_id = ? AND status = 'open'`,
        [outcome, cleanReason || null, req.admin.adminId, req.params.taskId, req.params.clientId]
      );
      // Lost the race between the SELECT and the UPDATE.
      if (result.affectedRows === 0) return { refuse: [409, { error: 'This task is already closed.' }] };
      if (outcome === 'confirmed_ae') {
        aeSubmissionId = await createAeSubmission(conn, req.params.clientId, task,
          { productName, eventDescription, eventDate: req.body.event_date || null, reviewer: req.admin.name });
        await conn.execute('UPDATE cp_ae_review_tasks SET ae_submission_id = ? WHERE id = ?', [aeSubmissionId, task.id]);
      }
      await auditWithin(conn, req.admin, req.params.clientId, 'AE_REVIEW_CLOSED', 'ae_review_task', req.params.taskId,
        { outcome, reason: cleanReason || null, ...(aeSubmissionId ? { ae_submission_id: aeSubmissionId } : {}),
          ...(heldByOther ? { held_by_id: task.owner_id, held_by: task.owner_name } : {}) });
    });
    if (!done) return;
    clearAlerts(req.params.clientId, [`safety_new:${task.id}`, `safety_wait:${task.id}`], `task closed by ${req.admin.name || req.admin.email}`);

    if (!aeSubmissionId) return res.json({ message: 'Task closed.' });

    // Send to MIMS. syncToIntegration records its own failure as failed_sync, which
    // the MIMS retry job re-drives — so a MIMS outage delays the case, never loses it.
    await syncToIntegration(Number(req.params.clientId), aeSubmissionId, 'adverse_event')
      .catch(err => log.error('admin.aeReviewTasks.confirmed_sync_error', { err, ae_submission_id: aeSubmissionId }));
    const [[ae]] = await pool.execute('SELECT status, external_ref FROM cp_submissions WHERE id = ?', [aeSubmissionId]);
    res.json({
      // CPPM-151 walk: MIMS files the case under the portal's reference, so say that, with
      // MIMS's own id in brackets for anyone looking it up there.
      message: ae.status === 'synced' ? `Confirmed and sent to MIMS as ${'CP-' + String(aeSubmissionId).padStart(6, '0')} (MIMS case ${ae.external_ref}).`
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
