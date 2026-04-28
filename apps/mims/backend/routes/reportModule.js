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
  previewDataset,
  runReportDefinition,
  listDashboards,
  getDashboardById,
  createDashboard,
  updateDashboard,
  deleteDashboard,
  runDashboard,
  getModuleConfig,
  saveModuleConfig,
  getModuleSummary,
} = require('../services/reportModuleService');
const {
  getExportConfigs,
  createExportConfig,
  updateExportConfig,
  deleteExportConfig,
} = require('../services/scheduledExportService');
const { recordReportRun } = require('../services/reportOpsService');

const router = express.Router();

function canManageReports(req) {
  return req.user?.role === 'admin' || req.user?.role === 'superadmin';
}

function requireReportManager(req, res, next) {
  if (!canManageReports(req)) {
    return res.status(403).json({ error: 'Admin or SuperAdmin access required.' });
  }
  return next();
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
      includeInactive: canManageReports(req),
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
  try {
    const definition = await getReportDefinitionById(req.user.orgId, Number(req.params.id));
    if (!definition) return res.status(404).json({ error: 'Report definition not found.' });
    const result = await runReportDefinition(definition, req.user.orgId, req.body?.filters || {});
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
      status: 'success',
    }).catch(() => {});
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to run report definition.' });
  }
});

router.get('/reports/module/dashboards', authenticate, async (req, res) => {
  try {
    const dashboards = await listDashboards(req.user.orgId, {
      includeInactive: canManageReports(req),
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
  try {
    const dashboard = await getDashboardById(req.user.orgId, Number(req.params.id));
    if (!dashboard) return res.status(404).json({ error: 'Dashboard not found.' });
    const payload = await runDashboard(dashboard, req.user.orgId, req.body?.filters || {});
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
      status: 'success',
    }).catch(() => {});
    return res.json(payload);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Failed to run dashboard.' });
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

router.get('/reports/module/history', authenticate, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 50)));
    const targetType = String(req.query.target_type || '').trim();
    const status = String(req.query.status || '').trim();
    const filters = ['org_id = ?'];
    const values = [req.user.orgId];
    if (targetType) {
      filters.push('target_type = ?');
      values.push(targetType);
    }
    if (status) {
      filters.push('status = ?');
      values.push(status);
    }
    const [rows] = await pool.execute(
      `SELECT id, report_key, report_name, target_type, target_id, run_mode, timezone_name, row_count,
              delivery_method, delivery_target, status, error_message, created_at, triggered_by
       FROM report_run_ledger
       WHERE ${filters.join(' AND ')}
       ORDER BY created_at DESC, id DESC
       LIMIT ${limit}`,
      values
    );
    return res.json({ runs: rows });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to load run history.' });
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
