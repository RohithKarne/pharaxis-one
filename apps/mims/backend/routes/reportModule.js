'use strict';

const express = require('express');
const pool = require('../database/db');
const { authenticate, requireModule } = require('../middleware/auth');
const {
  getDatasetCatalog,
  listReportDefinitions,
  getReportDefinitionById,
  createReportDefinition,
  updateReportDefinition,
  deleteReportDefinition,
  duplicateReportDefinition,
  previewDataset,
  runReportDefinition,
  listDashboards,
  getDashboardById,
  createDashboard,
  updateDashboard,
  deleteDashboard,
  duplicateDashboard,
  listFavorites,
  addFavorite,
  deleteFavorite,
  runDashboard,
  getModuleConfig,
  saveModuleConfig,
  getFilterOptions,
  canSeeAudience,
} = require('../services/reportModuleService');
const { buildReportCsv } = require('../services/reportCsv');
const { recipientsFor } = require('../services/reportRecipients');
const {
  getExportConfigs,
  createExportConfig,
  updateExportConfig,
  pauseExportConfig,
  resumeExportConfig,
  deleteExportConfig,
} = require('../services/scheduledExportService');
const { recordReportRun } = require('../services/reportOpsService');
const { hasGlobalAdminScope, isAdminUser } = require('../utils/adminScope');
const { userHasActivityPrivilege } = require('../services/accessConfigurationService');
const { logAudit } = require('../utils/auditLog');

const router = express.Router();
// Every /reports/* call needs the admin's Reports grant, as the screen does (T11 / M-69).
router.use('/reports', authenticate, requireModule('reports'));

// What this user may do in Reports, worked out once per request. Export and
// Schedule were privileges nobody checked: export ran in the browser for anyone,
// and Schedules was gated by the admin role on screen and by Manage Reports on
// the server (reports review RS5, RS8).
async function viewerOf(req) {
  if (!req.reportViewer) {
    const global = hasGlobalAdminScope(req.user);
    req.reportViewer = {
      admin: global || isAdminUser(req.user),
      manage: global || await userHasActivityPrivilege(req.user, 'reports.manage'),
      export: global || await userHasActivityPrivilege(req.user, 'reports.export'),
      schedule: global || await userHasActivityPrivilege(req.user, 'reports.schedule'),
    };
  }
  return req.reportViewer;
}

// A report or dashboard outside the user's audience reads as not found.
async function visibleDefinition(req, id) {
  const definition = await getReportDefinitionById(req.user.orgId, Number(id));
  if (!definition || !canSeeAudience(await viewerOf(req), definition.visibility_scope)) return null;
  return definition;
}

async function visibleDashboard(req, id) {
  const dashboard = await getDashboardById(req.user.orgId, Number(id));
  if (!dashboard || !canSeeAudience(await viewerOf(req), dashboard.visibility_scope)) return null;
  return dashboard;
}

async function requireReportScheduler(req, res, next) {
  try {
    if ((await viewerOf(req)).schedule) return next();
    return res.status(403).json({ error: 'You do not have permission to schedule reports.' });
  } catch (err) {
    console.error('requireReportScheduler failed:', err);
    return res.status(500).json({ error: 'Permission check failed.' });
  }
}

// A schedule may only deliver a report or dashboard its author can see.
async function checkScheduleTarget(req) {
  const body = req.body || {};
  if (!body.target_id) return null;
  const visible = String(body.target_type || 'report') === 'dashboard'
    ? await visibleDashboard(req, body.target_id)
    : await visibleDefinition(req, body.target_id);
  return visible ? null : 'Choose a report you can see.';
}

function parseMaybeJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

async function requireReportManager(req, res, next) {
  try {
    if ((await viewerOf(req)).manage) return next();
    return res.status(403).json({ error: 'You do not have permission to manage reports.' });
  } catch (err) {
    console.error('requireReportManager failed:', err);
    return res.status(500).json({ error: 'Permission check failed.' });
  }
}

router.get('/reports/module/filter-options', authenticate, async (req, res) => {
  try {
    return res.json(await getFilterOptions(req.user.orgId));
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load filter options.' });
  }
});

router.get('/reports/module/datasets', authenticate, (_req, res) => {
  return res.json({ datasets: getDatasetCatalog() });
});

