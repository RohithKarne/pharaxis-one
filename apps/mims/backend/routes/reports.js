const express = require('express');
const { authenticate, requireCapability } = require('../middleware/auth');
const pool = require('../database/db');
const {
  getDailyCaseOpenings,
  getDailyCaseClosures,
  getDailyCaseSummary,
  getDailyOperationsPack,
  getInboxPerformanceReport,
  getInboxSlaReport,
  getTransmissionSlaReport,
} = require('../services/reportDatasetService');
const { recordReportRun, listReportRunLedger } = require('../services/reportOpsService');
const { hasGlobalAdminScope } = require('../utils/adminScope');
// Loaded on first use rather than at module load. This service is mid-write —
// two of the modules it requires have not been written yet — and requiring it
// here threw MODULE_NOT_FOUND during mountRoutes, which stopped the entire
// backend from starting. An unfinished endpoint should fail by itself; the
// handlers below already return 500 on error, so that is what now happens.
const scheduledReportService = new Proxy({}, {
  get: (_t, prop) => (...args) => require('../services/scheduledReportService')[prop](...args),
});
const router = express.Router();

function dateFilters(from, to, col) {
  const parts = [];
  const params = [];
  if (from) { parts.push(`DATE(${col}) >= ?`); params.push(from); }
  if (to)   { parts.push(`DATE(${col}) <= ?`); params.push(to); }
  return { sql: parts.join(' AND '), params };
}

function normalizeOrgId(value) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? value : parsed;
}

function resolveReportOrgId(req) {
  const userOrgId = normalizeOrgId(req.user.orgId);
  const overrideOrgId = parseInt(req.query.org_id, 10);
  return hasGlobalAdminScope(req.user) && !Number.isNaN(overrideOrgId) ? overrideOrgId : userOrgId;
}

