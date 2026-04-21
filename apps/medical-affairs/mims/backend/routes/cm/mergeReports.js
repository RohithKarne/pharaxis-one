'use strict';

/**
 * cm/mergeReports.js — Content Management Merge Reports API
 * Merge report templates with checkout/checkin lifecycle.
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const { validateUpload } = require('../../middleware/uploadValidation');

const multer = require('multer');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../../storage/cm_documents')),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + file.originalname),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

async function addVersionHistory(entityId, version, status, notes, authorId) {
  try {
    await pool.execute(
      'INSERT INTO cm_version_history (entity_type, entity_id, version, status, notes, author_id) VALUES (?, ?, ?, ?, ?, ?)',
      ['merge_report', entityId, version, status, notes || null, authorId]
    );
  } catch (_) {}
}

// GET /api/cm/merge-reports — list merge reports
router.get('/merge-reports', authenticate, async (req, res) => {
  try {
    const { status, folder_id, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = `
      SELECT mr.*, f.name AS folder_name, u.name AS created_by_name, cu.name AS checked_out_by_name
      FROM cm_merge_reports mr
      LEFT JOIN cm_folders f ON mr.folder_id = f.id
      LEFT JOIN users u ON mr.created_by = u.id
      LEFT JOIN users cu ON mr.checked_out_by = cu.id
      WHERE 1=1
    `;
    const params = [];

    if (status) {
      query += ' AND mr.status = ?';
      params.push(status);
    }
    if (folder_id) {
      query += ' AND mr.folder_id = ?';
      params.push(folder_id);
    }
    if (search) {
      query += ' AND mr.name LIKE ?';
      params.push(`%${search}%`);
    }

    const countQuery = query.replace(
      'SELECT mr.*, f.name AS folder_name, u.name AS created_by_name, cu.name AS checked_out_by_name',
      'SELECT COUNT(*) AS total'
    );
    const [[{ total }]] = await pool.execute(countQuery, params);

    query += ` ORDER BY mr.updated_at DESC LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;

    const [reports] = await pool.execute(query, params);
    res.json({ reports, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /cm/merge-reports error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/merge-reports — create merge report
router.post('/merge-reports', authenticate, upload.single('file'), validateUpload(['doc']), async (req, res) => {
  try {
    const { folder_id, name, content_html } = req.body;
    if (!folder_id || !name) return res.status(400).json({ error: 'folder_id and name are required.' });

    const filePath = req.file ? req.file.path : null;

    const [result] = await pool.execute(
      `INSERT INTO cm_merge_reports (folder_id, name, content_html, file_path, status, created_by)
       VALUES (?, ?, ?, ?, 'Draft', ?)`,
      [folder_id, name.trim(), content_html || null, filePath, req.user.userId]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'cm_merge_report', result.insertId, { name, folder_id });
    const [[created]] = await pool.execute('SELECT * FROM cm_merge_reports WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Merge report created.', id: result.insertId, report: created });
  } catch (err) {
    console.error('POST /cm/merge-reports error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/merge-reports/:id — get merge report
router.get('/merge-reports/:id', authenticate, async (req, res) => {
  try {
    const [[report]] = await pool.execute(
      `SELECT mr.*, f.name AS folder_name, u.name AS created_by_name, cu.name AS checked_out_by_name
       FROM cm_merge_reports mr
       LEFT JOIN cm_folders f ON mr.folder_id = f.id
       LEFT JOIN users u ON mr.created_by = u.id
       LEFT JOIN users cu ON mr.checked_out_by = cu.id
       WHERE mr.id = ?`,
      [req.params.id]
    );
    if (!report) return res.status(404).json({ error: 'Merge report not found.' });

    const [versions] = await pool.execute(
      `SELECT vh.*, u.name AS author_name
       FROM cm_version_history vh
       LEFT JOIN users u ON vh.author_id = u.id
       WHERE vh.entity_type = 'merge_report' AND vh.entity_id = ?
       ORDER BY vh.created_at DESC`,
      [req.params.id]
    );

    res.json({ report, versions });
  } catch (err) {
    console.error('GET /cm/merge-reports/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/cm/merge-reports/:id — update merge report
router.put('/merge-reports/:id', authenticate, upload.single('file'), validateUpload(['doc']), async (req, res) => {
  try {
    const { id } = req.params;
    const [[report]] = await pool.execute('SELECT * FROM cm_merge_reports WHERE id = ?', [id]);
    if (!report) return res.status(404).json({ error: 'Merge report not found.' });

    if (report.status !== 'Draft' && !(report.status === 'CheckedOut' && report.checked_out_by === req.user.userId)) {
      return res.status(403).json({ error: 'Merge report can only be updated when in Draft status or checked out by you.' });
    }

    const { folder_id, name, content_html } = req.body;
    const filePath = req.file ? req.file.path : report.file_path;

    await pool.execute(
      'UPDATE cm_merge_reports SET folder_id = ?, name = ?, content_html = ?, file_path = ?, updated_by = ?, updated_at = NOW() WHERE id = ?',
      [folder_id || report.folder_id, name || report.name, content_html !== undefined ? content_html : report.content_html, filePath, req.user.userId, id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'cm_merge_report', Number(id), { name: name || report.name });
    res.json({ message: 'Merge report updated.' });
  } catch (err) {
    console.error('PUT /cm/merge-reports/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/merge-reports/:id/checkout — check out
router.post('/merge-reports/:id/checkout', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const [[report]] = await pool.execute('SELECT * FROM cm_merge_reports WHERE id = ?', [id]);
    if (!report) return res.status(404).json({ error: 'Merge report not found.' });
    if (report.status !== 'Draft') return res.status(400).json({ error: 'Only Draft merge reports can be checked out.' });
    if (report.checked_out_by) return res.status(400).json({ error: 'Merge report is already checked out.' });

    await pool.execute(
      "UPDATE cm_merge_reports SET status = 'CheckedOut', checked_out_by = ?, checked_out_at = NOW(), updated_at = NOW() WHERE id = ?",
      [req.user.userId, id]
    );
    await audit(req.user.userId, req.user.email, 'CHECKOUT', 'cm_merge_report', Number(id), {});
    res.json({ message: 'Merge report checked out.' });
  } catch (err) {
    console.error('POST /cm/merge-reports/:id/checkout error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/merge-reports/:id/checkin — check in
router.post('/merge-reports/:id/checkin', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const [[report]] = await pool.execute('SELECT * FROM cm_merge_reports WHERE id = ?', [id]);
    if (!report) return res.status(404).json({ error: 'Merge report not found.' });
    if (report.status !== 'CheckedOut') return res.status(400).json({ error: 'Merge report is not checked out.' });
    if (report.checked_out_by !== req.user.userId) {
      return res.status(403).json({ error: 'Only the user who checked out this merge report can check it in.' });
    }

    const newMinor = report.version_minor + 1;
    const versionStr = `${report.version_major}.${newMinor}`;

    await pool.execute(
      `UPDATE cm_merge_reports SET
         status = 'Draft', checked_out_by = NULL, checked_out_at = NULL,
         version_minor = ?, updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [newMinor, req.user.userId, id]
    );
    await addVersionHistory(Number(id), versionStr, 'Draft', notes || 'Checked in', req.user.userId);
    await audit(req.user.userId, req.user.email, 'CHECKIN', 'cm_merge_report', Number(id), { version: versionStr });
    res.json({ message: 'Merge report checked in.', version: versionStr });
  } catch (err) {
    console.error('POST /cm/merge-reports/:id/checkin error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── CM-E10: Merge report scheduling ──────────────────────────────────────────

// GET /api/cm/merge-reports/:id/schedule
router.get('/merge-reports/:id/schedule', authenticate, async (req, res) => {
  try {
    const [jobs] = await pool.execute(
      `SELECT * FROM scheduled_jobs
       WHERE job_type = 'cm_merge_report'
         AND JSON_UNQUOTE(JSON_EXTRACT(job_config, '$.merge_report_id')) = ?
       LIMIT 1`,
      [String(req.params.id)]
    );
    res.json({ schedule: jobs[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cm/merge-reports/:id/schedule
router.post('/merge-reports/:id/schedule', authenticate, async (req, res) => {
  try {
    const { cron_expression, email_recipients, is_active } = req.body;
    if (!cron_expression) return res.status(400).json({ error: 'cron_expression required' });
    const orgId = req.user.orgId || null;
    const jobConfig = JSON.stringify({
      merge_report_id: Number(req.params.id),
      email_recipients: Array.isArray(email_recipients) ? email_recipients : [],
    });
    await pool.execute(
      `INSERT INTO scheduled_jobs (org_id, job_type, job_config, schedule_cron, is_active, created_at, updated_at)
       VALUES (?, 'cm_merge_report', ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE job_config = VALUES(job_config), schedule_cron = VALUES(schedule_cron),
                               is_active = VALUES(is_active), updated_at = NOW()`,
      [orgId, jobConfig, cron_expression, is_active !== false ? 1 : 0]
    );
    await audit(req.user.userId, req.user.email, 'SET_MERGE_SCHEDULE', 'cm_merge_report', Number(req.params.id), { cron_expression });
    res.json({ success: true, message: 'Merge report schedule saved.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
