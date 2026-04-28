'use strict';

const pool = require('../database/db');
let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (_) {
  bcrypt = require('bcrypt');
}

const { getFirstCase, uniqueName } = require('./helpers');

async function loginForToken(makeRequest, email, password) {
  const login = await makeRequest('POST', '/api/auth/login', { email, password }, null);
  if (login.status !== 200) {
    return { status: login.status, token: null, body: login.body };
  }
  if (login.body?.token) {
    return { status: login.status, token: login.body.token, body: login.body };
  }
  if (login.body?.challengeToken) {
    const skip = await makeRequest('POST', '/api/auth/2fa/skip-setup', {
      challengeToken: login.body.challengeToken,
    }, null);
    return { status: skip.status, token: skip.body?.token || null, body: skip.body };
  }
  return { status: login.status, token: null, body: login.body };
}

async function createTemporarySuperadmin(makeRequest) {
  const email = `${uniqueName('regression-superadmin').toLowerCase()}@example.com`;
  const password = 'TempSuperadmin@123';
  const hash = await bcrypt.hash(password, 10);
  const [insert] = await pool.execute(
    `INSERT INTO users (name, email, password, role, is_active, email_verified)
     VALUES (?, ?, ?, 'superadmin', 1, 1)`,
    ['Regression Superadmin', email, hash]
  );
  const userId = Number(insert.insertId || 0);
  const login = await loginForToken(makeRequest, email, password);
  return { userId, token: login.token, status: login.status };
}

async function cleanupTemporaryUser(userId) {
  if (!userId) return;
  await pool.execute('DELETE FROM user_org_access WHERE user_id = ?', [userId]).catch(() => {});
  await pool.execute('DELETE FROM users WHERE id = ?', [userId]).catch(() => {});
}

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
  await pool.execute('DELETE FROM report_definitions WHERE id = ?', [id]).catch(() => {});
}

async function cleanupDashboard(id) {
  if (!id) return;
  await pool.execute('DELETE FROM report_dashboards WHERE id = ?', [id]).catch(() => {});
}

async function cleanupSchedule(id) {
  if (!id) return;
  await pool.execute('DELETE FROM scheduled_export_configs WHERE id = ?', [id]).catch(() => {});
}

