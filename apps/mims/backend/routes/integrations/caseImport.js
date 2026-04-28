'use strict';

const express = require('express');
const multer = require('multer');
const { authenticate } = require('../../middleware/auth');
const { validateUpload } = require('../../middleware/uploadValidation');
const db = require('../../database/db');

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
        'INSERT INTO cases (org_id, case_type, priority, intake_channel, created_at) VALUES (?, ?, ?, ?, NOW())',
        [orgId, rowObject.case_type, rowObject.priority, rowObject.intake_channel]
      );
      importedRows += 1;
    }

    const jobInsert = await query(
      `INSERT INTO case_import_jobs
       (org_id, filename, status, total_rows, imported_rows, failed_rows, error_log, created_by)
       VALUES (?, ?, 'completed', ?, ?, ?, ?, ?)`,
      [
        orgId,
        originalFilename,
        totalRows,
        importedRows,
        failedRows,
        JSON.stringify(errors),
        req.user.id ?? req.user.userId ?? null,
      ]
    );

    return res.status(200).json({
      success: true,
      jobId: jobInsert.insertId,
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

module.exports = router;
