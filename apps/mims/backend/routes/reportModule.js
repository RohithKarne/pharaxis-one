'use strict';

const express = require('express');
const pool = require('../database/db');
const { authenticate } = require('../middleware/auth');
const {
  getDatasetCatalog,
  listReportDefinitions,
  getReportDefinitionById,
  createReportDefinition,
  updateReportDefinition,
  deleteReportDefinition,
  duplicateReportDefinition,
  publishReportDefinition,
  certifyReportDefinition,
  listEntityVersions,
  previewDataset,
  runReportDefinition,
  listDashboards,
  getDashboardById,
  createDashboard,
  updateDashboard,
  deleteDashboard,
  duplicateDashboard,
  publishDashboard,
  createDashboardTemplate,
  listDashboardTemplates,
  createDashboardFromTemplate,
  listFavorites,
  addFavorite,
  deleteFavorite,
  listDashboardShares,
  addDashboardShare,
  deleteDashboardShare,
  setRoleDefaultDashboard,
  getRoleDefaultDashboards,
  recordUsageEvent,
  listUsageAnalytics,
  validateReportConfig,
  listRecommendations,
  runDashboard,
  getModuleConfig,
  saveModuleConfig,
  getModuleSummary,
} = require('../services/reportModuleService');
const {
  getExportConfigs,
  createExportConfig,
  updateExportConfig,
  pauseExportConfig,
  resumeExportConfig,
  deleteExportConfig,
} = require('../services/scheduledExportService');
const { recordReportRun } = require('../services/reportOpsService');
const { hasGlobalAdminScope } = require('../utils/adminScope');
const { userHasActivityPrivilege } = require('../services/accessConfigurationService');

const router = express.Router();

// Capability-based: mirrors the frontend hasCapability('reports.manage') gate and
// the presets routes' requireCapability('reports.manage'). Role-only here would
// reject non-admins who were explicitly granted reports.manage while the UI still
// shows them the management buttons. userHasActivityPrivilege handles global admin,
// explicit grants, and role-default fallback.
async function canManageReports(req) {
  if (hasGlobalAdminScope(req.user)) return true;
  return userHasActivityPrivilege(req.user, 'reports.manage');
}

function parseMaybeJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

async function requireReportManager(req, res, next) {
  try {
    if (await canManageReports(req)) return next();
    return res.status(403).json({ error: 'You do not have permission to manage reports.' });
  } catch (err) {
    console.error('requireReportManager failed:', err);
    return res.status(500).json({ error: 'Permission check failed.' });
  }
}

