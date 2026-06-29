const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { getRuntimeHealth } = require('../../services/runtimeHealthService');

function parseDetails(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return { raw: String(raw) };
  }
}

router.get('/observability/summary', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const [serviceSummaryRows] = await pool.execute(
      `SELECT
         COUNT(*) AS total_logs,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_logs,
         SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) AS warning_logs,
         SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 ELSE 0 END) AS logs_24h
       FROM service_logs`
    );

    const [processSummaryRows] = await pool.execute(
      `SELECT
         COUNT(*) AS total_events_24h,
         SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) AS server_errors_24h,
         SUM(CASE WHEN status_code >= 400 AND status_code < 500 THEN 1 ELSE 0 END) AS client_errors_24h,
         AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms ELSE NULL END) AS avg_duration_ms_24h
       FROM mims_process_logs
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );

    const [slowEndpoints] = await pool.execute(
      `SELECT path, method,
              COUNT(*) AS hits,
              ROUND(AVG(duration_ms), 2) AS avg_duration_ms,
              MAX(duration_ms) AS max_duration_ms
       FROM mims_process_logs
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
         AND duration_ms IS NOT NULL
       GROUP BY path, method
       ORDER BY avg_duration_ms DESC
       LIMIT 10`
    );

    const [errorEndpoints] = await pool.execute(
      `SELECT path, method, status_code, COUNT(*) AS total
       FROM mims_process_logs
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
         AND status_code >= 400
       GROUP BY path, method, status_code
       ORDER BY total DESC
       LIMIT 15`
    );

    const serviceSummary = serviceSummaryRows[0] || {};
    const processSummary = processSummaryRows[0] || {};

    res.json({
      generated_at: new Date().toISOString(),
      service_summary: {
        total_logs: Number(serviceSummary.total_logs || 0),
        failed_logs: Number(serviceSummary.failed_logs || 0),
        warning_logs: Number(serviceSummary.warning_logs || 0),
        logs_24h: Number(serviceSummary.logs_24h || 0),
      },
      process_summary_24h: {
        total_events: Number(processSummary.total_events_24h || 0),
        server_errors: Number(processSummary.server_errors_24h || 0),
        client_errors: Number(processSummary.client_errors_24h || 0),
        avg_duration_ms: Number(processSummary.avg_duration_ms_24h || 0),
      },
      exception_summary_24h: {
        total_exceptions: Number(processSummary.server_errors_24h || 0) + Number(processSummary.client_errors_24h || 0),
      },
      slow_endpoints: slowEndpoints,
      error_endpoints: errorEndpoints,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load observability summary.' });
  }
});

router.get('/observability/runtime-health', authenticate, requireRole('admin', 'platform_admin'), async (_req, res) => {
  try {
    const health = await getRuntimeHealth();
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load runtime health.' });
  }
});

// WP1: cross-tenant service_logs (stack traces + PII) — was authenticate-only, any
// logged-in user could page other tenants' exceptions. Lock to platform admins.
router.get('/observability/exceptions', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(100, Math.max(10, parseInt(req.query.page_size || '20', 10)));
    const offset = (page - 1) * pageSize;

    const status = String(req.query.status || '').trim();
    const source = String(req.query.source || '').trim();
    const dateFrom = String(req.query.date_from || '').trim();
    const dateTo = String(req.query.date_to || '').trim();
    const search = String(req.query.search || '').trim();

    const where = ["(source = 'API Exceptions' OR source = 'Frontend Runtime')"];
    const params = [];

    if (status) {
      where.push('status = ?');
      params.push(status);
    }
    if (source) {
      where.push('source = ?');
      params.push(source);
    }
    if (dateFrom) {
      where.push('DATE(created_at) >= DATE(?)');
      params.push(dateFrom);
    }
    if (dateTo) {
      where.push('DATE(created_at) <= DATE(?)');
      params.push(dateTo);
    }
    if (search) {
      where.push('(description LIKE ? OR details LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;

    const [[countRow]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM service_logs
       ${whereSql}`,
      params
    );

    const [rows] = await pool.execute(
      `SELECT id, source, service_type, description, details, status, created_at
       FROM service_logs
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params
    );

    const data = rows.map((row) => {
      const details = parseDetails(row.details);
      return {
        id: row.id,
        source: row.source,
        status: row.status,
        description: row.description,
        created_at: row.created_at,
        exception_id: details?.exception_id || null,
        request_id: details?.request_id || null,
        route: details?.path || null,
        method: details?.method || null,
        status_code: details?.status_code || null,
        details,
      };
    });

    return res.json({
      data,
      total: Number(countRow?.total || 0),
      page,
      page_size: pageSize,
      total_pages: Math.max(1, Math.ceil(Number(countRow?.total || 0) / pageSize)),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load exception logs.' });
  }
});

module.exports = router;
