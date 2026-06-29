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
const { hasGlobalAdminScope } = require('../../utils/adminScope');
function safeStoredFilename(originalname) {
  const base = path.basename(String(originalname || 'upload'))
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 180) || 'upload';
  return `${Date.now()}_${base}`;
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../../storage/cm_documents')), /* WP5: was ../../../ (one level too high) — files landed outside backend/storage and were unreachable by download */
  filename: (req, file, cb) => cb(null, safeStoredFilename(file.originalname)),
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

function hasPlatformAdminScope(req) {
  return hasGlobalAdminScope(req.user);
}

function decorateMergeReportRow(report) {
  if (!report) return report;
  return {
    ...report,
    content: report.content_html ?? '',
    version: `${report.version_major || 1}.${report.version_minor || 0}`,
  };
}

async function getScopedFolder(req, folderId) {
  const [rows] = await pool.execute(
    hasPlatformAdminScope(req)
      ? 'SELECT id, org_id FROM cm_folders WHERE id = ?'
      : 'SELECT id, org_id FROM cm_folders WHERE id = ? AND org_id = ?',
    hasPlatformAdminScope(req) ? [folderId] : [folderId, req.user.orgId]
  );
  return rows[0] || null;
}

async function getScopedMergeReport(req, reportId) {
  const [rows] = await pool.execute(
    hasPlatformAdminScope(req)
      ? `SELECT mr.*, f.org_id AS folder_org_id
         FROM cm_merge_reports mr
         LEFT JOIN cm_folders f ON mr.folder_id = f.id
         WHERE mr.id = ?`
      : `SELECT mr.*, f.org_id AS folder_org_id
         FROM cm_merge_reports mr
         LEFT JOIN cm_folders f ON mr.folder_id = f.id
         WHERE mr.id = ? AND f.org_id = ?`,
    hasPlatformAdminScope(req) ? [reportId] : [reportId, req.user.orgId]
  );
  return rows[0] || null;
}

