'use strict';

const pool = require('../database/db');
const { getFirstCase, uniqueName } = require('../regression-tests/helpers');

async function getFirstQaRule(makeRequest, token) {
  const res = await makeRequest('GET', '/api/admin/qa/rules', null, token);
  return Array.isArray(res.body?.rules) ? res.body.rules[0] || null : null;
}

async function cleanupQaReport(reportId) {
  if (!reportId) return;
  await pool.execute('DELETE FROM qa_report_items WHERE report_id = ?', [reportId]).catch(() => {});
  await pool.execute('DELETE FROM qa_reports WHERE id = ?', [reportId]).catch(() => {});
}

async function cleanupQaResponse(responseId) {
  if (!responseId) return;
  await pool.execute('DELETE FROM ai_qa_responses WHERE id = ?', [responseId]).catch(() => {});
}

module.exports = [
  {
    name: 'QA: GET /api/admin/qa/rules returns rules array',
    module: 'Case QA',
    covers: ['GET /api/admin/qa/rules'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/qa/rules', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.rules),
        details: `status=${res.status}, rules=${Array.isArray(res.body?.rules) ? res.body.rules.length : 'n/a'}`,
      };
    },
  },
  {
    name: 'QA: GET /api/admin/qa/reports returns reports array',
    module: 'Case QA',
    covers: ['GET /api/admin/qa/reports'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/qa/reports', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.reports),
        details: `status=${res.status}, reports=${Array.isArray(res.body?.reports) ? res.body.reports.length : 'n/a'}`,
      };
    },
  },
  {
    name: 'QA: GET /api/admin/qa/overrides returns overrides payload',
    module: 'Case QA',
    covers: ['GET /api/admin/qa/overrides'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/qa/overrides', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.overrides),
        details: `status=${res.status}, overrides=${Array.isArray(res.body?.overrides) ? res.body.overrides.length : 'n/a'}`,
      };
    },
  },
  {
    name: 'QA: POST /api/admin/qa/reports validates required fields',
    module: 'Case QA',
    covers: ['POST /api/admin/qa/reports'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('POST', '/api/admin/qa/reports', {}, token);
      return { pass: res.status === 400, details: `status=${res.status}` };
    },
  },
  {
    name: 'QA: PUT /api/admin/qa/rules/:ruleId updates and restores a rule',
    module: 'Case QA',
    covers: ['PUT /api/admin/qa/rules/:ruleId'],
    run: async ({ makeRequest, token }) => {
      const rule = await getFirstQaRule(makeRequest, token);
      if (!rule?.id) {
        return { pass: false, details: 'no QA rule available' };
      }

      const nextSeverity = rule.severity === 'warning' ? 'info' : 'warning';
      const update = await makeRequest('PUT', `/api/admin/qa/rules/${rule.id}`, {
        severity: nextSeverity,
      }, token);
      if (update.status !== 200) {
        return { pass: false, details: `update status=${update.status}` };
      }

      const restore = await makeRequest('PUT', `/api/admin/qa/rules/${rule.id}`, {
        severity: rule.severity,
      }, token);

      return {
        pass: restore.status === 200,
        details: `update=${update.status}, restore=${restore.status}`,
      };
    },
  },
  {
    name: 'QA: POST /api/admin/qa/rules/reset returns 200',
    module: 'Case QA',
    covers: ['POST /api/admin/qa/rules/reset'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('POST', '/api/admin/qa/rules/reset', {}, token);
      return { pass: res.status === 200 && res.body?.ok === true, details: `status=${res.status}` };
    },
  },
  {
    name: 'QA: case evaluate history and override lifecycle works',
    module: 'Case QA',
    covers: [
      'POST /api/cases/:id/qa-evaluate',
      'GET /api/cases/:id/qa-history',
      'POST /api/cases/:id/qa-override',
    ],
    run: async ({ makeRequest, token }) => {
      const sampleCase = await getFirstCase(makeRequest, token);
      if (!sampleCase?.id) {
        return { pass: false, details: 'no case available for QA evaluation' };
      }

      let responseId = null;
      try {
        const evaluate = await makeRequest('POST', `/api/cases/${sampleCase.id}/qa-evaluate`, {}, token);
        responseId = Number(evaluate.body?.response_id || 0);
        if (evaluate.status !== 200 || !responseId) {
          return { pass: false, details: `evaluate status=${evaluate.status}` };
        }

        const history = await makeRequest('GET', `/api/cases/${sampleCase.id}/qa-history`, null, token);
        if (history.status !== 200 || !Array.isArray(history.body?.history)) {
          return { pass: false, details: `history status=${history.status}` };
        }

        const override = await makeRequest('POST', `/api/cases/${sampleCase.id}/qa-override`, {
          response_id: responseId,
          override_reason: 'Regression override reason',
          has_critical_flags: false,
        }, token);

        return {
          pass: override.status === 200 && override.body?.ok === true,
          details: `evaluate=${evaluate.status}, history=${history.status}, override=${override.status}`,
        };
      } finally {
        await cleanupQaResponse(responseId);
      }
    },
  },
  {
    name: 'QA: report detail route returns report and items for a created report',
    module: 'Case QA',
    covers: [
      'POST /api/admin/qa/reports',
      'GET /api/admin/qa/reports/:reportId',
    ],
    run: async ({ makeRequest, token }) => {
      let reportId = null;
      try {
        const create = await makeRequest('POST', '/api/admin/qa/reports', {
          report_name: uniqueName('Regression QA Report'),
          date_range_start: '2099-01-01',
          date_range_end: '2099-01-02',
          case_type_filter: 'MI',
        }, token);
        reportId = Number(create.body?.report_id || 0);
        if (create.status !== 201 || !reportId) {
          return { pass: false, details: `create status=${create.status}` };
        }

        const detail = await makeRequest('GET', `/api/admin/qa/reports/${reportId}`, null, token);
        return {
          pass: detail.status === 200 && detail.body?.report?.id === reportId && Array.isArray(detail.body?.items),
          details: `create=${create.status}, detail=${detail.status}, items=${Array.isArray(detail.body?.items) ? detail.body.items.length : 'n/a'}`,
        };
      } finally {
        await cleanupQaReport(reportId);
      }
    },
  },
];
