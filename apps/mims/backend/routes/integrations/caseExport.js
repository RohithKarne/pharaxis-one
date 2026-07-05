'use strict';

const express = require('express');
const { authenticate } = require('../../middleware/auth');
const pool = require('../../database/db');

const router = express.Router();

router.get('/admin/cases/export', authenticate, async (req, res) => {
  try {
    const orgId = req.user.orgId;
    if (orgId == null) return res.status(403).json({ error: 'Forbidden' });

    const { case_type, date_from, date_to, status_id, assigned_to, format } = req.query;

    if (format === 'xlsx') {
      return res.status(400).json({ error: 'Excel format not yet supported. Please use CSV.' });
    }

    const params = [orgId];
    let where = 'c.org_id = ? AND c.is_deleted = 0';

    if (case_type) {
      where += ' AND c.case_type = ?';
      params.push(case_type);
    }
    if (date_from) {
      where += ' AND DATE(c.created_at) >= ?';
      params.push(date_from);
    }
    if (date_to) {
      where += ' AND DATE(c.created_at) <= ?';
      params.push(date_to);
    }
    if (status_id) {
      where += ' AND c.status_id = ?';
      params.push(parseInt(status_id, 10));
    }
    if (assigned_to) {
      where += ' AND c.case_owner_id = ?';
      params.push(parseInt(assigned_to, 10));
    }

    const [rows] = await pool.query(
      `SELECT c.case_number, c.case_type, c.priority, c.intake_channel,
              c.date_received, c.date_of_intake, c.created_at,
              u.name AS assigned_to, c.status_id
       FROM cases c
       LEFT JOIN users u ON c.case_owner_id = u.id
       WHERE ${where}
       ORDER BY c.created_at DESC`,
      params
    );

    if (!rows.length) {
      return res.status(200).json({ message: 'No cases match your filters' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const typeLabel = case_type || 'ALL';
    const [orgRow] = await pool.query('SELECT name FROM organisations WHERE id = ?', [orgId]);
    const orgName = (orgRow[0]?.name || 'Org').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${orgName}_${typeLabel}_${today}.csv`;

    function escapeCSV(val) {
      if (val == null) return '';
      let str = String(val);
      // Neutralise CSV formula injection: prefix a single quote when the value
      // starts with a formula trigger (=, +, -, @) or a tab/CR.
      if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

    const headers = ['Case Number', 'Case Type', 'Priority', 'Intake Channel', 'Date Received', 'Date of Intake', 'Created At', 'Assigned To', 'Status ID'];
    const csvRows = [
      headers.join(','),
      ...rows.map(r => [
        r.case_number, r.case_type, r.priority, r.intake_channel,
        r.date_received, r.date_of_intake, r.created_at,
        r.assigned_to, r.status_id,
      ].map(escapeCSV).join(',')),
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csvRows.join('\n'));
  } catch (_e) {
    return res.status(500).json({ error: 'Failed to export cases' });
  }
});

router.get('/admin/cases/export/e2b', authenticate, async (req, res) => {
  try {
    const orgId = req.user.orgId;
    if (orgId == null) return res.status(403).json({ error: 'Forbidden' });

    const { case_id } = req.query;
    if (!case_id) return res.status(400).json({ error: 'case_id is required' });

    const [caseRows] = await pool.query(
      `SELECT c.id, c.case_number, c.case_type, c.date_received, u.name AS case_owner, o.name AS organisation_name
       FROM cases c
       LEFT JOIN users u ON c.case_owner_id = u.id
       LEFT JOIN organisations o ON c.org_id = o.id
       WHERE c.id = ? AND c.org_id = ? AND c.is_deleted = 0
       LIMIT 1`,
      [parseInt(case_id, 10), orgId]
    );

    if (!caseRows.length) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const caseData = caseRows[0];
    const hasAe = String(caseData.case_type || '').toUpperCase() === 'AE';

    function formatDateTimeYYYYMMDDHHMMSS(dt) {
      const d = dt ? new Date(dt) : new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
    }

    function formatDateYYYYMMDD(dt) {
      if (!dt) return '';
      const d = new Date(dt);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}${mm}${dd}`;
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ichicsr lang="en">
  <ichicsrmessageheader>
    <messagetype>ichicsr</messagetype>
    <messageformatversion>2.1</messageformatversion>
    <messageformatrelease>2</messageformatrelease>
    <messagenumb>${caseData.case_number}</messagenumb>
    <messagesenderidentifier>MIMS</messagesenderidentifier>
    <messagereceiveridentifier>REGULATOR</messagereceiveridentifier>
    <messagedateformat>204</messagedateformat>
    <messagedate>${formatDateTimeYYYYMMDDHHMMSS(new Date())}</messagedate>
  </ichicsrmessageheader>
  <safetyreport>
    <safetyreportid>${caseData.case_number}</safetyreportid>
    <primarysourcecountry>UNKNOWN</primarysourcecountry>
    <reporttype>1</reporttype>
    <serious>${hasAe ? 1 : 2}</serious>
    <seriousnessother>1</seriousnessother>
    <receivedate>${formatDateYYYYMMDD(caseData.date_received)}</receivedate>
    <patient>
      <patientagegroup/>
      <patientsex/>
    </patient>
  </safetyreport>
</ichicsr>`;

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="E2B_${caseData.case_number}.xml"`);
    return res.send(xml);
  } catch (_e) {
    return res.status(500).json({ error: 'Failed to export E2B XML' });
  }
});

router.get('/admin/cases/export/xlsx', authenticate, async (req, res) => {
  try {
    const orgId = req.user.orgId;
    if (orgId == null) return res.status(403).json({ error: 'Forbidden' });

    try {
      require.resolve('exceljs');
    } catch (_e) {
      return res.status(500).json({
        error: 'XLSX export requires exceljs package. Run: npm install exceljs',
        installCommand: 'npm install exceljs',
      });
    }

    const ExcelJS = require('exceljs');
    const { case_type, date_from, date_to, status_id, assigned_to } = req.query;

    const params = [orgId];
    let where = 'c.org_id = ? AND c.is_deleted = 0';

    if (case_type) {
      where += ' AND c.case_type = ?';
      params.push(case_type);
    }
    if (date_from) {
      where += ' AND DATE(c.created_at) >= ?';
      params.push(date_from);
    }
    if (date_to) {
      where += ' AND DATE(c.created_at) <= ?';
      params.push(date_to);
    }
    if (status_id) {
      where += ' AND c.status_id = ?';
      params.push(parseInt(status_id, 10));
    }
    if (assigned_to) {
      where += ' AND c.case_owner_id = ?';
      params.push(parseInt(assigned_to, 10));
    }

    const [rows] = await pool.query(
      `SELECT c.case_number, c.case_type, c.priority, c.intake_channel,
              c.date_received, c.date_of_intake, c.created_at,
              u.name AS assigned_to, c.status_id
       FROM cases c
       LEFT JOIN users u ON c.case_owner_id = u.id
       WHERE ${where}
       ORDER BY c.created_at DESC`,
      params
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Cases');
    sheet.addRow(['Case Number', 'Case Type', 'Priority', 'Intake Channel', 'Date Received', 'Date of Intake', 'Created At', 'Assigned To', 'Status ID']);
    rows.forEach((r) => {
      sheet.addRow([
        r.case_number,
        r.case_type,
        r.priority,
        r.intake_channel,
        r.date_received,
        r.date_of_intake,
        r.created_at,
        r.assigned_to,
        r.status_id,
      ]);
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="cases_export.xlsx"');
    await workbook.xlsx.write(res);
    return res.end();
  } catch (_e) {
    return res.status(500).json({ error: 'Failed to export cases as XLSX' });
  }
});

router.get('/admin/cases/export/pdf', authenticate, async (req, res) => {
  try {
    const orgId = req.user.orgId;
    if (orgId == null) return res.status(403).json({ error: 'Forbidden' });

    try {
      require.resolve('pdfkit');
    } catch (_e) {
      return res.status(500).json({
        error: 'PDF export requires pdfkit package. Run: npm install pdfkit',
        installCommand: 'npm install pdfkit',
      });
    }

    const PDFDocument = require('pdfkit');
    const { case_type, date_from, date_to, status_id, assigned_to } = req.query;

    const params = [orgId];
    let where = 'c.org_id = ? AND c.is_deleted = 0';

    if (case_type) {
      where += ' AND c.case_type = ?';
      params.push(case_type);
    }
    if (date_from) {
      where += ' AND DATE(c.created_at) >= ?';
      params.push(date_from);
    }
    if (date_to) {
      where += ' AND DATE(c.created_at) <= ?';
      params.push(date_to);
    }
    if (status_id) {
      where += ' AND c.status_id = ?';
      params.push(parseInt(status_id, 10));
    }
    if (assigned_to) {
      where += ' AND c.case_owner_id = ?';
      params.push(parseInt(assigned_to, 10));
    }

    const [rows] = await pool.query(
      `SELECT c.case_number, c.case_type, c.priority, c.intake_channel,
              c.date_received, c.date_of_intake, c.created_at,
              u.name AS assigned_to, c.status_id
       FROM cases c
       LEFT JOIN users u ON c.case_owner_id = u.id
       WHERE ${where}
       ORDER BY c.created_at DESC`,
      params
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="cases_export.pdf"');

    const doc = new PDFDocument();
    doc.pipe(res);
    doc.fontSize(16).text('Cases Export');
    doc.moveDown();

    rows.forEach((r, idx) => {
      doc.fontSize(10).text(
        `${idx + 1}. ${r.case_number || ''} | ${r.case_type || ''} | ${r.priority || ''} | ${r.intake_channel || ''} | ${r.date_received || ''} | ${r.date_of_intake || ''} | ${r.created_at || ''} | ${r.assigned_to || ''} | ${r.status_id || ''}`
      );
    });

    doc.end();
    return undefined;
  } catch (_e) {
    return res.status(500).json({ error: 'Failed to export cases as PDF' });
  }
});

module.exports = router;
