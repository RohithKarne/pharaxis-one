'use strict';

const pool = require('../database/db');

function serializeFilters(filters) {
  if (!filters) return null;
  try {
    return JSON.stringify(filters);
  } catch (_) {
    return null;
  }
}

async function recordReportRun(payload) {
  const {
    orgId,
    reportKey,
    reportName,
    targetType = 'report',
    targetId = null,
    runMode = 'manual',
    triggeredBy = null,
    filters = null,
    timezoneName = null,
    rowCount = 0,
    deliveryMethod = null,
    deliveryTarget = null,
    status = 'success',
    errorMessage = null,
  } = payload || {};

  if (!orgId || !reportKey || !reportName) return null;

  const [result] = await pool.execute(
    `INSERT INTO report_run_ledger
       (org_id, report_key, report_name, target_type, target_id, run_mode, triggered_by, filters_json, timezone_name, row_count,
        delivery_method, delivery_target, status, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      orgId,
      reportKey,
      reportName,
      targetType || 'report',
      targetId || null,
      runMode,
      triggeredBy,
      serializeFilters(filters),
      timezoneName || null,
      Number(rowCount || 0),
      deliveryMethod || null,
      deliveryTarget || null,
      status || 'success',
      errorMessage || null,
    ]
  );

  return result.insertId || null;
}

async function listReportRunLedger(orgId, options = {}) {
  const limit = Math.max(1, Math.min(100, Number(options.limit || 40)));
  const offset = Math.max(0, Number(options.offset || 0));

  const params = [];
  let where = '';
  if (orgId) {
    where = 'WHERE r.org_id = ?';
    params.push(orgId);
  }

  const [rows] = await pool.execute(
    `SELECT
       r.id,
       r.report_key,
       r.report_name,
       r.target_type,
       r.target_id,
       r.run_mode,
       r.timezone_name,
       r.row_count,
       r.delivery_method,
       r.delivery_target,
       r.status,
       r.error_message,
       r.created_at,
       u.name AS triggered_by_name
     FROM report_run_ledger r
     LEFT JOIN users u ON u.id = r.triggered_by
     ${where}
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );

  return rows;
}

module.exports = {
  recordReportRun,
  listReportRunLedger,
};