router.post('/reports/module/datasets/:datasetKey/preview', authenticate, requireReportManager, async (req, res) => {
  try {
    const result = await previewDataset(req.params.datasetKey, req.user.orgId, req.body?.filters || {}, { user: req.user });
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to preview dataset.' });
  }
});

router.get('/reports/module/definitions', authenticate, async (req, res) => {
  try {
    const viewer = await viewerOf(req);
    const definitions = await listReportDefinitions(req.user.orgId, {
      includeInactive: viewer.manage,
      productGroupId: req.query.product_group_id || null,
    });
    return res.json({ definitions: definitions.filter((item) => canSeeAudience(viewer, item.visibility_scope)) });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load report definitions.' });
  }
});

router.post('/reports/module/definitions', authenticate, requireReportManager, async (req, res) => {
  try {
    const definition = await createReportDefinition(req.user.orgId, req.user.userId, req.body || {});
    await logAudit(req.user.userId, req.user.email, 'CREATE', 'report_definition', definition.id, { name: definition.name }, null, definition);
    return res.status(201).json(definition);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to create report definition.' });
  }
});

router.put('/reports/module/definitions/:id', authenticate, requireReportManager, async (req, res) => {
  try {
    const before = await getReportDefinitionById(req.user.orgId, Number(req.params.id));
    const definition = await updateReportDefinition(req.user.orgId, req.user.userId, Number(req.params.id), req.body || {});
    await logAudit(req.user.userId, req.user.email, 'UPDATE', 'report_definition', definition.id, { name: definition.name }, before, definition);
    return res.json(definition);
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    return res.status(status).json({ error: err.message || 'Failed to update report definition.' });
  }
});

router.delete('/reports/module/definitions/:id', authenticate, requireReportManager, async (req, res) => {
  try {
    const deleted = await deleteReportDefinition(req.user.orgId, Number(req.params.id));
    await logAudit(req.user.userId, req.user.email, 'DELETE', 'report_definition', deleted.id, { name: deleted.name }, deleted, null);
    return res.json({ ok: true, deleted });
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    return res.status(status).json({ error: err.message || 'Failed to delete report definition.' });
  }
});

// A failed run is recorded too: it was only answered with a 400, so Run
// History and its failed filter never showed it (reports review RL7).
function recordFailedRun(req, target, targetType, startedAt, err) {
  return recordReportRun({
    orgId: req.user.orgId,
    reportKey: target.report_key || target.dashboard_key,
    reportName: target.name,
    targetType,
    targetId: target.id,
    runMode: 'manual',
    triggeredBy: req.user.userId || null,
    filters: req.body?.filters || {},
    rowCount: 0,
    durationMs: Date.now() - startedAt,
    status: 'failed',
    errorMessage: err.message,
  }).catch(() => {});
}

