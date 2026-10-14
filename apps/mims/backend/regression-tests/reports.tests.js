'use strict';

const pool = require('../database/db');
const { uniqueName } = require('./helpers');

async function getFirstDefinition(makeRequest, token) {
  const res = await makeRequest('GET', '/api/reports/module/definitions', null, token);
  const definitions = Array.isArray(res.body?.definitions) ? res.body.definitions : [];
  return definitions[0] || null;
}

async function getFirstDashboard(makeRequest, token) {
  const res = await makeRequest('GET', '/api/reports/module/dashboards', null, token);
  const dashboards = Array.isArray(res.body?.dashboards) ? res.body.dashboards : [];
  return dashboards[0] || null;
}

async function cleanupReportDefinition(id) {
  if (!id) return;
  await pool.execute("DELETE FROM report_entity_versions WHERE entity_type = 'report' AND entity_id = ?", [id]).catch(() => {});
  await pool.execute("DELETE FROM report_favorites WHERE target_type = 'report' AND target_id = ?", [id]).catch(() => {});
  await pool.execute('DELETE FROM report_definitions WHERE id = ?', [id]).catch(() => {});
}

async function cleanupDashboard(id) {
  if (!id) return;
  await pool.execute("DELETE FROM report_entity_versions WHERE entity_type = 'dashboard' AND entity_id = ?", [id]).catch(() => {});
  await pool.execute("DELETE FROM report_favorites WHERE target_type = 'dashboard' AND target_id = ?", [id]).catch(() => {});
  await pool.execute('DELETE FROM report_role_default_dashboards WHERE dashboard_id = ?', [id]).catch(() => {});
  await pool.execute('DELETE FROM report_dashboards WHERE id = ?', [id]).catch(() => {});
}

async function cleanupSchedule(id) {
  if (!id) return;
  await pool.execute('DELETE FROM scheduled_export_configs WHERE id = ?', [id]).catch(() => {});
}