async function flagAnomaliesForRun({ orgId, runId, targetType, targetId, rowCount, status, errorMessage }) {
  if (!orgId || !runId) return;
  const flags = [];
  if (status === 'failed') {
    flags.push({ anomaly_type: 'run_failed', severity: 'critical', message: errorMessage || 'Report run failed.' });
  }
  if (Number(rowCount || 0) === 0) {
    flags.push({ anomaly_type: 'empty_result', severity: 'warning', message: 'Report run returned no rows.' });
  }
  for (const flag of flags) {
    await pool.execute(
      `INSERT INTO report_anomaly_flags (org_id, run_id, target_type, target_id, anomaly_type, severity, message)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [orgId, runId, targetType || 'report', targetId || null, flag.anomaly_type, flag.severity, flag.message]
    ).catch(() => {});
  }
}

router.get('/reports/module/summary', authenticate, async (req, res) => {
  try {
    const summary = await getModuleSummary(req.user.orgId);
    return res.json(summary);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load report module summary.' });
  }
});

router.get('/reports/module/datasets', authenticate, (_req, res) => {
  return res.json({ datasets: getDatasetCatalog() });
});

router.post('/reports/module/datasets/:datasetKey/preview', authenticate, async (req, res) => {
  try {
    const result = await previewDataset(req.params.datasetKey, req.user.orgId, req.body?.filters || {});
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to preview dataset.' });
  }
});

router.get('/reports/module/definitions', authenticate, async (req, res) => {
  try {
    const definitions = await listReportDefinitions(req.user.orgId, {
      includeInactive: await canManageReports(req),
      productGroupId: req.query.product_group_id || null,
    });
    return res.json({ definitions });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load report definitions.' });
  }
});

router.post('/reports/module/definitions', authenticate, requireReportManager, async (req, res) => {
  try {
    const definition = await createReportDefinition(req.user.orgId, req.user.userId, req.body || {});
    return res.status(201).json(definition);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to create report definition.' });
  }
});

router.put('/reports/module/definitions/:id', authenticate, requireReportManager, async (req, res) => {
  try {
    const definition = await updateReportDefinition(req.user.orgId, req.user.userId, Number(req.params.id), req.body || {});
    return res.json(definition);
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    return res.status(status).json({ error: err.message || 'Failed to update report definition.' });
  }
});

router.delete('/reports/module/definitions/:id', authenticate, requireReportManager, async (req, res) => {
  try {
    const deleted = await deleteReportDefinition(req.user.orgId, Number(req.params.id));
    return res.json({ ok: true, deleted });
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    return res.status(status).json({ error: err.message || 'Failed to delete report definition.' });
  }
});

router.post('/reports/module/definitions/:id/run', authenticate, async (req, res) => {
  const startedAt = Date.now();
  try {
    const definition = await getReportDefinitionById(req.user.orgId, Number(req.params.id));
    if (!definition) return res.status(404).json({ error: 'Report definition not found.' });
    const result = await runReportDefinition(definition, req.user.orgId, req.body?.filters || {});
    await recordUsageEvent(req.user.orgId, req.user.userId, 'run', 'report', definition.id, { report_key: definition.report_key }).catch(() => {});
    const runId = await recordReportRun({
      orgId: req.user.orgId,
      reportKey: definition.report_key,
      reportName: definition.name,
      targetType: 'report',
      targetId: definition.id,
      runMode: 'manual',
      triggeredBy: req.user.userId || null,
      filters: result.filters,
      timezoneName: req.body?.timezone_name || null,
      rowCount: result.row_count,
      durationMs: Date.now() - startedAt,
      status: 'success',
    }).catch(() => {});
    await flagAnomaliesForRun({ orgId: req.user.orgId, runId, targetType: 'report', targetId: definition.id, rowCount: result.row_count, status: 'success' });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to run report definition.' });
  }
});

router.post('/reports/module/definitions/:id/duplicate', authenticate, requireReportManager, async (req, res) => {
  try {
    const definition = await duplicateReportDefinition(req.user.orgId, req.user.userId, Number(req.params.id));
    await recordUsageEvent(req.user.orgId, req.user.userId, 'duplicate', 'report', definition.id, { source_id: Number(req.params.id) }).catch(() => {});
    return res.status(201).json(definition);
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    return res.status(status).json({ error: err.message || 'Failed to duplicate report definition.' });
  }
});

router.get('/reports/module/definitions/:id/versions', authenticate, async (req, res) => {
  try {
    const versions = await listEntityVersions(req.user.orgId, 'report', Number(req.params.id));
    return res.json({ versions });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load report versions.' });
  }
});

router.post('/reports/module/definitions/:id/publish', authenticate, requireReportManager, async (req, res) => {
  try {
    const definition = await publishReportDefinition(req.user.orgId, req.user.userId, Number(req.params.id));
    return res.json(definition);
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    return res.status(status).json({ error: err.message || 'Failed to publish report definition.' });
  }
});

router.post('/reports/module/definitions/:id/certify', authenticate, requireReportManager, async (req, res) => {
  try {
    const definition = await certifyReportDefinition(req.user.orgId, req.user.userId, Number(req.params.id), req.body || {});
    return res.json(definition);
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    return res.status(status).json({ error: err.message || 'Failed to certify report definition.' });
  }
});

router.get('/reports/module/dashboards', authenticate, async (req, res) => {
  try {
    const dashboards = await listDashboards(req.user.orgId, {
      includeInactive: await canManageReports(req),
    });
    return res.json({ dashboards });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load dashboards.' });
  }
});

router.post('/reports/module/dashboards', authenticate, requireReportManager, async (req, res) => {
  try {
    const dashboard = await createDashboard(req.user.orgId, req.user.userId, req.body || {});
    return res.status(201).json(dashboard);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to create dashboard.' });
  }
});

router.put('/reports/module/dashboards/:id', authenticate, requireReportManager, async (req, res) => {
  try {
    const dashboard = await updateDashboard(req.user.orgId, req.user.userId, Number(req.params.id), req.body || {});
    return res.json(dashboard);
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    return res.status(status).json({ error: err.message || 'Failed to update dashboard.' });
  }
});

router.delete('/reports/module/dashboards/:id', authenticate, requireReportManager, async (req, res) => {
  try {
    const deleted = await deleteDashboard(req.user.orgId, Number(req.params.id));
    return res.json({ ok: true, deleted });
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    return res.status(status).json({ error: err.message || 'Failed to delete dashboard.' });
  }
});

router.post('/reports/module/dashboards/:id/run', authenticate, async (req, res) => {
  const startedAt = Date.now();
  try {
    const dashboard = await getDashboardById(req.user.orgId, Number(req.params.id));
    if (!dashboard) return res.status(404).json({ error: 'Dashboard not found.' });
    const payload = await runDashboard(dashboard, req.user.orgId, req.body?.filters || {});
    await recordUsageEvent(req.user.orgId, req.user.userId, 'run', 'dashboard', dashboard.id, { dashboard_key: dashboard.dashboard_key }).catch(() => {});
    const runId = await recordReportRun({
      orgId: req.user.orgId,
      reportKey: dashboard.dashboard_key,
      reportName: dashboard.name,
      targetType: 'dashboard',
      targetId: dashboard.id,
      runMode: 'manual',
      triggeredBy: req.user.userId || null,
      filters: req.body?.filters || {},
      timezoneName: req.body?.timezone_name || null,
      rowCount: payload.csv_rows.length,
      durationMs: Date.now() - startedAt,
      status: 'success',
    }).catch(() => {});
    await flagAnomaliesForRun({ orgId: req.user.orgId, runId, targetType: 'dashboard', targetId: dashboard.id, rowCount: payload.csv_rows.length, status: 'success' });
    return res.json(payload);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to run dashboard.' });
  }
});

router.post('/reports/module/dashboards/:id/duplicate', authenticate, requireReportManager, async (req, res) => {
  try {
    const dashboard = await duplicateDashboard(req.user.orgId, req.user.userId, Number(req.params.id));
    await recordUsageEvent(req.user.orgId, req.user.userId, 'duplicate', 'dashboard', dashboard.id, { source_id: Number(req.params.id) }).catch(() => {});
    return res.status(201).json(dashboard);
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    return res.status(status).json({ error: err.message || 'Failed to duplicate dashboard.' });
  }
});

router.get('/reports/module/dashboards/:id/versions', authenticate, async (req, res) => {
  try {
    const versions = await listEntityVersions(req.user.orgId, 'dashboard', Number(req.params.id));
    return res.json({ versions });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load dashboard versions.' });
  }
});

router.post('/reports/module/dashboards/:id/publish', authenticate, requireReportManager, async (req, res) => {
  try {
    const dashboard = await publishDashboard(req.user.orgId, req.user.userId, Number(req.params.id));
    return res.json(dashboard);
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    return res.status(status).json({ error: err.message || 'Failed to publish dashboard.' });
  }
});

router.post('/reports/module/dashboards/:id/templates', authenticate, requireReportManager, async (req, res) => {
  try {
    const template = await createDashboardTemplate(req.user.orgId, req.user.userId, Number(req.params.id), req.body || {});
    return res.status(201).json(template);
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    return res.status(status).json({ error: err.message || 'Failed to create dashboard template.' });
  }
});

router.get('/reports/module/dashboard-templates', authenticate, async (req, res) => {
  try {
    const templates = await listDashboardTemplates(req.user.orgId);
    return res.json({ templates });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load dashboard templates.' });
  }
});

router.post('/reports/module/dashboard-templates/:id/create-dashboard', authenticate, requireReportManager, async (req, res) => {
  try {
    const dashboard = await createDashboardFromTemplate(req.user.orgId, req.user.userId, Number(req.params.id), req.body || {});
    return res.status(201).json(dashboard);
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    return res.status(status).json({ error: err.message || 'Failed to create dashboard from template.' });
  }
});

router.get('/reports/module/schedules', authenticate, async (req, res) => {
  try {
    const schedules = await getExportConfigs(req.user.orgId);
    return res.json({ schedules });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load schedules.' });
  }
});

router.post('/reports/module/schedules', authenticate, requireReportManager, async (req, res) => {
  try {
    const id = await createExportConfig(req.user.orgId, req.user.userId, req.body || {});
    const schedules = await getExportConfigs(req.user.orgId);
    return res.status(201).json({ id, schedule: schedules.find((item) => Number(item.id) === Number(id)) || null });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message || 'Failed to create schedule.' });
  }
});

router.put('/reports/module/schedules/:id', authenticate, requireReportManager, async (req, res) => {
  try {
    await updateExportConfig(Number(req.params.id), req.user.orgId, req.body || {});
    const schedules = await getExportConfigs(req.user.orgId);
    return res.json({ ok: true, schedule: schedules.find((item) => Number(item.id) === Number(req.params.id)) || null });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message || 'Failed to update schedule.' });
  }
});

router.delete('/reports/module/schedules/:id', authenticate, requireReportManager, async (req, res) => {
  try {
    await deleteExportConfig(Number(req.params.id), req.user.orgId);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message || 'Failed to delete schedule.' });
  }
});

router.post('/reports/module/schedules/:id/pause', authenticate, requireReportManager, async (req, res) => {
  try {
    await pauseExportConfig(Number(req.params.id), req.user.orgId, req.user.userId);
    const schedules = await getExportConfigs(req.user.orgId);
    return res.json({ ok: true, schedule: schedules.find((item) => Number(item.id) === Number(req.params.id)) || null });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message || 'Failed to pause schedule.' });
  }
});

router.post('/reports/module/schedules/:id/resume', authenticate, requireReportManager, async (req, res) => {
  try {
    await resumeExportConfig(Number(req.params.id), req.user.orgId);
    const schedules = await getExportConfigs(req.user.orgId);
    return res.json({ ok: true, schedule: schedules.find((item) => Number(item.id) === Number(req.params.id)) || null });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message || 'Failed to resume schedule.' });
  }
});

router.get('/reports/module/history/:id', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT r.*, u.name AS triggered_by_name
       FROM report_run_ledger r
       LEFT JOIN users u ON u.id = r.triggered_by
       WHERE r.id = ? AND r.org_id = ?
       LIMIT 1`,
      [req.params.id, req.user.orgId]
    );
    const run = rows[0];
    if (!run) return res.status(404).json({ error: 'Run not found.' });
    return res.json({
      ...run,
      filters: parseMaybeJson(run.filters_json, {}),
      diagnostics: parseMaybeJson(run.diagnostics_json, {}),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load run detail.' });
  }
});

router.post('/reports/module/history/:id/retry', authenticate, requireReportManager, async (req, res) => {
  const startedAt = Date.now();
  let run = null;
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM report_run_ledger WHERE id = ? AND org_id = ? LIMIT 1',
      [req.params.id, req.user.orgId]
    );
    run = rows[0];
    if (!run) return res.status(404).json({ error: 'Run not found.' });
    const filters = parseMaybeJson(run.filters_json, {});
    let result;
    if (run.target_type === 'dashboard') {
      const dashboard = await getDashboardById(req.user.orgId, Number(run.target_id));
      if (!dashboard) throw new Error('Dashboard target no longer exists.');
      result = await runDashboard(dashboard, req.user.orgId, filters);
      await recordReportRun({
        orgId: req.user.orgId,
        reportKey: dashboard.dashboard_key,
        reportName: dashboard.name,
        targetType: 'dashboard',
        targetId: dashboard.id,
        runMode: 'retry',
        retryOfRunId: run.id,
        triggeredBy: req.user.userId || null,
        filters,
        rowCount: result.csv_rows.length,
        durationMs: Date.now() - startedAt,
        status: 'success',
      });
      return res.json({ ok: true, result });
    }
    const definition = await getReportDefinitionById(req.user.orgId, Number(run.target_id));
    if (!definition) throw new Error('Report target no longer exists.');
    result = await runReportDefinition(definition, req.user.orgId, filters);
    await recordReportRun({
      orgId: req.user.orgId,
      reportKey: definition.report_key,
      reportName: definition.name,
      targetType: 'report',
      targetId: definition.id,
      runMode: 'retry',
      retryOfRunId: run.id,
      triggeredBy: req.user.userId || null,
      filters,
      rowCount: result.row_count,
      durationMs: Date.now() - startedAt,
      status: 'success',
    });
    return res.json({ ok: true, result });
  } catch (err) {
    if (run) {
      await recordReportRun({
        orgId: req.user.orgId,
        reportKey: run.report_key,
        reportName: run.report_name,
        targetType: run.target_type || 'report',
        targetId: run.target_id || null,
        runMode: 'retry',
        retryOfRunId: run.id,
        triggeredBy: req.user.userId || null,
        filters: parseMaybeJson(run.filters_json, {}),
        rowCount: 0,
        durationMs: Date.now() - startedAt,
        status: 'failed',
        errorMessage: err.message,
        diagnostics: { retry_failed: true },
      }).catch(() => {});
    }
    return res.status(400).json({ error: err.message || 'Failed to retry run.' });
  }
});

