'use strict';

const { uniqueName } = require('./helpers');

module.exports = [
  {
    name: 'GET /api/reports/case-volume returns data array',
    module: 'Reports',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/reports/case-volume', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body?.data), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/reports/case-status returns data array',
    module: 'Reports',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/reports/case-status', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body?.data), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/reports/daily-case-summary returns data array',
    module: 'Reports',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/reports/daily-case-summary', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body?.data), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/reports/daily-operations-pack returns data array',
    module: 'Reports',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/reports/daily-operations-pack', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body?.data), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/reports/inbox-performance returns data array',
    module: 'Reports',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/reports/inbox-performance', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body?.data), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/reports/inbox-sla returns data array',
    module: 'Reports',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/reports/inbox-sla', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body?.data), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/reports/transmission-sla returns data array',
    module: 'Reports',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/reports/transmission-sla', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body?.data), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/reports/system-health returns payload',
    module: 'Reports',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/reports/system-health', null, token);
      return { pass: res.status === 200 && res.body != null, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/reports/report-run-ledger returns ledger data',
    module: 'Reports',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/reports/report-run-ledger?limit=5', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body?.data), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'POST /api/reports/run-log validates required fields',
    module: 'Reports',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('POST', '/api/reports/run-log', {}, token);
      return { pass: res.status === 400, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'POST /api/reports/run-log creates run ledger entry',
    module: 'Reports',
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
    name: 'GET /api/presets returns preset list',
    module: 'Reports',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/presets', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'POST /api/presets creates preset',
    module: 'Reports',
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
];