async function getScopedCase(req, caseId) {
  const [rows] = await pool.execute(
    hasPlatformAdminScope(req)
      ? 'SELECT id, org_id FROM cases WHERE id = ?'
      : 'SELECT id, org_id FROM cases WHERE id = ? AND org_id = ?',
    hasPlatformAdminScope(req) ? [caseId] : [caseId, req.user.orgId]
  );
  return rows[0] || null;
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

    if (!hasPlatformAdminScope(req)) {
      query += ' AND f.org_id = ?';
      params.push(req.user.orgId);
    }

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
    res.json({ reports: reports.map(decorateMergeReportRow), total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /cm/merge-reports error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/cm/merge-reports — create merge report
router.post('/merge-reports', authenticate, upload.single('file'), validateUpload(['doc']), async (req, res) => {
  try {
    const { folder_id, name, content_html, content } = req.body;
    if (!folder_id || !name) return res.status(400).json({ error: 'folder_id and name are required.' });
    const folder = await getScopedFolder(req, folder_id);
    if (!folder) return res.status(404).json({ error: 'Folder not found for active organisation.' });

    const filePath = req.file ? req.file.path : null;
    const resolvedContentHtml = content_html !== undefined ? content_html : (content !== undefined ? content : null);

    const [result] = await pool.execute(
      `INSERT INTO cm_merge_reports (folder_id, name, content_html, file_path, status, created_by)
       VALUES (?, ?, ?, ?, 'Draft', ?)`,
      [folder_id, name.trim(), resolvedContentHtml || null, filePath, req.user.userId]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'cm_merge_report', result.insertId, { name, folder_id });
    const [[created]] = await pool.execute('SELECT * FROM cm_merge_reports WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Merge report created.', id: result.insertId, report: decorateMergeReportRow(created) });
  } catch (err) {
    console.error('POST /cm/merge-reports error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/cm/merge-reports/:id — get merge report
router.get('/merge-reports/:id', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      hasPlatformAdminScope(req)
        ? `SELECT mr.*, f.name AS folder_name, u.name AS created_by_name, cu.name AS checked_out_by_name
           FROM cm_merge_reports mr
           LEFT JOIN cm_folders f ON mr.folder_id = f.id
           LEFT JOIN users u ON mr.created_by = u.id
           LEFT JOIN users cu ON mr.checked_out_by = cu.id
           WHERE mr.id = ?`
        : `SELECT mr.*, f.name AS folder_name, u.name AS created_by_name, cu.name AS checked_out_by_name
           FROM cm_merge_reports mr
           LEFT JOIN cm_folders f ON mr.folder_id = f.id
           LEFT JOIN users u ON mr.created_by = u.id
           LEFT JOIN users cu ON mr.checked_out_by = cu.id
           WHERE mr.id = ? AND f.org_id = ?`,
      hasPlatformAdminScope(req) ? [req.params.id] : [req.params.id, req.user.orgId]
    );
    const report = rows[0];
    if (!report) return res.status(404).json({ error: 'Merge report not found.' });

    const [versions] = await pool.execute(
      `SELECT vh.*, u.name AS author_name
       FROM cm_version_history vh
       LEFT JOIN users u ON vh.author_id = u.id
       WHERE vh.entity_type = 'merge_report' AND vh.entity_id = ?
       ORDER BY vh.created_at DESC`,
      [req.params.id]
    );

    res.json({ report: decorateMergeReportRow(report), versions });
  } catch (err) {
    console.error('GET /cm/merge-reports/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/cm/merge-reports/:id — update merge report
router.put('/merge-reports/:id', authenticate, upload.single('file'), validateUpload(['doc']), async (req, res) => {
  try {
    const { id } = req.params;
    const report = await getScopedMergeReport(req, id);
    if (!report) return res.status(404).json({ error: 'Merge report not found.' });

    if (report.status !== 'Draft' && !(report.status === 'CheckedOut' && report.checked_out_by === req.user.userId)) {
      return res.status(403).json({ error: 'Merge report can only be updated when in Draft status or checked out by you.' });
    }

    const { folder_id, name, content_html, content } = req.body;
    if (folder_id && Number(folder_id) !== Number(report.folder_id)) {
      const folder = await getScopedFolder(req, folder_id);
      if (!folder) return res.status(404).json({ error: 'Folder not found for active organisation.' });
    }
    const filePath = req.file ? req.file.path : report.file_path;
    const resolvedContentHtml = content_html !== undefined ? content_html : (content !== undefined ? content : report.content_html);

    await pool.execute(
      'UPDATE cm_merge_reports SET folder_id = ?, name = ?, content_html = ?, file_path = ?, updated_by = ?, updated_at = NOW() WHERE id = ?',
      [folder_id || report.folder_id, name || report.name, resolvedContentHtml, filePath, req.user.userId, id]
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
    const report = await getScopedMergeReport(req, id);
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
    const report = await getScopedMergeReport(req, id);
    if (!report) return res.status(404).json({ error: 'Merge report not found.' });
    if (report.status !== 'CheckedOut') return res.status(400).json({ error: 'Merge report is not checked out.' });
    if (report.checked_out_by !== req.user.userId) {
      return res.status(403).json({ error: 'Only the user who checked out this merge report can check it in.' });
    }

    // WP5: bump the version ATOMICALLY (was computed from the earlier read — concurrent
    // check-ins could land the same minor), then read back for the version string.
    await pool.execute(
      `UPDATE cm_merge_reports SET
         status = 'Draft', checked_out_by = NULL, checked_out_at = NULL,
         version_minor = version_minor + 1, updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [req.user.userId, id]
    );
    const [[afterMr]] = await pool.execute('SELECT version_major, version_minor FROM cm_merge_reports WHERE id = ?', [id]);
    const versionStr = `${afterMr.version_major}.${afterMr.version_minor}`;
    await addVersionHistory(Number(id), versionStr, 'Draft', notes || 'Checked in', req.user.userId);
    await audit(req.user.userId, req.user.email, 'CHECKIN', 'cm_merge_report', Number(id), { version: versionStr });
    res.json({ message: 'Merge report checked in.', version: versionStr });
  } catch (err) {
    console.error('POST /cm/merge-reports/:id/checkin error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── CM-E15: Generate merge report from live case data ────────────────────────
// POST /api/cm/merge-reports/:id/generate
// Supported merge fields: {{case_number}}, {{case_type}}, {{patient_name}},
//   {{patient_email}}, {{product_name}}, {{agent_name}}, {{org_name}}, {{date}},
//   {{report_name}}, {{case_status}}, {{case_priority}}, {{case_assigned_to}}
router.post('/merge-reports/:id/generate', authenticate, async (req, res) => {
  try {
    const { case_id } = req.body;

    const report = await getScopedMergeReport(req, req.params.id);
    if (!report) return res.status(404).json({ error: 'Merge report not found.' });
    if (!report.content_html) return res.status(422).json({ error: 'Merge report has no HTML content to generate from.' });

    // Build merge data (same pattern as template render)
    const mergeData = {
      date:             new Date().toLocaleDateString('en-US', { dateStyle: 'long' }),
      agent_name:       req.user.name || req.user.email || '',
      report_name:      report.name || '',
      case_number:      '',
      case_type:        '',
      case_status:      '',
      case_priority:    '',
      case_assigned_to: '',
      patient_name:     '',
      patient_email:    '',
      product_name:     '',
      org_name:         '',
    };

    if (case_id) {
      const scopedCase = await getScopedCase(req, case_id);
      if (!scopedCase) return res.status(404).json({ error: 'Case not found for active organisation.' });
      const [[caseRow]] = await pool.execute(
        `SELECT c.case_number, c.case_type, c.status AS case_status, c.priority,
                o.name AS org_name,
                CONCAT(COALESCE(ua.first_name,''), ' ', COALESCE(ua.last_name,'')) AS assigned_name
         FROM cases c
         LEFT JOIN organisations o ON o.id = c.org_id
         LEFT JOIN users ua ON ua.id = c.assigned_to
         WHERE c.id = ?`,
        [scopedCase.id]
      );
      if (caseRow) {
        mergeData.case_number      = caseRow.case_number   || '';
        mergeData.case_type        = caseRow.case_type     || '';
        mergeData.case_status      = caseRow.case_status   || '';
        mergeData.case_priority    = caseRow.priority      || '';
        mergeData.case_assigned_to = caseRow.assigned_name?.trim() || '';
        mergeData.org_name         = caseRow.org_name      || '';
      }

      const [[contactRow]] = await pool.execute(
        `SELECT CONCAT(COALESCE(first_name,''), ' ', COALESCE(last_name,'')) AS full_name, email
         FROM case_contacts WHERE case_id = ? ORDER BY is_primary DESC, id ASC LIMIT 1`,
        [scopedCase.id]
      );
      if (contactRow) {
        mergeData.patient_name  = contactRow.full_name?.trim() || '';
        mergeData.patient_email = contactRow.email             || '';
      }

      const [[miRow]] = await pool.execute(
        `SELECT product FROM case_mi WHERE case_id = ? ORDER BY id ASC LIMIT 1`,
        [scopedCase.id]
      );
      if (miRow?.product) mergeData.product_name = miRow.product;
    }

    function applyMerge(text) {
      if (!text) return text;
      return text.replace(/\{\{(\w+)\}\}/g, (_, key) =>
        mergeData[key] !== undefined ? mergeData[key] : `{{${key}}}`
      );
    }

    const generated_html = applyMerge(report.content_html);

    // Persist generated output in case caller wants to store/version it
    await pool.execute(
      'UPDATE cm_merge_reports SET generated_html = ?, generated_at = NOW(), generated_for_case = ?, updated_at = NOW() WHERE id = ?',
      [generated_html, case_id ? Number(case_id) : null, req.params.id]
    ).catch(() => {}); // column may not exist yet — handled by DB init

    await audit(
      req.user.userId, req.user.email,
      'GENERATE', 'cm_merge_report', Number(req.params.id),
      { case_id: case_id || null }
    );

    res.json({
      generated_html,
      merge_data:  mergeData,
      report_id:   report.id,
      report_name: report.name,
      case_id:     case_id || null,
    });
  } catch (err) {
    console.error('POST /cm/merge-reports/:id/generate error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── CM-E10: Merge report scheduling ──────────────────────────────────────────

// GET /api/cm/merge-reports/:id/schedule
router.get('/merge-reports/:id/schedule', authenticate, async (req, res) => {
  try {
    const report = await getScopedMergeReport(req, req.params.id);
    if (!report) return res.status(404).json({ error: 'Merge report not found.' });
    const [jobs] = await pool.execute(
      `SELECT * FROM scheduled_jobs
       WHERE job_type = 'cm_merge_report'
         AND JSON_UNQUOTE(JSON_EXTRACT(job_config, '$.merge_report_id')) = ?
         ${hasPlatformAdminScope(req) ? '' : 'AND org_id = ?'}
       LIMIT 1`,
      hasPlatformAdminScope(req) ? [String(req.params.id)] : [String(req.params.id), req.user.orgId]
    );
    res.json({ schedule: jobs[0] || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cm/merge-reports/:id/schedule
router.post('/merge-reports/:id/schedule', authenticate, async (req, res) => {
  try {
    const report = await getScopedMergeReport(req, req.params.id);
    if (!report) return res.status(404).json({ error: 'Merge report not found.' });
    const { cron_expression, email_recipients, is_active } = req.body;
    if (!cron_expression) return res.status(400).json({ error: 'cron_expression required' });
    const orgId = hasPlatformAdminScope(req) ? (report.folder_org_id || null) : req.user.orgId;
    const jobName = `cm-merge-report-${orgId || 'global'}-${Number(req.params.id)}`;
    const jobConfig = JSON.stringify({
      merge_report_id: Number(req.params.id),
      email_recipients: Array.isArray(email_recipients) ? email_recipients : [],
    });
    await pool.execute(
      `INSERT INTO scheduled_jobs
         (job_name, cron_expression, description, is_active, org_id, job_type, job_config, schedule_cron, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'cm_merge_report', ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         cron_expression = VALUES(cron_expression),
         description = VALUES(description),
         is_active = VALUES(is_active),
         org_id = VALUES(org_id),
         job_type = VALUES(job_type),
         job_config = VALUES(job_config),
         schedule_cron = VALUES(schedule_cron),
         updated_at = NOW()`,
      [
        jobName,
        cron_expression,
        `CM merge report schedule for report ${Number(req.params.id)}`,
        is_active !== false ? 1 : 0,
        orgId,
        jobConfig,
        cron_expression,
      ]
    );
    await audit(req.user.userId, req.user.email, 'SET_MERGE_SCHEDULE', 'cm_merge_report', Number(req.params.id), { cron_expression });
    res.json({ success: true, message: 'Merge report schedule saved.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/merge-reports/:id/schedule', authenticate, async (req, res) => {
  try {
    const report = await getScopedMergeReport(req, req.params.id);
    if (!report) return res.status(404).json({ error: 'Merge report not found.' });
    const orgId = hasPlatformAdminScope(req) ? (report.folder_org_id || null) : req.user.orgId;
    const jobName = `cm-merge-report-${orgId || 'global'}-${Number(req.params.id)}`;
    await pool.execute(
      `DELETE FROM scheduled_jobs
       WHERE job_name = ?
         AND job_type = 'cm_merge_report'
         ${hasPlatformAdminScope(req) ? '' : 'AND org_id = ?'}`,
      hasPlatformAdminScope(req) ? [jobName] : [jobName, req.user.orgId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cm/merge-reports/:id/archive — archive a merge report
router.post('/merge-reports/:id/archive', authenticate, async (req, res) => {
  try {
    const report = await getScopedMergeReport(req, req.params.id);
    if (!report) return res.status(404).json({ error: 'Merge report not found.' });
    const { reason } = req.body;
    await pool.execute(
      "UPDATE cm_merge_reports SET status = 'Archived', updated_by = ?, updated_at = NOW() WHERE id = ?",
      [req.user.userId, req.params.id]
    );
    await addVersionHistory(Number(req.params.id), `${report.version_major || 1}.${report.version_minor || 0}`, 'Archived', reason || 'Manually archived', req.user.userId);
    await audit(req.user.userId, req.user.email, 'ARCHIVE', 'cm_merge_report', Number(req.params.id), { name: report.name });
    res.json({ message: 'Merge report archived.' });
  } catch (err) {
    console.error('POST /cm/merge-reports/:id/archive error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