router.post('/reports/module/definitions/:id/run', authenticate, async (req, res) => {
  const startedAt = Date.now();
  let definition = null;
  try {
    definition = await visibleDefinition(req, req.params.id);
    if (!definition) return res.status(404).json({ error: 'Report definition not found.' });
    const result = await runReportDefinition(definition, req.user.orgId, req.body?.filters || {}, { user: req.user });
    await recordReportRun({
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
    return res.json(result);
  } catch (err) {
    if (definition) await recordFailedRun(req, definition, 'report', startedAt, err);
    return res.status(400).json({ error: err.message || 'Failed to run report definition.' });
  }
});

// Export runs on the server: it checks Export Reports, writes a CSV with
// readable headers and no formula cells, and leaves an audit row and a run.
router.post('/reports/module/definitions/:id/export', authenticate, async (req, res) => {
  const startedAt = Date.now();
  try {
    if (!(await viewerOf(req)).export) return res.status(403).json({ error: 'You do not have permission to export reports.' });
    const definition = await visibleDefinition(req, req.params.id);
    if (!definition) return res.status(404).json({ error: 'Report definition not found.' });
    const result = await runReportDefinition(definition, req.user.orgId, req.body?.filters || {}, { user: req.user });
    const csv = buildReportCsv(result.columns, result.rows);
    await logAudit(req.user.userId, req.user.email, 'EXPORT', 'report_definition', definition.id, { name: definition.name, filters: result.filters, row_count: result.row_count });
    await recordReportRun({
      orgId: req.user.orgId,
      reportKey: definition.report_key,
      reportName: definition.name,
      targetType: 'report',
      targetId: definition.id,
      runMode: 'export',
      triggeredBy: req.user.userId || null,
      filters: result.filters,
      rowCount: result.row_count,
      durationMs: Date.now() - startedAt,
      deliveryMethod: 'download',
      status: 'success',
    }).catch(() => {});
    const fileName = `${definition.report_key}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(`\uFEFF${csv}`);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to export report.' });
  }
});

router.post('/reports/module/definitions/:id/duplicate', authenticate, requireReportManager, async (req, res) => {
  try {
    if (!await visibleDefinition(req, req.params.id)) return res.status(404).json({ error: 'Report definition not found.' });
    const definition = await duplicateReportDefinition(req.user.orgId, req.user.userId, Number(req.params.id));
    await logAudit(req.user.userId, req.user.email, 'CREATE', 'report_definition', definition.id, { name: definition.name, copied_from: Number(req.params.id) }, null, definition);
    return res.status(201).json(definition);
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    return res.status(status).json({ error: err.message || 'Failed to duplicate report definition.' });
  }
});

router.get('/reports/module/dashboards', authenticate, async (req, res) => {
  try {
    const viewer = await viewerOf(req);
    const dashboards = await listDashboards(req.user.orgId, {
      includeInactive: viewer.manage,
    });
    return res.json({ dashboards: dashboards.filter((item) => canSeeAudience(viewer, item.visibility_scope)) });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load dashboards.' });
  }
});

router.post('/reports/module/dashboards', authenticate, requireReportManager, async (req, res) => {
  try {
    const dashboard = await createDashboard(req.user.orgId, req.user.userId, req.body || {});
    await logAudit(req.user.userId, req.user.email, 'CREATE', 'report_dashboard', dashboard.id, { name: dashboard.name }, null, dashboard);
    return res.status(201).json(dashboard);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to create dashboard.' });
  }
});

router.put('/reports/module/dashboards/:id', authenticate, requireReportManager, async (req, res) => {
  try {
    const before = await getDashboardById(req.user.orgId, Number(req.params.id));
    const dashboard = await updateDashboard(req.user.orgId, req.user.userId, Number(req.params.id), req.body || {});
    await logAudit(req.user.userId, req.user.email, 'UPDATE', 'report_dashboard', dashboard.id, { name: dashboard.name }, before, dashboard);
    return res.json(dashboard);
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    return res.status(status).json({ error: err.message || 'Failed to update dashboard.' });
  }
});

router.delete('/reports/module/dashboards/:id', authenticate, requireReportManager, async (req, res) => {
  try {
    const deleted = await deleteDashboard(req.user.orgId, Number(req.params.id));
    await logAudit(req.user.userId, req.user.email, 'DELETE', 'report_dashboard', deleted.id, { name: deleted.name }, deleted, null);
    return res.json({ ok: true, deleted });
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    return res.status(status).json({ error: err.message || 'Failed to delete dashboard.' });
  }
});

router.post('/reports/module/dashboards/:id/run', authenticate, async (req, res) => {
  const startedAt = Date.now();
  let dashboard = null;
  try {
    dashboard = await visibleDashboard(req, req.params.id);
    if (!dashboard) return res.status(404).json({ error: 'Dashboard not found.' });
    const payload = await runDashboard(dashboard, req.user.orgId, req.body?.filters || {}, await viewerOf(req), { user: req.user });
    await recordReportRun({
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
    return res.json(payload);
  } catch (err) {
    if (dashboard) await recordFailedRun(req, dashboard, 'dashboard', startedAt, err);
    return res.status(400).json({ error: err.message || 'Failed to run dashboard.' });
  }
});

router.post('/reports/module/dashboards/:id/duplicate', authenticate, requireReportManager, async (req, res) => {
  try {
    if (!await visibleDashboard(req, req.params.id)) return res.status(404).json({ error: 'Dashboard not found.' });
    const dashboard = await duplicateDashboard(req.user.orgId, req.user.userId, Number(req.params.id));
    await logAudit(req.user.userId, req.user.email, 'CREATE', 'report_dashboard', dashboard.id, { name: dashboard.name, copied_from: Number(req.params.id) }, null, dashboard);
    return res.status(201).json(dashboard);
  } catch (err) {
    const status = /not found/i.test(err.message) ? 404 : 400;
    return res.status(status).json({ error: err.message || 'Failed to duplicate dashboard.' });
  }
});

// Who a schedule for this report or dashboard may be emailed to.
router.get('/reports/module/recipients', authenticate, requireReportScheduler, async (req, res) => {
  try {
    const target = String(req.query.target_type || 'report') === 'dashboard'
      ? await visibleDashboard(req, req.query.target_id)
      : await visibleDefinition(req, req.query.target_id);
    if (!target) return res.json({ recipients: [] });
    return res.json({ recipients: await recipientsFor(req.user.orgId, target.visibility_scope) });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load recipients.' });
  }
});

router.get('/reports/module/schedules', authenticate, requireReportScheduler, async (req, res) => {
  try {
    const schedules = await getExportConfigs(req.user.orgId);
    return res.json({ schedules });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load schedules.' });
  }
});

router.post('/reports/module/schedules', authenticate, requireReportScheduler, async (req, res) => {
  try {
    const targetError = await checkScheduleTarget(req);
    if (targetError) return res.status(400).json({ error: targetError });
    const id = await createExportConfig(req.user.orgId, req.user.userId, req.body || {});
    const schedules = await getExportConfigs(req.user.orgId);
    return res.status(201).json({ id, schedule: schedules.find((item) => Number(item.id) === Number(id)) || null });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message || 'Failed to create schedule.' });
  }
});

router.put('/reports/module/schedules/:id', authenticate, requireReportScheduler, async (req, res) => {
  try {
    const targetError = await checkScheduleTarget(req);
    if (targetError) return res.status(400).json({ error: targetError });
    await updateExportConfig(Number(req.params.id), req.user.orgId, req.body || {});
    const schedules = await getExportConfigs(req.user.orgId);
    return res.json({ ok: true, schedule: schedules.find((item) => Number(item.id) === Number(req.params.id)) || null });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message || 'Failed to update schedule.' });
  }
});

router.delete('/reports/module/schedules/:id', authenticate, requireReportScheduler, async (req, res) => {
  try {
    await deleteExportConfig(Number(req.params.id), req.user.orgId);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message || 'Failed to delete schedule.' });
  }
});

router.post('/reports/module/schedules/:id/pause', authenticate, requireReportScheduler, async (req, res) => {
  try {
    await pauseExportConfig(Number(req.params.id), req.user.orgId, req.user.userId);
    const schedules = await getExportConfigs(req.user.orgId);
    return res.json({ ok: true, schedule: schedules.find((item) => Number(item.id) === Number(req.params.id)) || null });
  } catch (err) {
    return res.status(err.statusCode || 400).json({ error: err.message || 'Failed to pause schedule.' });
  }
});

router.post('/reports/module/schedules/:id/resume', authenticate, requireReportScheduler, async (req, res) => {
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
      const dashboard = await visibleDashboard(req, run.target_id);
      if (!dashboard) throw new Error('Dashboard target no longer exists.');
      result = await runDashboard(dashboard, req.user.orgId, filters, await viewerOf(req), { user: req.user });
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
    const definition = await visibleDefinition(req, run.target_id);
    if (!definition) throw new Error('Report target no longer exists.');
    result = await runReportDefinition(definition, req.user.orgId, filters, { user: req.user });
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
    const viewer = await viewerOf(req);
    const hidden = new Set();
    for (const item of await listReportDefinitions(req.user.orgId, { includeInactive: true })) {
      if (!canSeeAudience(viewer, item.visibility_scope)) hidden.add(`report:${item.id}`);
    }
    for (const item of await listDashboards(req.user.orgId, { includeInactive: true })) {
      if (!canSeeAudience(viewer, item.visibility_scope)) hidden.add(`dashboard:${item.id}`);
    }
    return res.json({ runs: rows.filter((run) => !hidden.has(`${run.target_type || 'report'}:${run.target_id}`)) });
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