router.get('/reports/module/history', authenticate, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
    const targetType = String(req.query.target_type || '').trim();
    const status = String(req.query.status || '').trim();
    const filters = ['r.org_id = ?'];
    const values = [req.user.orgId];
    if (targetType) {
      filters.push('r.target_type = ?');
      values.push(targetType);
    }
    if (status) {
      filters.push('r.status = ?');
      values.push(status);
    }
    const [rows] = await pool.execute(
      `SELECT r.id, r.report_key, r.report_name, r.target_type, r.target_id, r.run_mode, r.retry_of_run_id,
              r.timezone_name, r.row_count, r.duration_ms, r.delivery_method, r.delivery_target, r.status,
              r.error_message, r.created_at, r.triggered_by, u.name AS triggered_by_name
       FROM report_run_ledger r
       LEFT JOIN users u ON u.id = r.triggered_by
       WHERE ${filters.join(' AND ')}
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT ${limit}`,
      values
    );
    return res.json({ runs: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load run history.' });
  }
});

router.get('/reports/module/favorites', authenticate, async (req, res) => {
  try {
    const favorites = await listFavorites(req.user.orgId, req.user.userId);
    return res.json({ favorites });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load favorites.' });
  }
});

router.post('/reports/module/favorites', authenticate, async (req, res) => {
  try {
    const favorites = await addFavorite(req.user.orgId, req.user.userId, req.body?.target_type, req.body?.target_id);
    await recordUsageEvent(req.user.orgId, req.user.userId, 'favorite', req.body?.target_type || 'report', Number(req.body?.target_id || 0), {}).catch(() => {});
    return res.status(201).json({ favorites });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to save favorite.' });
  }
});

