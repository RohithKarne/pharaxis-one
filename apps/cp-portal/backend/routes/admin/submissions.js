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

// GET /api/admin/submissions/:clientId
// Returns submissions with optional filter by submission_type and status
router.get('/:clientId', authenticateAdmin, requireClientAccess, async (req, res) => {
  try {
    const { type, status, search } = req.query;

    let query = `
      SELECT s.id, s.submission_type, s.submitter_name, s.submitter_email,
             s.submitter_type, s.status, s.external_ref, s.submitted_at,
             s.sync_attempts, s.form_data,
             u.first_name, u.last_name, u.email AS user_email
      FROM cp_submissions s
      LEFT JOIN cp_portal_users u ON s.user_id = u.id
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
    res.json({ message: 'Status updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