module.exports = [
  {
    name: 'GET /api/reports/case-volume returns data array',
    module: 'Reports',
    covers: ['GET /api/reports/case-volume'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/reports/case-volume', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body?.data), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/reports/case-status returns data array',
    module: 'Reports',
    covers: ['GET /api/reports/case-status'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/reports/case-status', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body?.data), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/reports/daily-case-summary returns data array',
    module: 'Reports',
    covers: ['GET /api/reports/daily-case-summary'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/reports/daily-case-summary', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body?.data), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/reports/daily-operations-pack returns data array',
    module: 'Reports',
    covers: ['GET /api/reports/daily-operations-pack'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/reports/daily-operations-pack', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body?.data), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/reports/inbox-performance returns data array',
    module: 'Reports',
    covers: ['GET /api/reports/inbox-performance'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/reports/inbox-performance', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body?.data), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/reports/inbox-sla returns data array',
    module: 'Reports',
    covers: ['GET /api/reports/inbox-sla'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/reports/inbox-sla', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body?.data), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/reports/transmission-sla returns data array',
    module: 'Reports',
    covers: ['GET /api/reports/transmission-sla'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/reports/transmission-sla', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body?.data), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/reports/system-health returns payload',
    module: 'Reports',
    covers: ['GET /api/reports/system-health'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/reports/system-health', null, token);
      return { pass: res.status === 200 && res.body != null, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/reports/report-run-ledger returns ledger data',
    module: 'Reports',
    covers: ['GET /api/reports/report-run-ledger'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/reports/report-run-ledger?limit=5', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body?.data), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'POST /api/reports/run-log validates required fields',
    module: 'Reports',
    covers: ['POST /api/reports/run-log'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('POST', '/api/reports/run-log', {}, token);
      return { pass: res.status === 400, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'POST /api/reports/run-log creates run ledger entry',
    module: 'Reports',
    covers: ['POST /api/reports/run-log'],
    run: async ({ makeRequest, token }) => {
      const payload = {
        report_key: 'regression-health',
        report_name: uniqueName('Regression Report'),
        filters: { source: 'regression' },
        timezone_name: 'Asia/Kolkata',
        row_count: 0,
        status: 'success',
      };
      const res = await makeRequest('POST', '/api/reports/run-log', payload, token);
      return { pass: res.status === 200 && Number(res.body?.id || 0) > 0, details: `Status: ${res.status}, id: ${res.body?.id || 'n/a'}` };
    },
  },
  {
    name: 'Reports detail endpoints return payloads',
    module: 'Reports',
    covers: [
      'GET /api/reports/daily-case-openings',
      'GET /api/reports/daily-case-closures',
      'GET /api/reports/case-type',
      'GET /api/reports/case-age',
      'GET /api/reports/case-assignee',
      'GET /api/reports/case-intake-channel',
      'GET /api/reports/case-priority',
      'GET /api/reports/case-source',
      'GET /api/reports/case-duplicates',
      'GET /api/reports/case-by-org',
    ],
    run: async ({ makeRequest, token }) => {
      const endpoints = [
        '/api/reports/daily-case-openings',
        '/api/reports/daily-case-closures',
        '/api/reports/case-type',
        '/api/reports/case-age',
        '/api/reports/case-assignee',
        '/api/reports/case-intake-channel',
        '/api/reports/case-priority',
        '/api/reports/case-source',
        '/api/reports/case-duplicates',
        '/api/reports/case-by-org',
      ];
      for (const path of endpoints) {
        const res = await makeRequest('GET', path, null, token);
        if (res.status !== 200 || !('data' in (res.body || {}))) {
          return { pass: false, details: `${path} status=${res.status}` };
        }
      }
      return { pass: true, details: `checked=${endpoints.length}` };
    },
  },
  {
    name: 'Reports compliance endpoints return payloads',
    module: 'Reports',
    covers: [
      'GET /api/reports/case-ae-summary',
      'GET /api/reports/case-audit-trail',
      'GET /api/reports/case-closure-rate',
      'GET /api/reports/case-monthly-trend',
      'GET /api/reports/regulatory-readiness',
    ],
    run: async ({ makeRequest, token }) => {
      const sampleCase = await getFirstCase(makeRequest, token);
      if (!sampleCase?.id) {
        return { pass: false, details: 'no case available for audit trail report' };
      }
      const endpoints = [
        '/api/reports/case-ae-summary',
        `/api/reports/case-audit-trail?case_id=${sampleCase.id}`,
        '/api/reports/case-closure-rate',
        '/api/reports/case-monthly-trend',
        '/api/reports/regulatory-readiness',
      ];
      for (const path of endpoints) {
        const res = await makeRequest('GET', path, null, token);
        if (res.status !== 200 || !('data' in (res.body || {}))) {
          return { pass: false, details: `${path} status=${res.status}` };
        }
      }
      return { pass: true, details: `checked=${endpoints.length}` };
    },
  },
  {
    name: 'Reports platform endpoints return payloads',
    module: 'Reports',
    covers: [
      'GET /api/reports/audit-summary',
      'GET /api/reports/content-usage',
      'GET /api/reports/field-usage',
      'GET /api/reports/integration-sync',
      'GET /api/reports/module-usage',
      'GET /api/reports/security-events',
      'GET /api/reports/user-activity',
      'GET /api/reports/user-roles',
    ],
    run: async ({ makeRequest, token }) => {
      const endpoints = [
        '/api/reports/audit-summary',
        '/api/reports/content-usage',
        '/api/reports/field-usage',
        '/api/reports/integration-sync',
        '/api/reports/module-usage',
        '/api/reports/security-events',
        '/api/reports/user-activity',
        '/api/reports/user-roles',
      ];
      for (const path of endpoints) {
        const res = await makeRequest('GET', path, null, token);
        if (res.status !== 200 || !('data' in (res.body || {}))) {
          return { pass: false, details: `${path} status=${res.status}` };
        }
      }
      return { pass: true, details: `checked=${endpoints.length}` };
    },
  },
  {
    name: 'GET /api/reports/org-activity works for superadmin',
    module: 'Reports',
    covers: ['GET /api/reports/org-activity'],
    run: async ({ makeRequest }) => {
      const temp = await createTemporarySuperadmin(makeRequest);
      try {
        if (temp.status !== 200 || !temp.token) {
          return { pass: false, details: `superadmin login status=${temp.status}` };
        }
        const res = await makeRequest('GET', '/api/reports/org-activity', null, temp.token);
        return {
          pass: res.status === 200 && Array.isArray(res.body?.data),
          details: `status=${res.status}, rows=${Array.isArray(res.body?.data) ? res.body.data.length : 'n/a'}`,
        };
      } finally {
        await cleanupTemporaryUser(temp.userId);
      }
    },
  },
  {
    name: 'GET /api/presets returns preset list',
    module: 'Reports',
    covers: ['GET /api/presets'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/presets', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'POST /api/presets creates preset',
    module: 'Reports',
    covers: ['POST /api/presets'],
    run: async ({ makeRequest, token }) => {
      const payload = {
        name: uniqueName('Regression Preset'),
        group_key: 'overview',
        report_key: 'case-volume',
        filters: { date_from: '2026-04-01' },
      };
      const res = await makeRequest('POST', '/api/presets', payload, token);
      const createdId = Number(res.body?.id || 0);
      if (createdId > 0) {
        await makeRequest('DELETE', `/api/presets/${createdId}`, null, token);
      }
      return { pass: res.status === 201 && createdId > 0, details: `Status: ${res.status}, id: ${createdId || 'n/a'}` };
    },
  },
  {
    name: 'DELETE /api/presets/:id deletes preset',
    module: 'Reports',
    covers: ['DELETE /api/presets/:id'],
    run: async ({ makeRequest, token }) => {
      const create = await makeRequest('POST', '/api/presets', {
        name: uniqueName('Regression Preset Delete'),
        group_key: 'overview',
        report_key: 'case-status',
        filters: { date_to: '2026-04-25' },
      }, token);
      const createdId = Number(create.body?.id || 0);
      if (create.status !== 201 || !createdId) {
        return { pass: false, details: `create status: ${create.status}` };
      }
      const del = await makeRequest('DELETE', `/api/presets/${createdId}`, null, token);
      return { pass: del.status === 200 && del.body?.ok === true, details: `Status: ${del.status}` };
    },
  },
  {
    name: 'Report module summary datasets history and config load',
    module: 'Reports',
    covers: [
      'GET /api/reports/module/summary',
      'GET /api/reports/module/datasets',
      'GET /api/reports/module/history',
      'GET /api/reports/module/config',
    ],
    run: async ({ makeRequest, token }) => {
      const checks = [
        ['/api/reports/module/summary', (body) => typeof body?.total_reports === 'number'],
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