router.delete('/reports/module/favorites', authenticate, async (req, res) => {
  try {
    const favorites = await deleteFavorite(req.user.orgId, req.user.userId, req.body?.target_type, req.body?.target_id);
    return res.json({ favorites });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to remove favorite.' });
  }
});

router.get('/reports/module/dashboard-shares', authenticate, requireReportManager, async (req, res) => {
  try {
    const shares = await listDashboardShares(req.user.orgId, req.query.dashboard_id || null);
    return res.json({ shares });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load dashboard shares.' });
  }
});

router.post('/reports/module/dashboard-shares', authenticate, requireReportManager, async (req, res) => {
  try {
    const shares = await addDashboardShare(req.user.orgId, req.user.userId, req.body || {});
    return res.status(201).json({ shares });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to save dashboard share.' });
  }
});

router.delete('/reports/module/dashboard-shares/:id', authenticate, requireReportManager, async (req, res) => {
  try {
    await deleteDashboardShare(req.user.orgId, Number(req.params.id));
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to remove dashboard share.' });
  }
});

router.get('/reports/module/role-default-dashboards', authenticate, requireReportManager, async (req, res) => {
  try {
    const defaults = await getRoleDefaultDashboards(req.user.orgId);
    return res.json({ defaults });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load role default dashboards.' });
  }
});

