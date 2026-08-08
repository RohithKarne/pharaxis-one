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
const { audit } = require('../../utils/audit');
const log = require('../../utils/logger');

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
             t.status AS ae_task_status
      FROM cp_submissions s
      LEFT JOIN cp_portal_users u ON s.user_id = u.id
      LEFT JOIN cp_ae_review_tasks t ON t.submission_id = s.id
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
      r.reference = `CP-${String(r.id).padStart(6, '0')}`;
      r.mims_case_url = (caseUrlBase && r.external_ref) ? caseUrlBase + encodeURIComponent(r.external_ref) : null;
    });

    // Attach uploaded files per submission
    if (rows.length > 0) {
      const ids = rows.map(r => r.id);
      const ph  = ids.map(() => '?').join(',');
      const [atts] = await pool.execute(
        `SELECT id, submission_id, file_name, file_size, mime_type FROM cp_submission_attachments WHERE submission_id IN (${ph})`, ids);
      const bySub = {};
      atts.forEach(a => { (bySub[a.submission_id] = bySub[a.submission_id] || []).push(a); });
      rows.forEach(r => { r.attachments = bySub[r.id] || []; });
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
      'SELECT file_name, file_path, mime_type FROM cp_submission_attachments WHERE id = ? AND client_id = ?',
      [req.params.attachmentId, req.params.clientId]);
    if (!att) return res.status(404).json({ error: 'Attachment not found.' });
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

// PATCH /api/admin/submissions/:clientId/:submissionId — update status
router.patch('/:clientId/:submissionId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { status } = req.body;
    const VALID = ['submitted', 'pending_sync', 'synced', 'failed_sync', 'closed'];
    if (!status || !VALID.includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }
    await pool.execute(
      `UPDATE cp_submissions SET status = ?, updated_at = NOW()
       WHERE id = ? AND client_id = ?`,
      [status, req.params.submissionId, req.params.clientId]
    );
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
    res.json({ counts: byStatus, failures });
  } catch (err) {
    log.error('admin.submissions.error', { err, route: 'GET /:clientId/sync-health', path: req.path, request_id: req.requestId || null });
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

module.exports = router;
