/**
 * Admin Submissions — /api/admin/submissions
 * G1: View portal form submissions per client
 */

const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { audit, auditWithin } = require('../../utils/audit');
const { recordStatusEvent } = require('../../utils/submissionStatus');
const log = require('../../utils/logger');
const { queueEmail } = require('../../utils/emailOutbox');
const { downloadRefusal } = require('../../utils/virusScan');
const { requireRole } = require('../../middleware/auth');
const workOwnership = require('../../utils/workOwnership');

// GET /api/admin/submissions/:clientId
// Returns submissions with optional filter by submission_type and status
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { type, status, search } = req.query;

    // PD-2: ae_task_status surfaces the safety flag inline, so a reviewer sees it
    // in the list they already work from rather than only in the safety queue.
    let query = `
      SELECT s.id, s.submission_type, s.submitter_name, s.submitter_email,
             s.submitter_type, s.status, s.external_ref, s.submitted_at,
             s.sync_attempts, s.form_data,
             u.first_name, u.last_name, u.email AS user_email,
             -- CPPM-63: an enquiry can now hold more than one safety task (one per
             -- reply that reported harm); an open one wins, otherwise the latest.
             (SELECT t.status FROM cp_ae_review_tasks t WHERE t.submission_id = s.id
               ORDER BY t.status = 'open' DESC, t.id DESC LIMIT 1) AS ae_task_status,
             -- CPPM-63: replies that arrived after the last thing staff sent.
             (SELECT COUNT(*) FROM cp_submission_messages m
               WHERE m.submission_id = s.id AND m.direction = 'in'
                 AND m.created_at > IFNULL((SELECT MAX(x.sent_at) FROM cp_submission_messages x
                                             WHERE x.submission_id = s.id AND x.direction = 'out' AND x.status = 'sent'), '1970-01-01')
             ) AS replies_waiting,
             s.owner_id, s.owner_since, o.name AS owner_name
      FROM cp_submissions s
      LEFT JOIN cp_portal_users u ON s.user_id = u.id
      LEFT JOIN cp_admin_users o ON o.id = s.owner_id
      WHERE s.client_id = ?
    `;
    const params = [req.params.clientId];

    if (type)   { query += ' AND s.submission_type = ?'; params.push(type); }
    if (status) { query += ' AND s.status = ?';          params.push(status); }
    if (search) {
      query += ' AND (s.submitter_name LIKE ? OR s.submitter_email LIKE ? OR s.external_ref LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    query += ' ORDER BY s.submitted_at DESC LIMIT 200';

    const [rows] = await pool.execute(query, params);

    // T2: surface the user-facing CP reference (CP-0000NN) and a deep link to the
    // linked MIMS case. The MIMS case URL base is deployment config (per-client UI
    // host); when unset, the frontend simply shows the id without a link.
    // O1: prefer the per-integration case URL base; fall back to the global env.
    const [[integ]] = await pool.execute('SELECT mims_case_url_base FROM cp_integration_config WHERE client_id = ? AND is_active = 1 LIMIT 1', [req.params.clientId]);
    const caseUrlBase = (integ && integ.mims_case_url_base) || process.env.CP_MIMS_CASE_URL_BASE || null;
    rows.forEach(r => {
      r.owned_by_me = r.owner_id != null && r.owner_id === req.admin.adminId; // CPPM-61
      r.reference = `CP-${String(r.id).padStart(6, '0')}`;
      r.mims_case_url = (caseUrlBase && r.external_ref) ? caseUrlBase + encodeURIComponent(r.external_ref) : null;
    });

    // Attach uploaded files per submission
    if (rows.length > 0) {
      const ids = rows.map(r => r.id);
      const ph  = ids.map(() => '?').join(',');
      const [atts] = await pool.execute(
        `SELECT id, submission_id, file_name, file_size, mime_type, scan_status FROM cp_submission_attachments WHERE submission_id IN (${ph})`, ids);
      const bySub = {};
      atts.forEach(a => { (bySub[a.submission_id] = bySub[a.submission_id] || []).push(a); });
      rows.forEach(r => { r.attachments = bySub[r.id] || []; });
      // Bridge row 9: information the person added after sending, with where it got to.
      const [fus] = await pool.execute(
        `SELECT id, submission_id, body, forward_status, forward_error, created_at
           FROM cp_submission_followups WHERE submission_id IN (${ph}) ORDER BY id ASC`, ids);
      const fuBySub = {};
      fus.forEach(f => { (fuBySub[f.submission_id] = fuBySub[f.submission_id] || []).push(f); });
      rows.forEach(r => { r.followups = fuBySub[r.id] || []; });
    }

    // Summary counts
    const [counts] = await pool.execute(
      `SELECT submission_type, COUNT(*) as count
       FROM cp_submissions WHERE client_id = ?
       GROUP BY submission_type`,
      [req.params.clientId]
    );

    const [[total]] = await pool.execute('SELECT COUNT(*) as n FROM cp_submissions WHERE client_id = ?', [req.params.clientId]);

    res.json({ submissions: rows, counts, total: total?.n || 0 });
  } catch (err) {
    log.error('admin.submissions.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/submissions/:clientId/export?format=csv|pdf&type=&status=&search=&from=&to=
// Exports the FULL filtered dataset (no 200-row cap) for compliance/audit.
router.get('/:clientId/export', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { type, status, search, from, to, format } = req.query;

    let query = `
      SELECT s.id, s.submission_type, s.submitter_name, s.submitter_email,
             s.submitter_type, s.status, s.external_ref, s.submitted_at, s.form_data
      FROM cp_submissions s
      WHERE s.client_id = ?
    `;
    const params = [req.params.clientId];
    if (type)   { query += ' AND s.submission_type = ?'; params.push(type); }
    if (status) { query += ' AND s.status = ?';          params.push(status); }
    if (search) {
      query += ' AND (s.submitter_name LIKE ? OR s.submitter_email LIKE ? OR s.external_ref LIKE ?)';
      const x = `%${search}%`; params.push(x, x, x);
    }
    if (from) { query += ' AND s.submitted_at >= ?'; params.push(`${from} 00:00:00`); }
    if (to)   { query += ' AND s.submitted_at <= ?'; params.push(`${to} 23:59:59`); }
    query += ' ORDER BY s.submitted_at DESC';  // no LIMIT — full dataset

    const [rows] = await pool.execute(query, params);
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'pdf') {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="submissions-${req.params.clientId}-${stamp}.pdf"`);
      doc.pipe(res);
      doc.fontSize(16).text('Submissions Report');
      doc.fontSize(9).fillColor('#666').text(`Generated ${new Date().toISOString()} — ${rows.length} record(s)`);
      if (from || to) doc.text(`Date range: ${from || 'start'} to ${to || 'now'}`);
      doc.moveDown();
      if (rows.length === 0) doc.fillColor('#000').text('No submissions match the selected filters.');
      rows.forEach(r => {
        doc.fillColor('#000').font('Helvetica-Bold').fontSize(10).text(`#${r.id}  ${r.submission_type}  [${r.status}]`);
        doc.font('Helvetica').fontSize(9).fillColor('#333').text(
          `${r.submitter_name || '—'} <${r.submitter_email || '—'}>  •  ${r.submitter_type || '—'}  •  ${r.submitted_at || ''}  •  Ref ${r.external_ref || '—'}`
        );
        doc.moveDown(0.5);
      });
      doc.end();
      return;
    }

    // Default: CSV (full dataset)
    const esc = v => {
      const s = v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
      return `"${s.replace(/"/g, '""')}"`;
    };
    const header = ['ID', 'Date', 'Type', 'Submitter', 'Email', 'User Type', 'Status', 'Ref', 'Form Data'];
    const lines = rows.map(r => [
      r.id, r.submitted_at || '', r.submission_type, r.submitter_name || '', r.submitter_email || '',
      r.submitter_type || '', r.status, r.external_ref || '', r.form_data || '',
    ].map(esc).join(','));
    const csv = [header.map(esc).join(','), ...lines].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="submissions-${req.params.clientId}-${stamp}.csv"`);
    res.send(csv);
  } catch (err) {
    log.error('admin.submissions.error', { err, route: 'GET /:clientId/export', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/submissions/:clientId/attachments/:attachmentId — download a submission attachment
router.get('/:clientId/attachments/:attachmentId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [[att]] = await pool.execute(
      'SELECT file_name, file_path, mime_type, scan_status FROM cp_submission_attachments WHERE id = ? AND client_id = ?',
      [req.params.attachmentId, req.params.clientId]);
    if (!att) return res.status(404).json({ error: 'Attachment not found.' });
    const refusal = downloadRefusal(att.scan_status); // CPPM-39: only cleared files are served
    if (refusal) return res.status(refusal.status).json({ error: refusal.error });
    const abs = path.join(__dirname, '../../', att.file_path.replace(/^\//, ''));
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File missing.' });
    res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${req.query.disposition === 'inline' ? 'inline' : 'attachment'}; filename="${att.file_name}"`);
    fs.createReadStream(abs).pipe(res);
  } catch (err) {
    log.error('admin.submissions.error', { err, route: 'GET /:clientId/attachments/:attachmentId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});


// ── CPPM-61: who is working this — take, release, hand to a colleague ───────
// The rules live in utils/workOwnership.js. Any role but a viewer may hold an item
// (the admin write policy refuses a viewer before these run).
router.get('/:clientId/staff', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    res.json({ staff: await workOwnership.staffFor(req.params.clientId) });
  } catch (err) {
    log.error('admin.submissions.error', { err, route: 'GET /:clientId/staff', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

for (const action of ['take', 'release', 'hand']) {
  router.post(`/:clientId/:submissionId/${action}`, authenticateAdmin, requireClientAccess, async (req, res) => {
    try {
      const out = await workOwnership[action]('submission', req.params.clientId, req.params.submissionId, req.admin, req.body.to_admin_id);
      res.status(out.status).json(out.body);
    } catch (err) {
      log.error('admin.submissions.error', { err, route: `POST /:clientId/:submissionId/${action}`, path: req.path, request_id: req.requestId || null });
      res.status(500).json({ error: 'Server error.' });
    }
  });
}

// PATCH /api/admin/submissions/:clientId/:submissionId — update status
router.patch('/:clientId/:submissionId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { status } = req.body;
    const VALID = ['submitted', 'pending_sync', 'synced', 'failed_sync', 'closed'];
    if (!status || !VALID.includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    const [upd] = await pool.execute(
      `UPDATE cp_submissions SET status = ?, updated_at = NOW()
       WHERE id = ? AND client_id = ?`,
      [status, req.params.submissionId, req.params.clientId]
    );
    // CPPM-4: record it only when a row actually moved — a submission belonging
    // to another client matches nothing here and must not gain a history entry.
    // CPPM-64: nor an audit line.
    if (upd.affectedRows === 0) return res.status(404).json({ error: 'Submission not found.' });
    await recordStatusEvent({
      submissionId: req.params.submissionId, clientId: req.params.clientId,
      status, source: 'admin',
    });
    // A1: audit the manual status change with the admin actor.
    await audit(req.admin, req.params.clientId, 'STATUS_CHANGED', 'submission', req.params.submissionId, { status });
    res.json({ message: 'Status updated.' });
  } catch (err) {
    log.error('admin.submissions.error', { err, route: 'PATCH /:clientId/:submissionId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── O2: sync-failure dashboard ────────────────────────────────
// GET /api/admin/submissions/:clientId/sync-health — counts by status + failures list
router.get('/:clientId/sync-health', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [counts] = await pool.execute(
      'SELECT status, COUNT(*) n FROM cp_submissions WHERE client_id = ? GROUP BY status', [req.params.clientId]);
    const byStatus = {};
    counts.forEach(c => { byStatus[c.status] = c.n; });
    const [failures] = await pool.execute(
      `SELECT id, submission_type, sync_attempts, sync_error, updated_at
         FROM cp_submissions
        WHERE client_id = ? AND status = 'failed_sync'
        ORDER BY updated_at DESC LIMIT 100`, [req.params.clientId]);
    failures.forEach(f => { f.reference = `CP-${String(f.id).padStart(6, '0')}`; });
    // Bridge row 3: files whose report reached MIMS but which did not.
    const [files] = await pool.execute(
      `SELECT a.id, a.submission_id, a.file_name, a.forward_attempts, a.forward_error, a.last_forward_at, s.external_ref
         FROM cp_submission_attachments a JOIN cp_submissions s ON s.id = a.submission_id
        WHERE a.client_id = ? AND a.forward_status = 'failed'
        ORDER BY a.last_forward_at DESC LIMIT 100`, [req.params.clientId]);
    files.forEach(f => { f.reference = `CP-${String(f.submission_id).padStart(6, '0')}`; });
    // Bridge row 9: information people added to a request that did not reach its MIMS case.
    const [followups] = await pool.execute(
      `SELECT f.id, f.submission_id, f.forward_attempts, f.forward_error, f.last_forward_at, s.external_ref
         FROM cp_submission_followups f JOIN cp_submissions s ON s.id = f.submission_id
        WHERE f.client_id = ? AND f.forward_status = 'failed'
        ORDER BY f.last_forward_at DESC LIMIT 100`, [req.params.clientId]);
    followups.forEach(f => { f.reference = `CP-${String(f.submission_id).padStart(6, '0')}`; });
    res.json({ counts: byStatus, failures, files, followups });
  } catch (err) {
    log.error('admin.submissions.error', { err, route: 'GET /:clientId/sync-health', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/submissions/:clientId/attachments/:attachmentId/retry — send one
// file to its MIMS case again (bridge row 3). Not limited by the automatic try cap.
router.post('/:clientId/attachments/:attachmentId/retry', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    if (req.admin.role === 'viewer') return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    const [[att]] = await pool.execute(
      `SELECT a.id, a.submission_id, s.status, s.external_ref FROM cp_submission_attachments a
         JOIN cp_submissions s ON s.id = a.submission_id
        WHERE a.id = ? AND a.client_id = ?`, [req.params.attachmentId, req.params.clientId]);
    if (!att) return res.status(404).json({ error: 'File not found.' });
    if (!att.external_ref) return res.status(409).json({ error: 'Its report has not reached MIMS yet — send the report first.' });
    await audit(req.admin, req.params.clientId, 'MANUAL_RETRY', 'attachment', att.id, { submission_id: att.submission_id });
    const { forwardReleasedAttachment } = require('../portal/submit');
    await forwardReleasedAttachment(att.id);
    const [[after]] = await pool.execute('SELECT forward_status, forward_error FROM cp_submission_attachments WHERE id = ?', [att.id]);
    res.json({ status: after.forward_status, error: after.forward_error });
  } catch (err) {
    log.error('admin.submissions.error', { err, route: 'POST /:clientId/attachments/:attachmentId/retry', request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/submissions/:clientId/followups/:followupId/retry — send information a
// person added to its MIMS case again (bridge row 9). Not limited by the automatic try cap.
router.post('/:clientId/followups/:followupId/retry', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    if (req.admin.role === 'viewer') return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    const [[f]] = await pool.execute(
      `SELECT f.id, f.submission_id, f.forward_status, s.external_ref FROM cp_submission_followups f
         JOIN cp_submissions s ON s.id = f.submission_id
        WHERE f.id = ? AND f.client_id = ?`, [req.params.followupId, req.params.clientId]);
    if (!f) return res.status(404).json({ error: 'Follow-up not found.' });
    if (!f.external_ref) return res.status(409).json({ error: 'Its report has not reached MIMS yet — send the report first.' });
    if (f.forward_status === 'forwarded') return res.json({ status: 'forwarded', error: null });
    await audit(req.admin, req.params.clientId, 'MANUAL_RETRY', 'followup', f.id, { submission_id: f.submission_id });
    const { forwardFollowUp } = require('../portal/submit');
    await forwardFollowUp(f.id);
    const [[after]] = await pool.execute('SELECT forward_status, forward_error FROM cp_submission_followups WHERE id = ?', [f.id]);
    res.json({ status: after.forward_status, error: after.forward_error });
  } catch (err) {
    log.error('admin.submissions.error', { err, route: 'POST /:clientId/followups/:followupId/retry', request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/submissions/:clientId/:submissionId/retry — manual re-sync (admin-triggered)
router.post('/:clientId/:submissionId/retry', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [[sub]] = await pool.execute(
      'SELECT id, submission_type FROM cp_submissions WHERE id = ? AND client_id = ?',
      [req.params.submissionId, req.params.clientId]);
    if (!sub) return res.status(404).json({ error: 'Submission not found.' });
    // Attributable to the admin who triggered it (Vasu's condition).
    await audit(req.admin, req.params.clientId, 'MANUAL_RETRY', 'submission', sub.id, {});
    const { syncToIntegration } = require('../portal/submit');
    await syncToIntegration(Number(req.params.clientId), sub.id, sub.submission_type);
    const [[after]] = await pool.execute('SELECT status, external_ref, sync_error FROM cp_submissions WHERE id = ?', [sub.id]);
    res.json({ status: after.status, external_ref: after.external_ref, error: after.sync_error });
  } catch (err) {
    log.error('admin.submissions.error', { err, route: 'POST /:clientId/:submissionId/retry', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});


// ── CPPM-14: the approved medical answer, delivered back ──────
// Staff draft an answer; only a named reviewer approves it, and only then is it
// emailed and shown to the person who asked. A draft never leaves the admin area.
const ANSWER_APPROVERS = requireRole('superadmin', 'admin', 'reviewer');

// CPPM-63: the email for the first answer and for every follow-up. It promises a
// reply through the portal only to someone who can sign in to see it; a person who
// asked without an account is told how to ask again instead.
function answerEmail({ reference, body, hasAccount, followUp }) {
  const safe = String(body).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  const next = hasAccount
    ? 'You can also see this answer when you sign in to the portal, under My Submissions. Reply there if you need anything further.'
    : `If you need anything further, please send a new request through the portal and quote your reference <strong>${reference}</strong>.`;
  return {
    subject: `${followUp ? 'Follow-up to' : 'Response to'} your medical information request — ${reference}`,
    html: `<p>Hello,</p><p>Our medical information team has ${followUp ? 'sent a follow-up on' : 'answered'} your request <strong>${reference}</strong>:</p>`
      + `<blockquote style="border-left:3px solid #6B3FA0;padding-left:12px;color:#334155">${safe}</blockquote>`
      + `<p>${next}</p>`,
  };
}

// GET /api/admin/submissions/:clientId/:submissionId/answer
router.get('/:clientId/:submissionId/answer', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [[answer]] = await pool.execute(
      `SELECT a.id, a.body, a.status, a.approved_at, a.sent_at, a.send_error, a.source,
              d.name AS drafted_by_name, p.name AS approved_by_name
         FROM cp_submission_answers a
    LEFT JOIN cp_admin_users d ON d.id = a.drafted_by
    LEFT JOIN cp_admin_users p ON p.id = a.approved_by
        WHERE a.submission_id = ? AND a.client_id = ?`,
      [req.params.submissionId, req.params.clientId]);
    res.json({ answer: answer || null });
  } catch (err) {
    log.error('admin.submissions.error', { err, route: 'GET /:clientId/:submissionId/answer', request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

const ANSWERED_IN_MIMS = 'This request was sent to MIMS, so it is answered there. The answer MIMS approves and sends appears here and on the person\'s My Submissions page automatically.';

// PUT /api/admin/submissions/:clientId/:submissionId/answer — save or update the draft
router.put('/:clientId/:submissionId/answer', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const body = String(req.body.body || '').trim();
    if (body.length < 10) return res.status(400).json({ error: 'Write the answer before saving it.' });

    const [[submission]] = await pool.execute(
      'SELECT id, external_ref FROM cp_submissions WHERE id = ? AND client_id = ?', [req.params.submissionId, req.params.clientId]);
    if (!submission) return res.status(404).json({ error: 'Submission not found.' });
    // Bridge row 8: one answer path — a request that went to MIMS is answered there.
    if (submission.external_ref) return res.status(409).json({ error: ANSWERED_IN_MIMS });

    const [[existing]] = await pool.execute(
      'SELECT id, status FROM cp_submission_answers WHERE submission_id = ? AND client_id = ?',
      [req.params.submissionId, req.params.clientId]);
    // An answer already with the person cannot be edited underneath them.
    if (existing?.status === 'sent') {
      return res.status(409).json({ error: 'This answer has already been sent. Send a follow-up instead of changing it.' });
    }
    if (existing) {
      await pool.execute('UPDATE cp_submission_answers SET body = ?, drafted_by = ? WHERE id = ?', [body, req.admin.adminId, existing.id]);
    } else {
      await pool.execute(
        'INSERT INTO cp_submission_answers (submission_id, client_id, body, drafted_by) VALUES (?, ?, ?, ?)',
        [req.params.submissionId, req.params.clientId, body, req.admin.adminId]);
    }
    await audit(req.admin, req.params.clientId, 'ANSWER_DRAFTED', 'submission', req.params.submissionId, { length: body.length });
    res.json({ message: 'Draft saved.' });
  } catch (err) {
    log.error('admin.submissions.error', { err, route: 'PUT /:clientId/:submissionId/answer', request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/submissions/:clientId/:submissionId/answer/send — approve and send
router.post('/:clientId/:submissionId/answer/send', authenticateAdmin, requireClientAccess, ANSWER_APPROVERS, async (req, res) => {
  try {
    const [[answer]] = await pool.execute(
      'SELECT id, body, status FROM cp_submission_answers WHERE submission_id = ? AND client_id = ?',
      [req.params.submissionId, req.params.clientId]);
    if (!answer) return res.status(404).json({ error: 'Write the answer first.' });
    if (answer.status === 'sent') return res.status(409).json({ error: 'This answer has already been sent.' });
    const [[linked]] = await pool.execute('SELECT external_ref FROM cp_submissions WHERE id = ? AND client_id = ?', [req.params.submissionId, req.params.clientId]);
    if (linked?.external_ref) return res.status(409).json({ error: ANSWERED_IN_MIMS });

    const [[submission]] = await pool.execute(
      `SELECT s.id, s.submission_type, s.submitter_email, s.user_id, u.email AS user_email
         FROM cp_submissions s LEFT JOIN cp_portal_users u ON u.id = s.user_id
        WHERE s.id = ? AND s.client_id = ?`, [req.params.submissionId, req.params.clientId]);
    if (!submission) return res.status(404).json({ error: 'Submission not found.' });
    const to = (submission.submitter_email || submission.user_email || '').trim();
    if (!to) return res.status(400).json({ error: 'There is no email address on this request, so the answer cannot be sent.' });

    // Approve first: the record of who approved it must exist before anything leaves.
    const [claimed] = await pool.execute(
      `UPDATE cp_submission_answers SET status = 'sent', approved_by = ?, approved_at = NOW(), sent_at = NOW(), send_error = NULL
        WHERE id = ? AND status <> 'sent'`, [req.admin.adminId, answer.id]);
    // Lost the race with another reviewer pressing send at the same moment.
    if (claimed.affectedRows === 0) return res.status(409).json({ error: 'This answer has already been sent.' });

    const reference = `CP-${String(submission.id).padStart(6, '0')}`;
    const queued = await queueEmail(req.params.clientId, {
      to, ...answerEmail({ reference, body: answer.body, hasAccount: submission.user_id != null, followUp: false }),
    }, { kind: 'inquiry_answer', relatedType: 'submission', relatedId: submission.id });
    // queueEmail records the email before sending and retries it; a null means the
    // record itself could not be written, which the reviewer must know about.
    if (!queued) {
      await pool.execute("UPDATE cp_submission_answers SET send_error = 'The answer was approved but the email could not be queued.' WHERE id = ?", [answer.id]);
      log.error('admin.submissions.answer_email_not_queued', { submission_id: submission.id });
      await audit(req.admin, req.params.clientId, 'ANSWER_SENT', 'submission', req.params.submissionId, { to, email_queued: false });
      return res.status(502).json({ error: 'The answer is approved and visible in the portal, but the email could not be queued. Please try resending from Email Delivery.' });
    }
    await audit(req.admin, req.params.clientId, 'ANSWER_SENT', 'submission', req.params.submissionId, { to, email_queued: true });
    res.json({ message: `Answer sent to ${to}.` });
  } catch (err) {
    log.error('admin.submissions.error', { err, route: 'POST /:clientId/:submissionId/answer/send', request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── CPPM-63: the conversation after the first answer ──────────
// Runs `work(conn)` in one transaction and returns what it returns.
async function inTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const out = await work(conn);
    await conn.commit();
    return out;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

// The person's replies come in from the portal; staff answer them with a follow-up
// that is drafted, approved by a named reviewer and sent exactly like the first
// answer. One draft per enquiry at a time (the database refuses a second).

// GET /api/admin/submissions/:clientId/:submissionId/messages — the whole conversation, oldest first
router.get('/:clientId/:submissionId/messages', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const [messages] = await pool.execute(
      `SELECT m.id, m.direction, m.body, m.status, m.ae_screen_answer, m.ae_screen_detail,
              m.created_at, m.approved_at, m.sent_at, m.send_error,
              d.name AS drafted_by_name, p.name AS approved_by_name
         FROM cp_submission_messages m
    LEFT JOIN cp_admin_users d ON d.id = m.drafted_by
    LEFT JOIN cp_admin_users p ON p.id = m.approved_by
        WHERE m.submission_id = ? AND m.client_id = ?
        ORDER BY m.id`,
      [req.params.submissionId, req.params.clientId]);
    res.json({ messages });
  } catch (err) {
    log.error('admin.submissions.error', { err, route: 'GET /:clientId/:submissionId/messages', request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/submissions/:clientId/:submissionId/messages/draft — save the follow-up draft
router.put('/:clientId/:submissionId/messages/draft', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    // Bridge row 8: a request in MIMS is answered there — no second answer path here.
    const [[inMims]] = await pool.execute('SELECT external_ref FROM cp_submissions WHERE id = ? AND client_id = ?', [req.params.submissionId, req.params.clientId]);
    if (inMims?.external_ref) return res.status(409).json({ error: ANSWERED_IN_MIMS });
    const body = String(req.body.body || '').trim();
    if (body.length < 10) return res.status(400).json({ error: 'Write the follow-up before saving it.' });
    if (body.length > 20000) return res.status(400).json({ error: 'The follow-up is too long.' });

    const [[submission]] = await pool.execute(
      'SELECT id FROM cp_submissions WHERE id = ? AND client_id = ?', [req.params.submissionId, req.params.clientId]);
    if (!submission) return res.status(404).json({ error: 'Submission not found.' });
    const [[answer]] = await pool.execute(
      "SELECT id FROM cp_submission_answers WHERE submission_id = ? AND client_id = ? AND status = 'sent'",
      [req.params.submissionId, req.params.clientId]);
    if (!answer) return res.status(409).json({ error: 'Send the first answer before a follow-up.' });

    // Updates the draft if there is one, otherwise starts it; the unique draft key
    // (draft_for) turns two people saving a first draft together into one draft, not two.
    // The draft and its audit line are one transaction (CPPM-53).
    await inTransaction(async (conn) => {
      await conn.execute(
        `INSERT INTO cp_submission_messages (submission_id, client_id, direction, body, status, drafted_by, draft_for)
         VALUES (?, ?, 'out', ?, 'draft', ?, ?)
         ON DUPLICATE KEY UPDATE body = VALUES(body), drafted_by = VALUES(drafted_by)`,
        [req.params.submissionId, req.params.clientId, body, req.admin.adminId, submission.id]);
      await auditWithin(conn, req.admin, req.params.clientId, 'FOLLOWUP_DRAFTED', 'submission', req.params.submissionId, { length: body.length });
    });
    res.json({ message: 'Draft saved.' });
  } catch (err) {
    log.error('admin.submissions.error', { err, route: 'PUT /:clientId/:submissionId/messages/draft', request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/submissions/:clientId/:submissionId/messages/draft/send — approve and send the follow-up
router.post('/:clientId/:submissionId/messages/draft/send', authenticateAdmin, requireClientAccess, ANSWER_APPROVERS, async (req, res) => {
  try {
    // Bridge row 8: a request in MIMS is answered there — no second answer path here.
    const [[inMims]] = await pool.execute('SELECT external_ref FROM cp_submissions WHERE id = ? AND client_id = ?', [req.params.submissionId, req.params.clientId]);
    if (inMims?.external_ref) return res.status(409).json({ error: ANSWERED_IN_MIMS });
    const [[draft]] = await pool.execute(
      "SELECT id, body FROM cp_submission_messages WHERE submission_id = ? AND client_id = ? AND direction = 'out' AND status = 'draft'",
      [req.params.submissionId, req.params.clientId]);
    if (!draft) return res.status(404).json({ error: 'Write the follow-up first.' });

    const [[submission]] = await pool.execute(
      `SELECT s.id, s.submitter_email, s.user_id, u.email AS user_email
         FROM cp_submissions s LEFT JOIN cp_portal_users u ON u.id = s.user_id
        WHERE s.id = ? AND s.client_id = ?`, [req.params.submissionId, req.params.clientId]);
    if (!submission) return res.status(404).json({ error: 'Submission not found.' });
    const to = (submission.submitter_email || submission.user_email || '').trim();
    if (!to) return res.status(400).json({ error: 'There is no email address on this request, so the follow-up cannot be sent.' });

    // Approve first, and only the draft that was read: a second reviewer pressing
    // send at the same moment, or an edit in between, finds nothing to claim.
    // The approval and its audit line are one transaction (CPPM-53).
    const claimedOk = await inTransaction(async (conn) => {
      const [claimed] = await conn.execute(
        `UPDATE cp_submission_messages SET status = 'sent', draft_for = NULL, approved_by = ?, approved_at = NOW(), sent_at = NOW(), send_error = NULL
          WHERE id = ? AND status = 'draft' AND body = ?`, [req.admin.adminId, draft.id, draft.body]);
      if (claimed.affectedRows === 0) return false;
      await auditWithin(conn, req.admin, req.params.clientId, 'FOLLOWUP_SENT', 'submission', req.params.submissionId, { message_id: draft.id, to });
      return true;
    });
    if (!claimedOk) return res.status(409).json({ error: 'This follow-up changed or was sent while you were looking at it. Refresh and try again.' });

    const reference = `CP-${String(submission.id).padStart(6, '0')}`;
    const queued = await queueEmail(req.params.clientId, {
      to, ...answerEmail({ reference, body: draft.body, hasAccount: submission.user_id != null, followUp: true }),
    }, { kind: 'inquiry_followup', relatedType: 'submission', relatedId: submission.id });
    if (!queued) {
      await pool.execute("UPDATE cp_submission_messages SET send_error = 'The follow-up was approved but the email could not be queued.' WHERE id = ?", [draft.id]);
      log.error('admin.submissions.followup_email_not_queued', { submission_id: submission.id, message_id: draft.id });
      await audit(req.admin, req.params.clientId, 'FOLLOWUP_EMAIL_NOT_QUEUED', 'submission', req.params.submissionId, { message_id: draft.id, to });
      return res.status(502).json({ error: 'The follow-up is approved and visible in the portal, but the email could not be queued. Please try resending from Email Delivery.' });
    }
    res.json({ message: `Follow-up sent to ${to}.` });
  } catch (err) {
    log.error('admin.submissions.error', { err, route: 'POST /:clientId/:submissionId/messages/draft/send', request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