router.get('/reports/daily-case-openings', authenticate, async (req, res) => {
  try {
    const rows = await getDailyCaseOpenings(resolveReportOrgId(req), req.query);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/daily-case-closures', authenticate, async (req, res) => {
  try {
    const rows = await getDailyCaseClosures(resolveReportOrgId(req), req.query);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/daily-case-summary', authenticate, async (req, res) => {
  try {
    const rows = await getDailyCaseSummary(resolveReportOrgId(req), req.query);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/daily-operations-pack', authenticate, async (req, res) => {
  try {
    const rows = await getDailyOperationsPack(resolveReportOrgId(req), req.query);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/inbox-performance', authenticate, async (req, res) => {
  try {
    const rows = await getInboxPerformanceReport(resolveReportOrgId(req), req.query);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/inbox-sla', authenticate, async (req, res) => {
  try {
    const rows = await getInboxSlaReport(resolveReportOrgId(req), req.query);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/report-run-ledger', authenticate, async (req, res) => {
  try {
    const rows = await listReportRunLedger(resolveReportOrgId(req), {
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/reports/run-log', authenticate, async (req, res) => {
  try {
    const {
      report_key,
      report_name,
      filters,
      timezone_name,
      row_count,
      status,
      error_message,
    } = req.body || {};

    if (!report_key || !report_name) {
      return res.status(400).json({ error: 'report_key and report_name are required.' });
    }

    const id = await recordReportRun({
      orgId: resolveReportOrgId(req),
      reportKey: String(report_key),
      reportName: String(report_name),
      runMode: 'manual',
      triggeredBy: req.user.userId || null,
      filters: filters || null,
      timezoneName: timezone_name || null,
      rowCount: Number(row_count || 0),
      status: status || 'success',
      errorMessage: error_message || null,
    });

    return res.json({ id, success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/transmission-sla', authenticate, async (req, res) => {
  try {
    const rows = await getTransmissionSlaReport(resolveReportOrgId(req), req.query);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/case-volume', authenticate, async (req, res) => {
  try {
    const { date_from, date_to, org_id } = req.query;
    const userOrgId = normalizeOrgId(req.user.orgId);
    const overrideOrgId = parseInt(org_id, 10);
    const orgId = hasGlobalAdminScope(req.user) && !Number.isNaN(overrideOrgId) ? overrideOrgId : userOrgId;
    const df = dateFilters(date_from, date_to, 'created_at');

    let sql = `
      SELECT DATE(created_at) as date, COUNT(*) as total
      FROM cases
      WHERE org_id = ? AND is_deleted = 0
    `;
    const params = [orgId];
    if (df.sql) {
      sql += ` AND ${df.sql}`;
      params.push(...df.params);
    }
    sql += ' GROUP BY DATE(created_at) ORDER BY date ASC';

    const [rows] = await pool.execute(sql, params);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/case-status', authenticate, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const orgId = resolveReportOrgId(req);
    const df = dateFilters(date_from, date_to, 'created_at');

    let sql = `
      SELECT status_id, COUNT(*) as total
      FROM cases
      WHERE org_id = ? AND is_deleted = 0
    `;
    const params = [orgId];
    if (df.sql) {
      sql += ` AND ${df.sql}`;
      params.push(...df.params);
    }
    sql += ' GROUP BY status_id ORDER BY total DESC';

    const [rows] = await pool.execute(sql, params);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/case-type', authenticate, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const orgId = resolveReportOrgId(req);
    const df = dateFilters(date_from, date_to, 'created_at');

    let sql = `
      SELECT case_type, COUNT(*) as total
      FROM cases
      WHERE org_id = ? AND is_deleted = 0
    `;
    const params = [orgId];
    if (df.sql) {
      sql += ` AND ${df.sql}`;
      params.push(...df.params);
    }
    sql += ' GROUP BY case_type ORDER BY total DESC';

    const [rows] = await pool.execute(sql, params);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/case-age', authenticate, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const orgId = resolveReportOrgId(req);
    const df = dateFilters(date_from, date_to, 'created_at');

    let sql = `
      SELECT case_type,
        AVG(DATEDIFF(updated_at, created_at)) as avg_days_to_close,
        MAX(DATEDIFF(updated_at, created_at)) as max_days,
        MIN(DATEDIFF(updated_at, created_at)) as min_days,
        COUNT(*) as total
      FROM cases
      WHERE org_id = ? AND is_deleted = 0
    `;
    const params = [orgId];
    if (df.sql) {
      sql += ` AND ${df.sql}`;
      params.push(...df.params);
    }
    sql += ' GROUP BY case_type';

    const [rows] = await pool.execute(sql, params);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/case-assignee', authenticate, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const orgId = resolveReportOrgId(req);
    const df = dateFilters(date_from, date_to, 'c.created_at');

    let sql = `
      SELECT u.name as assignee, u.id as user_id, COUNT(c.id) as total
      FROM cases c
      LEFT JOIN users u ON c.case_owner_id = u.id
      WHERE c.org_id = ? AND c.is_deleted = 0
    `;
    const params = [orgId];
    if (df.sql) {
      sql += ` AND ${df.sql}`;
      params.push(...df.params);
    }
    sql += ' GROUP BY u.id, u.name ORDER BY total DESC';

    const [rows] = await pool.execute(sql, params);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/case-by-org', authenticate, async (req, res) => {
  try {
    const isPlatformAdmin = hasGlobalAdminScope(req.user);
    const orgId = resolveReportOrgId(req);

    let sql = `
      SELECT o.name as org_name, c.org_id, COUNT(c.id) as total
      FROM cases c
      JOIN organisations o ON c.org_id = o.id
      WHERE c.is_deleted = 0
    `;
    const params = [];

    if (!isPlatformAdmin) {
      sql += ' AND c.org_id = ?';
      params.push(orgId);
    }

    sql += ' GROUP BY c.org_id, o.name ORDER BY total DESC';

    const [rows] = await pool.execute(sql, params);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/case-intake-channel', authenticate, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const orgId = resolveReportOrgId(req);
    const df = dateFilters(date_from, date_to, 'created_at');

    let sql = `
      SELECT intake_channel, COUNT(*) as total
      FROM cases
      WHERE org_id = ? AND is_deleted = 0
    `;
    const params = [orgId];
    if (df.sql) {
      sql += ` AND ${df.sql}`;
      params.push(...df.params);
    }
    sql += ' GROUP BY intake_channel ORDER BY total DESC';

    const [rows] = await pool.execute(sql, params);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/case-priority', authenticate, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const orgId = resolveReportOrgId(req);
    const df = dateFilters(date_from, date_to, 'created_at');

    let sql = `
      SELECT priority, case_type, COUNT(*) as total
      FROM cases
      WHERE org_id = ? AND is_deleted = 0
    `;
    const params = [orgId];
    if (df.sql) {
      sql += ` AND ${df.sql}`;
      params.push(...df.params);
    }
    sql += ' GROUP BY priority, case_type ORDER BY priority, case_type';

    const [rows] = await pool.execute(sql, params);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/case-ae-summary', authenticate, async (req, res) => {
  try {
    const orgId = resolveReportOrgId(req);
    const sql = `
      SELECT
        COUNT(DISTINCT c.id) as total_ae_cases,
        COUNT(DISTINCT CASE WHEN ae.is_serious = 1 THEN c.id END) as serious,
        COUNT(DISTINCT CASE WHEN ae.outcome IS NOT NULL AND ae.outcome <> '' THEN c.id END) as with_outcome
      FROM cases c
      LEFT JOIN case_ae_versions av ON av.case_id = c.id
      LEFT JOIN case_ae_events ae ON ae.version_id = av.id
      WHERE c.org_id = ? AND c.is_deleted = 0 AND c.case_type = 'AE'
    `;

    const [rows] = await pool.execute(sql, [orgId]);
    return res.json({ data: rows[0] || {} });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/case-duplicates', authenticate, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const orgId = resolveReportOrgId(req);
    const df = dateFilters(date_from, date_to, 'c1.created_at');

    let sql = `
      SELECT c1.case_number, c1.case_type, c1.created_at,
        COUNT(c2.id) as potential_duplicates
      FROM cases c1
      JOIN cases c2 ON c1.org_id = c2.org_id
        AND c1.case_type = c2.case_type
        AND c1.id <> c2.id
        AND c2.is_deleted = 0
        AND ABS(TIMESTAMPDIFF(HOUR, c1.created_at, c2.created_at)) <= 24
      WHERE c1.org_id = ? AND c1.is_deleted = 0
    `;
    const params = [orgId];
    if (df.sql) {
      sql += ` AND ${df.sql}`;
      params.push(...df.params);
    }

    sql += ' GROUP BY c1.id HAVING potential_duplicates > 0 ORDER BY c1.created_at DESC LIMIT 50';

    const [rows] = await pool.execute(sql, params);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/case-source', authenticate, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const orgId = resolveReportOrgId(req);
    const df = dateFilters(date_from, date_to, 'created_at');

    let sql = `
      SELECT intake_channel as source, COUNT(*) as total
      FROM cases
      WHERE org_id = ? AND is_deleted = 0
    `;
    const params = [orgId];
    if (df.sql) {
      sql += ` AND ${df.sql}`;
      params.push(...df.params);
    }
    sql += ' GROUP BY intake_channel ORDER BY total DESC';

    const [rows] = await pool.execute(sql, params);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/case-audit-trail', authenticate, async (req, res) => {
  try {
    const caseId = parseInt(req.query.case_id, 10);
    const orgId = resolveReportOrgId(req);

    if (Number.isNaN(caseId)) {
      return res.status(400).json({ error: 'case_id is required' });
    }

    const sql = `
      SELECT aal.*, u.name as actor_name
      FROM admin_audit_log aal
      LEFT JOIN users u ON aal.user_id = u.id
      WHERE aal.target_type = 'case' AND aal.target_id = ? AND aal.org_id = ?
      ORDER BY aal.created_at DESC
      LIMIT 100
    `;

    try {
      const [rows] = await pool.execute(sql, [caseId, orgId]);
      return res.json({ data: rows });
    } catch (queryErr) {
      return res.json({ data: [], message: 'Audit log not available' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/regulatory-readiness', authenticate, async (req, res) => {
  try {
    const orgId = resolveReportOrgId(req);
    const sql = `
      SELECT c.case_number, c.case_type, c.created_at, c.status_id,
        DATEDIFF(NOW(), c.created_at) as age_days,
        CASE WHEN c.case_number IS NULL THEN 'Missing case number' ELSE '' END as issue
      FROM cases c
      WHERE c.org_id = ? AND c.is_deleted = 0
        AND (c.case_number IS NULL OR DATEDIFF(NOW(), c.created_at) > 30)
      ORDER BY age_days DESC
      LIMIT 100
    `;

    const [rows] = await pool.execute(sql, [orgId]);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/case-monthly-trend', authenticate, async (req, res) => {
  try {
    const orgId = resolveReportOrgId(req);
    const monthsRaw = parseInt(req.query.months, 10);
    const months = Number.isNaN(monthsRaw) ? 6 : monthsRaw;

    const sql = `
      SELECT DATE_FORMAT(created_at, '%Y-%m') as month, COUNT(*) as total
      FROM cases
      WHERE org_id = ? AND is_deleted = 0
        AND created_at >= DATE_SUB(NOW(), INTERVAL ? MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month ASC
    `;

    const [rows] = await pool.execute(sql, [orgId, months]);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/case-closure-rate', authenticate, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const orgId = resolveReportOrgId(req);
    const df = dateFilters(date_from, date_to, 'created_at');

    let sql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status_id IS NOT NULL THEN 1 ELSE 0 END) as with_status,
        ROUND(SUM(CASE WHEN status_id IS NOT NULL THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as closure_rate_pct
      FROM cases
      WHERE org_id = ? AND is_deleted = 0
    `;
    const params = [orgId];
    if (df.sql) {
      sql += ` AND ${df.sql}`;
      params.push(...df.params);
    }

    const [rows] = await pool.execute(sql, params);
    return res.json({ data: rows[0] || {} });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/user-activity', authenticate, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const orgId = resolveReportOrgId(req);
    const df = dateFilters(date_from, date_to, 's.created_at');

    // L-08: the session date range must sit in the LEFT JOIN ... ON clause, not WHERE.
    // In WHERE it filters out the NULL `s.*` rows produced for users with no sessions in
    // range, turning the LEFT JOIN into an effective INNER JOIN. Placing it in ON keeps
    // those users with session_count = 0.
    let sql = `
      SELECT u.name, u.email, u.role,
        COUNT(s.id) as session_count,
        MAX(s.created_at) as last_login
      FROM users u
      LEFT JOIN sessions s ON s.user_id = u.id${df.sql ? ` AND ${df.sql}` : ''}
      WHERE u.is_active = 1
        AND EXISTS (SELECT 1 FROM user_org_access uoa WHERE uoa.user_id = u.id AND uoa.org_id = ? AND uoa.is_active = 1)
    `;

    sql += `
      GROUP BY u.id, u.name, u.email, u.role
      ORDER BY session_count DESC
    `;

    const params = [...df.params, orgId];
    const [rows] = await pool.execute(sql, params);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/security-events', authenticate, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const orgId = resolveReportOrgId(req);
    const df = dateFilters(date_from, date_to, 'created_at');

    let sql = `
      SELECT DATE(created_at) as date, event_type, COUNT(*) as total
      FROM mims_process_logs
      WHERE org_id = ? AND event_type IN ('failed_login', 'two_factor_lockout', 'ip_blocked')
    `;
    const params = [orgId];

    if (df.sql) {
      sql += ` AND ${df.sql}`;
      params.push(...df.params);
    }

    sql += ' GROUP BY DATE(created_at), event_type ORDER BY date DESC';

    const [rows] = await pool.execute(sql, params);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/module-usage', authenticate, async (req, res) => {
  try {
    const orgId = resolveReportOrgId(req);

    const sql = `
      SELECT source_module, COUNT(*) as total_requests,
        AVG(duration_ms) as avg_duration_ms
      FROM mims_process_logs
      WHERE org_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY source_module
      ORDER BY total_requests DESC
    `;

    const [rows] = await pool.execute(sql, [orgId]);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/org-activity', authenticate, async (req, res) => {
  try {
    if (!hasGlobalAdminScope(req.user)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const sql = `
      SELECT o.name as org_name, o.id as org_id,
        COUNT(DISTINCT c.id) as total_cases,
        COUNT(DISTINCT u.id) as active_users,
        MAX(c.created_at) as last_case_created
      FROM organisations o
      LEFT JOIN cases c ON c.org_id = o.id AND c.is_deleted = 0
      LEFT JOIN user_org_access uoa ON uoa.org_id = o.id AND uoa.is_active = 1
      LEFT JOIN users u ON uoa.user_id = u.id AND u.is_active = 1
      WHERE o.is_active = 1
      GROUP BY o.id, o.name
      ORDER BY total_cases DESC
    `;

    const [rows] = await pool.execute(sql);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/user-roles', authenticate, async (req, res) => {
  try {
    const orgId = resolveReportOrgId(req);

    const sql = `
      SELECT u.role, COUNT(DISTINCT u.id) as user_count
      FROM users u
      JOIN user_org_access uoa ON uoa.user_id = u.id AND uoa.org_id = ? AND uoa.is_active = 1
      WHERE u.is_active = 1
      GROUP BY u.role
      ORDER BY user_count DESC
    `;

    const [rows] = await pool.execute(sql, [orgId]);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/content-usage', authenticate, async (req, res) => {
  try {
    const orgId = resolveReportOrgId(req);

    const sql = `
      SELECT d.title, d.doc_type, d.view_count,
        d.expiry_date, d.created_at
      FROM cm_documents d
      WHERE d.org_id = ? AND d.is_active = 1
      ORDER BY d.view_count DESC, d.created_at DESC
      LIMIT 50
    `;

    try {
      const [rows] = await pool.execute(sql, [orgId]);
      return res.json({ data: rows });
    } catch (queryErr) {
      return res.json({ data: [], message: 'view_count tracking not enabled' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/integration-sync', authenticate, async (req, res) => {
  try {
    const orgId = resolveReportOrgId(req);

    const sql = `
      SELECT integration_type, enabled, updated_at
      FROM org_integrations
      WHERE org_id = ?
      ORDER BY integration_type
    `;

    const [rows] = await pool.execute(sql, [orgId]);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/audit-summary', authenticate, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const orgId = resolveReportOrgId(req);
    const df = dateFilters(date_from, date_to, 'created_at');

    let sql = `
      SELECT DATE(created_at) as date, COUNT(*) as total_events
      FROM mims_process_logs
      WHERE org_id = ?
    `;
    const params = [orgId];

    if (df.sql) {
      sql += ` AND ${df.sql}`;
      params.push(...df.params);
    }

    sql += ' GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 60';

    const [rows] = await pool.execute(sql, params);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/system-health', authenticate, async (req, res) => {
  try {
    const orgId = resolveReportOrgId(req);

    const sql = `
      SELECT source_module,
        COUNT(*) as total_requests,
        SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) as error_count,
        ROUND(SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as error_rate_pct,
        AVG(duration_ms) as avg_duration_ms
      FROM mims_process_logs
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        AND org_id = ?
      GROUP BY source_module
      ORDER BY error_count DESC
    `;

    const [rows] = await pool.execute(sql, [orgId]);
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.get('/reports/field-usage', authenticate, async (req, res) => {
  try {
    const orgId = resolveReportOrgId(req);

    const sql = `
      SELECT fs.section_name, fs.field_name, fs.field_type,
        COUNT(cv.id) as populated_count
      FROM field_setup fs
      LEFT JOIN case_values cv ON cv.field_name = fs.field_name AND cv.org_id = fs.org_id
      WHERE fs.org_id = ?
      GROUP BY fs.id, fs.section_name, fs.field_name, fs.field_type
      ORDER BY populated_count DESC
    `;

    try {
      const [rows] = await pool.execute(sql, [orgId]);
      return res.json({ data: rows });
    } catch (queryErr) {
      return res.json({ data: [], message: 'case_values table not available' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── F3 FIX: Report Presets — backend persistence (replaces localStorage) ────

// GET /api/reports/presets
router.get('/presets', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, group_key, report_key, filters, created_at
       FROM user_report_presets WHERE user_id = ? AND org_id = ?
       ORDER BY created_at DESC LIMIT 20`,
      [req.user.userId, req.user.orgId]
    );
    rows.forEach(r => {
      try { r.filters = typeof r.filters === 'string' ? JSON.parse(r.filters) : (r.filters || {}); } catch (_) { r.filters = {}; }
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/reports/presets
router.post('/presets', authenticate, requireCapability('reports.manage'), async (req, res) => {
  try {
    const { name, group_key, report_key, filters } = req.body;
    if (!name || !group_key || !report_key) return res.status(400).json({ error: 'name, group_key, report_key are required.' });
    // Upsert by name per user — delete existing with same name first
    await pool.execute(
      `DELETE FROM user_report_presets WHERE user_id = ? AND org_id = ? AND name = ?`,
      [req.user.userId, req.user.orgId, String(name).trim()]
    );
    const [result] = await pool.execute(
      `INSERT INTO user_report_presets (user_id, org_id, name, group_key, report_key, filters) VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.userId, req.user.orgId, String(name).trim(), group_key, report_key, JSON.stringify(filters || {})]
    );
    res.status(201).json({ id: result.insertId, name: String(name).trim(), group_key, report_key, filters: filters || {} });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/reports/presets/:id
router.delete('/presets/:id', authenticate, requireCapability('reports.manage'), async (req, res) => {
  try {
    await pool.execute(
      `DELETE FROM user_report_presets WHERE id = ? AND user_id = ? AND org_id = ?`,
      [req.params.id, req.user.userId, req.user.orgId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Scheduled Reports Routes
router.get('/reports/scheduled', authenticate, async (req, res) => {
  try {
    const orgId = resolveReportOrgId(req);
    const schedules = await scheduledReportService.listSchedules(orgId);
    return res.json({ data: schedules });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/reports/scheduled', authenticate, async (req, res) => {
  try {
    const orgId = resolveReportOrgId(req);
    const data = { ...req.body, org_id: orgId, created_by: req.user.userId };
    const schedule = await scheduledReportService.createSchedule(data);
    return res.json({ data: schedule, success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/reports/scheduled/:id', authenticate, async (req, res) => {
  try {
    await scheduledReportService.deleteSchedule(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.post('/reports/scheduled/:id/run-now', authenticate, async (req, res) => {
  try {
    await scheduledReportService.executeScheduledReport(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