router.post('/reports/module/role-default-dashboards', authenticate, requireReportManager, async (req, res) => {
  try {
    const defaults = await setRoleDefaultDashboard(req.user.orgId, req.user.userId, req.body?.role_key, Number(req.body?.dashboard_id));
    return res.status(201).json({ defaults });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to save role default dashboard.' });
  }
});

router.get('/reports/module/config/validate', authenticate, requireReportManager, async (req, res) => {
  try {
    const result = await validateReportConfig(req.user.orgId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to validate report configuration.' });
  }
});

router.get('/reports/module/usage-analytics', authenticate, requireReportManager, async (req, res) => {
  try {
    const analytics = await listUsageAnalytics(req.user.orgId);
    return res.json({ analytics });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load usage analytics.' });
  }
});

router.get('/reports/module/recommendations', authenticate, requireReportManager, async (req, res) => {
  try {
    const recommendations = await listRecommendations(req.user.orgId);
    return res.json({ recommendations });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load report recommendations.' });
  }
});

router.get('/reports/module/anomalies', authenticate, requireReportManager, async (req, res) => {
  try {
    const [flags] = await pool.execute(
      `SELECT * FROM report_anomaly_flags
       WHERE org_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 100`,
      [req.user.orgId]
    );
    return res.json({ flags });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load anomaly flags.' });
  }
});

router.get('/reports/module/delivery-rules', authenticate, requireReportManager, async (req, res) => {
  try {
    const [rules] = await pool.execute(
      'SELECT * FROM report_delivery_rules WHERE org_id = ? ORDER BY is_active DESC, rule_name ASC',
      [req.user.orgId]
    );
    return res.json({ rules: rules.map((rule) => ({ ...rule, allowed_domains: parseMaybeJson(rule.allowed_domains, []), blocked_domains: parseMaybeJson(rule.blocked_domains, []) })) });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load delivery rules.' });
  }
});

router.post('/reports/module/delivery-rules', authenticate, requireReportManager, async (req, res) => {
  try {
    const ruleName = String(req.body?.rule_name || '').trim();
    if (!ruleName) return res.status(400).json({ error: 'rule_name is required.' });
    const [result] = await pool.execute(
      `INSERT INTO report_delivery_rules
         (org_id, rule_name, sensitivity_level, allowed_domains, blocked_domains, max_frequency, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.orgId,
        ruleName,
        String(req.body?.sensitivity_level || 'standard').toLowerCase(),
        JSON.stringify(Array.isArray(req.body?.allowed_domains) ? req.body.allowed_domains : []),
        JSON.stringify(Array.isArray(req.body?.blocked_domains) ? req.body.blocked_domains : []),
        req.body?.max_frequency || null,
        req.body?.is_active === false ? 0 : 1,
        req.user.userId || null,
      ]
    );
    return res.status(201).json({ id: result.insertId });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to save delivery rule.' });
  }
});

router.delete('/reports/module/delivery-rules/:id', authenticate, requireReportManager, async (req, res) => {
  try {
    await pool.execute('DELETE FROM report_delivery_rules WHERE id = ? AND org_id = ?', [req.params.id, req.user.orgId]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to delete delivery rule.' });
  }
});

router.get('/reports/module/config', authenticate, requireReportManager, async (req, res) => {
  try {
    const config = await getModuleConfig(req.user.orgId);
    return res.json(config);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load report module config.' });
  }
});

router.put('/reports/module/config', authenticate, requireReportManager, async (req, res) => {
  try {
    const config = await saveModuleConfig(req.user.orgId, req.user.userId, req.body || {});
    return res.json(config);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to save report module config.' });
  }
});

module.exports = router;