module.exports = [
  {
    name: 'Report module filter options datasets history and config load',
    module: 'Reports',
    covers: [
      'GET /api/reports/module/filter-options',
      'GET /api/reports/module/datasets',
      'GET /api/reports/module/history',
      'GET /api/reports/module/config',
    ],
    run: async ({ makeRequest, token }) => {
      const checks = [
        ['/api/reports/module/filter-options', (body) => Array.isArray(body?.periods) && Array.isArray(body?.owners)],
        ['/api/reports/module/datasets', (body) => Array.isArray(body?.datasets)],
        ['/api/reports/module/history', (body) => Array.isArray(body?.runs)],
        ['/api/reports/module/config', (body) => typeof body?.default_timezone === 'string'],
      ];
      for (const [path, validate] of checks) {
        const res = await makeRequest('GET', path, null, token);
        if (res.status !== 200 || !validate(res.body)) {
          return { pass: false, details: `${path} status=${res.status}` };
        }
      }
      return { pass: true, details: `checked=${checks.length}` };
    },
  },
  {
    name: 'Report module config updates and restores',
    module: 'Reports',
    covers: ['PUT /api/reports/module/config'],
    run: async ({ makeRequest, token }) => {
      const current = await makeRequest('GET', '/api/reports/module/config', null, token);
      if (current.status !== 200) {
        return { pass: false, details: `load status=${current.status}` };
      }

      const original = current.body;
      const updatedPayload = {
        ...original,
        default_timezone: 'UTC',
        default_delivery_method: 'in_app',
        email_from_name: 'Regression Reports',
        scheduler_enabled: Number(original.scheduler_enabled || 0) ? 0 : 1,
        digest_subject_prefix: '[Regression Reports]',
      };

      const update = await makeRequest('PUT', '/api/reports/module/config', updatedPayload, token);
      const restore = await makeRequest('PUT', '/api/reports/module/config', original, token);

      return {
        pass: update.status === 200 && restore.status === 200,
        details: `update=${update.status}, restore=${restore.status}`,
      };
    },
  },
  {
    name: 'Report module definition CRUD preview and run lifecycle',
    module: 'Reports',
    covers: [
      'GET /api/reports/module/definitions',
      'POST /api/reports/module/datasets/:datasetKey/preview',
      'POST /api/reports/module/definitions',
      'PUT /api/reports/module/definitions/:id',
      'POST /api/reports/module/definitions/:id/run',
      'DELETE /api/reports/module/definitions/:id',
    ],
    run: async ({ makeRequest, token }) => {
      let createdId = null;
      try {
        const list = await makeRequest('GET', '/api/reports/module/definitions', null, token);
        if (list.status !== 200 || !Array.isArray(list.body?.definitions)) {
          return { pass: false, details: `list status=${list.status}` };
        }

        const preview = await makeRequest('POST', '/api/reports/module/datasets/daily-case-summary/preview', {
          filters: {},
        }, token);
        if (preview.status !== 200 || !Array.isArray(preview.body?.rows)) {
          return { pass: false, details: `preview status=${preview.status}` };
        }

        const create = await makeRequest('POST', '/api/reports/module/definitions', {
          dataset_key: 'daily-case-summary',
          name: uniqueName('Regression Report Definition'),
          description: 'Regression-created report definition',
          default_filters: {},
          selected_columns: [],
          visibility_scope: 'shared',
          is_active: true,
        }, token);
        createdId = Number(create.body?.id || 0);
        if (create.status !== 201 || !createdId) {
          return { pass: false, details: `create status=${create.status}` };
        }

        const update = await makeRequest('PUT', `/api/reports/module/definitions/${createdId}`, {
          name: `${create.body.name}-edited`,
          description: 'Updated regression definition',
          selected_columns: [],
          default_filters: { date_from: '2026-04-01' },
          visibility_scope: 'private',
          is_active: true,
        }, token);
        if (update.status !== 200) {
          return { pass: false, details: `update status=${update.status}` };
        }

        const run = await makeRequest('POST', `/api/reports/module/definitions/${createdId}/run`, {
          filters: {},
          timezone_name: 'UTC',
        }, token);
        if (run.status !== 200 || !Array.isArray(run.body?.rows)) {
          return { pass: false, details: `run status=${run.status}` };
        }

        const del = await makeRequest('DELETE', `/api/reports/module/definitions/${createdId}`, null, token);
        createdId = null;
        return {
          pass: del.status === 200 && del.body?.ok === true,
          details: `create=${create.status}, update=${update.status}, run=${run.status}, delete=${del.status}`,
        };
      } finally {
        await cleanupReportDefinition(createdId);
      }
    },
  },
  {
    name: 'Report module dashboard CRUD and run lifecycle',
    module: 'Reports',
    covers: [
      'GET /api/reports/module/dashboards',
      'POST /api/reports/module/dashboards',
      'PUT /api/reports/module/dashboards/:id',
      'POST /api/reports/module/dashboards/:id/run',
      'DELETE /api/reports/module/dashboards/:id',
    ],
    run: async ({ makeRequest, token }) => {
      let createdId = null;
      try {
        const list = await makeRequest('GET', '/api/reports/module/dashboards', null, token);
        if (list.status !== 200 || !Array.isArray(list.body?.dashboards)) {
          return { pass: false, details: `list status=${list.status}` };
        }
        const firstDefinition = await getFirstDefinition(makeRequest, token);
        if (!firstDefinition?.report_key) {
          return { pass: false, details: 'no report definition available for dashboard widget' };
        }

        const create = await makeRequest('POST', '/api/reports/module/dashboards', {
          name: uniqueName('Regression Dashboard'),
          description: 'Regression-created dashboard',
          layout: [],
          widgets: [{
            id: 'widget-1',
            title: 'Summary',
            report_key: firstDefinition.report_key,
            display_mode: 'table',
            limit: 3,
          }],
          visibility_scope: 'shared',
          is_active: true,
        }, token);
        createdId = Number(create.body?.id || 0);
        if (create.status !== 201 || !createdId) {
          return { pass: false, details: `create status=${create.status}` };
        }

        const update = await makeRequest('PUT', `/api/reports/module/dashboards/${createdId}`, {
          name: `${create.body.name}-edited`,
          description: 'Updated regression dashboard',
          layout: [{ i: 'widget-1', x: 0, y: 0, w: 6, h: 4 }],
          widgets: create.body.widgets || [{
            id: 'widget-1',
            title: 'Summary',
            report_key: firstDefinition.report_key,
            display_mode: 'table',
            limit: 3,
          }],
          visibility_scope: 'private',
          is_active: true,
        }, token);
        if (update.status !== 200) {
          return { pass: false, details: `update status=${update.status}` };
        }

        const run = await makeRequest('POST', `/api/reports/module/dashboards/${createdId}/run`, {
          filters: {},
          timezone_name: 'UTC',
        }, token);
        if (run.status !== 200 || !Array.isArray(run.body?.widgets) || !Array.isArray(run.body?.csv_rows)) {
          return { pass: false, details: `run status=${run.status}` };
        }

        const del = await makeRequest('DELETE', `/api/reports/module/dashboards/${createdId}`, null, token);
        createdId = null;
        return {
          pass: del.status === 200 && del.body?.ok === true,
          details: `create=${create.status}, update=${update.status}, run=${run.status}, delete=${del.status}`,
        };
      } finally {
        await cleanupDashboard(createdId);
      }
    },
  },
  {
    name: 'Report module schedule CRUD lifecycle',
    module: 'Reports',
    covers: [
      'GET /api/reports/module/schedules',
      'POST /api/reports/module/schedules',
      'PUT /api/reports/module/schedules/:id',
      'DELETE /api/reports/module/schedules/:id',
    ],
    run: async ({ makeRequest, token }) => {
      let createdId = null;
      try {
        const list = await makeRequest('GET', '/api/reports/module/schedules', null, token);
        if (list.status !== 200 || !Array.isArray(list.body?.schedules)) {
          return { pass: false, details: `list status=${list.status}` };
        }

        const firstDefinition = await getFirstDefinition(makeRequest, token);
        if (!firstDefinition?.id) {
          return { pass: false, details: 'no report definition available for schedule target' };
        }

        const create = await makeRequest('POST', '/api/reports/module/schedules', {
          export_name: uniqueName('Regression Schedule'),
          target_type: 'report',
          target_id: firstDefinition.id,
          report_key: firstDefinition.report_key,
          schedule_frequency: 'daily',
          schedule_time_local: '08:00',
          timezone_name: 'UTC',
          delivery_method: 'in_app',
          delivery_target: '',
          filters: {},
        }, token);
        createdId = Number(create.body?.id || 0);
        if (create.status !== 201 || !createdId) {
          return { pass: false, details: `create status=${create.status}` };
        }

        const update = await makeRequest('PUT', `/api/reports/module/schedules/${createdId}`, {
          export_name: `${create.body.schedule?.export_name || 'Regression Schedule'} Updated`,
          schedule_frequency: 'weekly',
          schedule_weekday: 1,
          schedule_time_local: '09:15',
          delivery_method: 'in_app',
          is_active: 1,
        }, token);
        if (update.status !== 200 || update.body?.ok !== true) {
          return { pass: false, details: `update status=${update.status}` };
        }

        const del = await makeRequest('DELETE', `/api/reports/module/schedules/${createdId}`, null, token);
        createdId = null;
        return {
          pass: del.status === 200 && del.body?.ok === true,
          details: `create=${create.status}, update=${update.status}, delete=${del.status}`,
        };
      } finally {
        await cleanupSchedule(createdId);
      }
    },
  },
  {
    name: 'Report roadmap operations cover duplicate favorites and run detail',
    module: 'Reports',
    covers: [
      'POST /api/reports/module/definitions/:id/duplicate',
      'GET/POST/DELETE /api/reports/module/favorites',
      'GET /api/reports/module/history/:id',
      'POST /api/reports/module/history/:id/retry',
    ],
    run: async ({ makeRequest, token }) => {
      let createdId = null;
      let duplicateId = null;
      try {
        const create = await makeRequest('POST', '/api/reports/module/definitions', {
          dataset_key: 'daily-case-summary',
          name: uniqueName('Regression Roadmap Report'),
          description: 'Regression roadmap report',
          default_filters: {},
          selected_columns: [],
          visibility_scope: 'shared',
          is_active: true,
        }, token);
        createdId = Number(create.body?.id || 0);
        if (create.status !== 201 || !createdId) return { pass: false, details: `create=${create.status}` };

        const duplicate = await makeRequest('POST', `/api/reports/module/definitions/${createdId}/duplicate`, {}, token);
        duplicateId = Number(duplicate.body?.id || 0);
        const addFavorite = await makeRequest('POST', '/api/reports/module/favorites', { target_type: 'report', target_id: createdId }, token);
        const listFavorites = await makeRequest('GET', '/api/reports/module/favorites', null, token);
        const run = await makeRequest('POST', `/api/reports/module/definitions/${createdId}/run`, { filters: {}, timezone_name: 'UTC' }, token);
        const history = await makeRequest('GET', '/api/reports/module/history?target_type=report&limit=10', null, token);
        const runId = Number((history.body?.runs || []).find((item) => Number(item.target_id) === createdId)?.id || 0);
        const detail = runId ? await makeRequest('GET', `/api/reports/module/history/${runId}`, null, token) : { status: 0 };
        const retry = runId ? await makeRequest('POST', `/api/reports/module/history/${runId}/retry`, {}, token) : { status: 0 };
        const removeFavorite = await makeRequest('DELETE', '/api/reports/module/favorites', { target_type: 'report', target_id: createdId }, token);

        return {
          pass: duplicate.status === 201 &&
            !!duplicateId &&
            addFavorite.status === 201 &&
            listFavorites.status === 200 &&
            run.status === 200 &&
            detail.status === 200 &&
            retry.status === 200 &&
            removeFavorite.status === 200,
          details: `duplicate=${duplicate.status}, favorite=${addFavorite.status}/${removeFavorite.status}, run=${run.status}, detail=${detail.status}, retry=${retry.status}`,
        };
      } finally {
        await cleanupReportDefinition(duplicateId);
        await cleanupReportDefinition(createdId);
      }
    },
  },
  {
    name: 'Dashboard duplicate works',
    module: 'Reports',
    covers: ['POST /api/reports/module/dashboards/:id/duplicate'],
    run: async ({ makeRequest, token }) => {
      let dashboardId = null;
      let duplicateId = null;
      try {
        const firstDefinition = await getFirstDefinition(makeRequest, token);
        if (!firstDefinition?.report_key) return { pass: false, details: 'no report definition available' };
        const create = await makeRequest('POST', '/api/reports/module/dashboards', {
          name: uniqueName('Regression Roadmap Dashboard'),
          description: 'Regression roadmap dashboard',
          layout: [],
          widgets: [{ id: 'w1', title: 'Cases', report_key: firstDefinition.report_key, display_mode: 'table', limit: 3 }],
          visibility_scope: 'shared',
          is_active: true,
        }, token);
        dashboardId = Number(create.body?.id || 0);
        if (create.status !== 201 || !dashboardId) return { pass: false, details: `create=${create.status}` };
        const duplicate = await makeRequest('POST', `/api/reports/module/dashboards/${dashboardId}/duplicate`, {}, token);
        duplicateId = Number(duplicate.body?.id || 0);
        return { pass: duplicate.status === 201 && !!duplicateId, details: `duplicate=${duplicate.status}` };
      } finally {
        await cleanupDashboard(duplicateId);
        await cleanupDashboard(dashboardId);
      }
    },
  },
  {
    name: 'Report scheduler pause and resume',
    module: 'Reports',
    covers: [
      'POST /api/reports/module/schedules/:id/pause',
      'POST /api/reports/module/schedules/:id/resume',
    ],
    run: async ({ makeRequest, token }) => {
      let createdId = null;
      try {
        const firstDefinition = await getFirstDefinition(makeRequest, token);
        if (!firstDefinition?.id) return { pass: false, details: 'no report definition available' };
        const create = await makeRequest('POST', '/api/reports/module/schedules', {
          export_name: uniqueName('Regression Roadmap Schedule'),
          target_type: 'report',
          target_id: firstDefinition.id,
          report_key: firstDefinition.report_key,
          schedule_frequency: 'daily',
          schedule_time_local: '08:00',
          timezone_name: 'UTC',
          delivery_method: 'in_app',
          delivery_target: '',
          filters: {},
        }, token);
        createdId = Number(create.body?.id || 0);
        if (create.status !== 201 || !createdId) return { pass: false, details: `create=${create.status}` };

        const pause = await makeRequest('POST', `/api/reports/module/schedules/${createdId}/pause`, {}, token);
        const resume = await makeRequest('POST', `/api/reports/module/schedules/${createdId}/resume`, {}, token);
        return {
          pass: pause.status === 200 && resume.status === 200,
          details: `pause=${pause.status}, resume=${resume.status}`,
        };
      } finally {
        await cleanupSchedule(createdId);
      }
    },
  },
  {
    name: 'Report module built-in dashboard run works',
    module: 'Reports',
    covers: ['POST /api/reports/module/dashboards/:id/run'],
    run: async ({ makeRequest, token }) => {
      const dashboard = await getFirstDashboard(makeRequest, token);
      if (!dashboard?.id) {
        return { pass: false, details: 'no dashboard available' };
      }
      const res = await makeRequest('POST', `/api/reports/module/dashboards/${dashboard.id}/run`, {
        filters: {},
        timezone_name: 'UTC',
      }, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.widgets) && Array.isArray(res.body?.csv_rows),
        details: `status=${res.status}, widgets=${Array.isArray(res.body?.widgets) ? res.body.widgets.length : 'n/a'}`,
      };
    },
  },
];
