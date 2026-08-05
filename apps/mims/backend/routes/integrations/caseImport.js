'use strict';

const express = require('express');
const multer = require('multer');
const { authenticate } = require('../../middleware/auth');
const { validateUpload } = require('../../middleware/uploadValidation');
const db = require('../../database/db');
const { buildReconciliation } = require('../../services/caseImportReconciliationService');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

async function query(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

router.post('/admin/cases/import/upload', authenticate, upload.single('file'), validateUpload(['csv']), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const originalFilename = req.file.originalname || '';
    const isCsvMimetype = req.file.mimetype === 'text/csv';
    const isCsvFilename = originalFilename.toLowerCase().endsWith('.csv');
    if (!isCsvMimetype && !isCsvFilename) {
      return res.status(400).json({ error: 'Invalid file type. Only CSV files are allowed.' });
    }

    const csvText = req.file.buffer.toString('utf8');
    const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (!lines.length) return res.status(400).json({ error: 'CSV file is empty' });

    const headers = lines[0].split(',').map((h) => h.trim());
    const requiredHeaders = ['case_type', 'priority', 'intake_channel'];
    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));
    if (missingHeaders.length) {
      return res.status(400).json({ error: 'Missing required headers', missing: missingHeaders });
    }

    const dataRows = lines.slice(1);
    const totalRows = dataRows.length;
    let importedRows = 0;
    let failedRows = 0;
    const errors = [];
    const orgId = req.user.orgId;
    const createdBy = req.user.id ?? req.user.userId ?? null;

    // PAUD-4 item 4: the job row is created BEFORE the inserts so every imported
    // case can carry its job id. Without that link the row counts below are an
    // unverifiable claim.
    const jobInsert = await query(
      `INSERT INTO case_import_jobs
       (org_id, filename, status, total_rows, imported_rows, failed_rows, error_log, created_by)
       VALUES (?, ?, 'pending', ?, 0, 0, '[]', ?)`,
      [orgId, originalFilename, totalRows, createdBy]
    );
    const jobId = jobInsert.insertId;

    for (let i = 0; i < dataRows.length; i += 1) {
      const rowIndex = i + 2;
      const values = dataRows[i].split(',').map((v) => v.trim());
      const rowObject = {};
      headers.forEach((header, index) => {
        rowObject[header] = values[index] ?? '';
      });

      const hasMissingRequired = requiredHeaders.some((field) => !String(rowObject[field] || '').trim());
      if (hasMissingRequired) {
        failedRows += 1;
        errors.push({ row: rowIndex, reason: 'Missing required fields' });
        continue;
      }

      await query(
        'INSERT INTO cases (org_id, case_type, priority, intake_channel, import_job_id, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
        [orgId, rowObject.case_type, rowObject.priority, rowObject.intake_channel, jobId]
      );
      importedRows += 1;
    }

    await query(
      `UPDATE case_import_jobs
          SET status = 'completed', imported_rows = ?, failed_rows = ?, error_log = ?
        WHERE id = ?`,
      [importedRows, failedRows, JSON.stringify(errors), jobId]
    );

    return res.status(200).json({
      success: true,
      jobId,
      imported: importedRows,
      failed: failedRows,
      errors,
    });
  } catch (_err) {
    return res.status(500).json({ error: 'Failed to import cases' });
  }
});

router.get('/admin/cases/import/jobs', authenticate, async (req, res) => {
  try {
    const jobs = await query(
      `SELECT *
       FROM case_import_jobs
       WHERE org_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [req.user.orgId]
    );
    return res.status(200).json({ jobs });
  } catch (_err) {
    return res.status(500).json({ error: 'Failed to fetch import jobs' });
  }
});

router.get('/admin/cases/import/jobs/:id', authenticate, async (req, res) => {
  try {
    const jobs = await query(
      'SELECT * FROM case_import_jobs WHERE id = ? AND org_id = ? LIMIT 1',
      [req.params.id, req.user.orgId]
    );
    if (!jobs.length) return res.status(404).json({ error: 'Job not found' });
    return res.status(200).json({ job: jobs[0] });
  } catch (_err) {
    return res.status(500).json({ error: 'Failed to fetch import job' });
  }
});

// PAUD-4 item 4: the count-back. Re-counts `cases` for this job and compares it
// with what the job recorded, so a migration can be evidenced rather than
// asserted.
router.get('/admin/cases/import/jobs/:id/reconciliation', authenticate, async (req, res) => {
  try {
    const jobs = await query(
      'SELECT * FROM case_import_jobs WHERE id = ? AND org_id = ? LIMIT 1',
      [req.params.id, req.user.orgId]
    );
    if (!jobs.length) return res.status(404).json({ error: 'Job not found' });
    const job = jobs[0];

    const counted = await query(
      'SELECT COUNT(*) AS actual FROM cases WHERE import_job_id = ? AND org_id = ?',
      [job.id, req.user.orgId]
    );

    const reconciliation = buildReconciliation({
      totalRows:    job.total_rows,
      importedRows: job.imported_rows,
      failedRows:   job.failed_rows,
      actualRows:   counted[0]?.actual ?? 0,
    });

    return res.status(200).json({
      job_id: job.id,
      filename: job.filename,
      imported_at: job.created_at,
      reconciliation,
      note: reconciliation.balanced
        ? 'Every row received is accounted for as imported or rejected, and the imported rows are present in the database.'
        : 'RECONCILIATION FAILED — this import cannot be evidenced as complete. See discrepancy and unaccounted counts.',
    });
  } catch (_err) {
    return res.status(500).json({ error: 'Failed to reconcile import job' });
  }
});

// PAUD-4 item 4: the rejected rows as a downloadable file, so a cutover can show
// exactly what did not come across and why.
router.get('/admin/cases/import/jobs/:id/rejects.csv', authenticate, async (req, res) => {
  try {
    const jobs = await query(
      'SELECT * FROM case_import_jobs WHERE id = ? AND org_id = ? LIMIT 1',
      [req.params.id, req.user.orgId]
    );
    if (!jobs.length) return res.status(404).json({ error: 'Job not found' });

    const raw = jobs[0].error_log;
    const errors = (typeof raw === 'string' ? JSON.parse(raw || '[]') : raw) || [];
    const lines = ['row,reason', ...errors.map((e) => `${e.row},"${String(e.reason || '').replace(/"/g, '""')}"`)];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="case-import-${jobs[0].id}-rejects.csv"`);
    return res.send(lines.join('\n'));
  } catch (_err) {
    return res.status(500).json({ error: 'Failed to build rejects file' });
  }
});

module.exports = router;
