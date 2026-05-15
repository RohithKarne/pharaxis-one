'use strict';

const pool = require('../../database/db');
const { buildPeriodicSafetySummary } = require('./periodicReports');

async function generatePeriodicReport({ orgId, productName, reportType = 'PSUR', from, to, userId = null }) {
  const [reports] = await pool.execute(
    `SELECT r.*, c.case_number
       FROM icsr_reports r JOIN cases c ON c.id = r.case_id
      WHERE r.org_id = ? AND r.created_at BETWEEN ? AND ?
      ORDER BY r.created_at ASC`,
    [orgId, `${from} 00:00:00`, `${to} 23:59:59`]
  );
  const summary = buildPeriodicSafetySummary({ product: productName, from, to, reports });
  const [result] = await pool.execute(
    `INSERT INTO pv_periodic_reports (org_id, product_name, report_type, period_start, period_end, summary_json, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`,
    [orgId, productName, reportType, from, to, JSON.stringify({ ...summary, cases: reports.map(r => ({ id: r.case_id, case_number: r.case_number, status: r.status })) }), userId]
  );
  return { id: result.insertId, summary };
}

module.exports = { generatePeriodicReport };
