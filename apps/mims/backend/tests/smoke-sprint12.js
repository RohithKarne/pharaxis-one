'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_URL = 'http://localhost:3000';
const FRONTEND_ESLINT_PATH = path.resolve(__dirname, '../../frontend/eslint.config.js');

function escapeSingleQuotes(value) {
  return value.replace(/'/g, `"'"'`);
}

function runCurl(method, endpoint, { token, apiKey, body } = {}) {
  let cmd = `curl -s -w "HTTPSTATUS:%{http_code}" -X ${method} "${BASE_URL}${endpoint}"`;

  if (token) {
    cmd += ` -H "Authorization: Bearer ${token}"`;
  }
  if (apiKey) {
    cmd += ` -H "x-api-key: ${apiKey}"`;
  }
  if (body !== undefined) {
    const payload = escapeSingleQuotes(JSON.stringify(body));
    cmd += ` -H "Content-Type: application/json" -d '${payload}'`;
  }

  const result = execSync(cmd, { encoding: 'utf8' });
  const parts = result.split('HTTPSTATUS:');
  const rawBody = parts[0] || '';
  let parsedBody = null;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch (_err) {
    parsedBody = rawBody;
  }
  const status = parseInt(parts[1], 10);
  return { body: parsedBody, status };
}

function printResult(row) {
  const state = row.skip ? 'SKIP' : row.pass ? 'PASS' : 'FAIL';
  console.log(`${state} - ${row.name} (${row.detail})`);
}

function getArrayFromBody(body, keys) {
  if (!body || typeof body !== 'object') {
    return null;
  }
  for (const key of keys) {
    if (Array.isArray(body[key])) {
      return body[key];
    }
  }
  if (Array.isArray(body)) {
    return body;
  }
  return null;
}

function loginWith2Step(email, password) {
  const loginRes = runCurl('POST', '/api/auth/login', { body: { email, password } });
  if (loginRes.status !== 200 || !loginRes.body || typeof loginRes.body !== 'object') {
    return { ok: false, status: loginRes.status, body: loginRes.body, reason: 'Login request failed' };
  }

  if (loginRes.body.token) {
    return { ok: true, token: loginRes.body.token, loginRes };
  }

  if (!loginRes.body.challengeToken) {
    return { ok: false, status: loginRes.status, body: loginRes.body, reason: 'Missing token/challengeToken' };
  }

  const skipRes = runCurl('POST', '/api/auth/2fa/skip-setup', {
    body: { challengeToken: loginRes.body.challengeToken },
  });

  if (skipRes.status !== 200 || !skipRes.body || typeof skipRes.body !== 'object' || !skipRes.body.token) {
    return { ok: false, status: skipRes.status, body: skipRes.body, reason: '2FA skip-setup failed' };
  }

  return { ok: true, token: skipRes.body.token, loginRes, skipRes };
}

function run() {
  const results = [];
  let saToken = null;
  let adminToken = null;
  let adminLoginFailed = false;

  let emirSenderRuleId = null;
  let scheduledExportId = null;

  const superadminCreds = { email: 'superadmin', password: '__SET_SMOKE_TEST_PASSWORD__' };
  const adminCredsPrimary = { email: 'vanaja_admin@reviewco.com', password: '__SET_SMOKE_TEST_PASSWORD__' };
  const adminCredsFallback = { email: 'admin@novartis.com', password: '__SET_SMOKE_TEST_PASSWORD__' };

  const saAuth = loginWith2Step(superadminCreds.email, superadminCreds.password);
  if (saAuth.ok) {
    saToken = saAuth.token;
  }

  const adminAuthPrimary = loginWith2Step(adminCredsPrimary.email, adminCredsPrimary.password);
  if (adminAuthPrimary.ok) {
    adminToken = adminAuthPrimary.token;
  } else {
    const adminAuthFallback = loginWith2Step(adminCredsFallback.email, adminCredsFallback.password);
    if (adminAuthFallback.ok) {
      adminToken = adminAuthFallback.token;
    } else {
      adminLoginFailed = true;
    }
  }

  function runTest(name, fn, options = {}) {
    const shouldSkipForAdmin = options.requiresAdmin && adminLoginFailed;
    if (shouldSkipForAdmin) {
      const row = { name, pass: false, skip: true, detail: 'Admin login failed' };
      results.push(row);
      printResult(row);
      return;
    }

    if (options.skipWhen && options.skipWhen()) {
      const row = { name, pass: false, skip: true, detail: options.skipReason || 'Skipped' };
      results.push(row);
      printResult(row);
      return;
    }

    try {
      const outcome = fn();
      const row = {
        name,
        pass: !!outcome.pass,
        skip: !!outcome.skip,
        detail: outcome.detail || '',
      };
      results.push(row);
      printResult(row);
    } catch (err) {
      const row = { name, pass: false, skip: false, detail: err && err.message ? err.message : String(err) };
      results.push(row);
      printResult(row);
    }
  }

  runTest('Health check', () => {
    const res = runCurl('GET', '/api/health');
    const okField = res.body && typeof res.body === 'object' && res.body.status === 'ok';
    const pass = res.status === 200 && okField;
    return { pass, detail: `status=${res.status}, statusOk=${okField}` };
  });

  runTest('Platform Admin login', () => {
    const res = runCurl('POST', '/api/auth/login', { body: superadminCreds });
    const hasToken = res.body && typeof res.body === 'object' && !!res.body.token;
    const pass = res.status === 200 && hasToken;
    return { pass, detail: `status=${res.status}, hasToken=${hasToken}` };
  });

  runTest(
    'Cases endpoint regression',
    () => {
      const res = runCurl('GET', '/api/cases', { token: adminToken });
      const pass = res.status === 200 || res.status === 401;
      return { pass, detail: `status=${res.status}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'Scheduler jobs list',
    () => {
      const res = runCurl('GET', '/api/admin/scheduler/jobs', { token: adminToken });
      const jobs = getArrayFromBody(res.body, ['jobs']);
      const hasJobsArray = Array.isArray(jobs);
      const pass = res.status === 200 && hasJobsArray;
      return { pass, detail: `status=${res.status}, jobsArray=${hasJobsArray}` };
    },
    { requiresAdmin: true }
  );

  runTest('Scheduler auth guard', () => {
    const res = runCurl('GET', '/api/admin/scheduler/jobs');
    const pass = res.status === 401;
    return { pass, detail: `status=${res.status}` };
  });

  runTest(
    'OAuth2 token endpoint reachable',
    () => {
      const res = runCurl('POST', '/api/admin/integrations/oauth2/token', {
        token: adminToken,
        body: { integrationType: 'salesforce' },
      });
      const pass = res.status === 400 || res.status === 200;
      return { pass, detail: `status=${res.status}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'OAuth2 revoke endpoint reachable',
    () => {
      const res = runCurl('DELETE', '/api/admin/integrations/oauth2/token', {
        token: adminToken,
        body: { integrationType: 'salesforce' },
      });
      const pass = res.status === 200 || res.status === 404;
      return { pass, detail: `status=${res.status}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'Vault test-connection endpoint exists',
    () => {
      const res = runCurl('POST', '/api/admin/integrations/vault/test-connection', { token: adminToken, body: {} });
      const pass = res.status !== 404;
      return { pass, detail: `status=${res.status}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'MIR test-connection endpoint exists',
    () => {
      const res = runCurl('POST', '/api/admin/integrations/mir/test-connection', { token: adminToken, body: {} });
      const pass = res.status !== 404;
      return { pass, detail: `status=${res.status}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'CRM test-connection endpoint exists',
    () => {
      const res = runCurl('POST', '/api/admin/integrations/crm/test-connection', { token: adminToken, body: {} });
      const pass = res.status !== 404;
      return { pass, detail: `status=${res.status}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'EMIR sender rules list',
    () => {
      const res = runCurl('GET', '/api/admin/emir/sender-rules', { token: adminToken });
      const arr = getArrayFromBody(res.body, ['rules', 'data', 'senderRules']);
      const hasArray = Array.isArray(arr);
      const pass = res.status === 200 && hasArray;
      return { pass, detail: `status=${res.status}, array=${hasArray}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'EMIR sender rule create',
    () => {
      const res = runCurl('POST', '/api/admin/emir/sender-rules', {
        token: adminToken,
        body: { sender_email: 'test@smoke.com', sender_name: 'Smoke Test', is_trusted: 1 },
      });
      const okStatus = res.status === 200 || res.status === 201;
      const id = res.body && typeof res.body === 'object' ? res.body.id : null;
      if (okStatus && id) {
        emirSenderRuleId = id;
      }
      const pass = okStatus && !!id;
      return { pass, detail: `status=${res.status}, id=${id}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'EMIR sender rule update',
    () => {
      const res = runCurl('PUT', `/api/admin/emir/sender-rules/${emirSenderRuleId}`, {
        token: adminToken,
        body: { sender_email: 'updated@smoke.com', sender_name: 'Updated', is_trusted: 0 },
      });
      const pass = res.status === 200;
      return { pass, detail: `status=${res.status}, id=${emirSenderRuleId}` };
    },
    {
      requiresAdmin: true,
      skipWhen: () => !emirSenderRuleId,
      skipReason: 'Depends on test 12',
    }
  );

  runTest(
    'EMIR sender rule delete',
    () => {
      const res = runCurl('DELETE', `/api/admin/emir/sender-rules/${emirSenderRuleId}`, { token: adminToken });
      const pass = res.status === 200;
      return { pass, detail: `status=${res.status}, id=${emirSenderRuleId}` };
    },
    {
      requiresAdmin: true,
      skipWhen: () => !emirSenderRuleId,
      skipReason: 'Depends on test 12',
    }
  );

  runTest(
    'EMIR routing rules list',
    () => {
      const res = runCurl('GET', '/api/admin/emir/routing-rules', { token: adminToken });
      const arr = getArrayFromBody(res.body, ['rules', 'data', 'routingRules']);
      const hasArray = Array.isArray(arr);
      const pass = res.status === 200 && hasArray;
      return { pass, detail: `status=${res.status}, array=${hasArray}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'EMIR routing rule create',
    () => {
      const createRes = runCurl('POST', '/api/admin/emir/routing-rules', {
        token: adminToken,
        body: {
          rule_name: 'SmokeRule',
          match_field: 'subject',
          match_value: 'urgent',
          route_to_queue: 'high-priority',
          priority: 1,
          is_active: 1,
        },
      });

      const okCreate = createRes.status === 200 || createRes.status === 201;
      let cleanupStatus = 'n/a';
      if (okCreate) {
        const id = createRes.body && typeof createRes.body === 'object' ? createRes.body.id : null;
        if (id) {
          const delRes = runCurl('DELETE', `/api/admin/emir/routing-rules/${id}`, { token: adminToken });
          cleanupStatus = String(delRes.status);
        } else {
          cleanupStatus = 'missing-id';
        }
      }

      return { pass: okCreate, detail: `createStatus=${createRes.status}, cleanup=${cleanupStatus}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'Case import jobs list',
    () => {
      const res = runCurl('GET', '/api/admin/cases/import/jobs', { token: adminToken });
      const arr = getArrayFromBody(res.body, ['jobs', 'data']);
      const hasArray = Array.isArray(arr);
      const pass = res.status === 200 && hasArray;
      return { pass, detail: `status=${res.status}, array=${hasArray}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'Scheduled exports list',
    () => {
      const res = runCurl('GET', '/api/admin/exports/scheduled', { token: adminToken });
      const hasConfigs =
        res.body && typeof res.body === 'object' && Array.isArray(res.body.configs);
      const pass = res.status === 200 && hasConfigs;
      return { pass, detail: `status=${res.status}, configsArray=${hasConfigs}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'Scheduled export create',
    () => {
      const res = runCurl('POST', '/api/admin/exports/scheduled', {
        token: adminToken,
        body: {
          export_name: 'Smoke Export',
          export_format: 'csv',
          cron_expression: '0 6 * * 1',
          delivery_method: 'log',
          delivery_target: '',
        },
      });
      const id = res.body && typeof res.body === 'object' ? res.body.id : null;
      if (res.status === 200 && id) {
        scheduledExportId = id;
      }
      const pass = res.status === 200 && !!id;
      return { pass, detail: `status=${res.status}, id=${id}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'Scheduled export delete',
    () => {
      const res = runCurl('DELETE', `/api/admin/exports/scheduled/${scheduledExportId}`, {
        token: adminToken,
      });
      const pass = res.status === 200;
      return { pass, detail: `status=${res.status}, id=${scheduledExportId}` };
    },
    {
      requiresAdmin: true,
      skipWhen: () => !scheduledExportId,
      skipReason: 'Depends on test 19',
    }
  );

  runTest(
    'Report A1 case-volume',
    () => {
      const res = runCurl('GET', '/api/reports/case-volume', { token: adminToken });
      const hasData = res.body && typeof res.body === 'object' && res.body.data !== undefined;
      const pass = res.status === 200 && hasData;
      return { pass, detail: `status=${res.status}, hasData=${hasData}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'Report A2 case-status',
    () => {
      const res = runCurl('GET', '/api/reports/case-status', { token: adminToken });
      const hasData = res.body && typeof res.body === 'object' && res.body.data !== undefined;
      const pass = res.status === 200 && hasData;
      return { pass, detail: `status=${res.status}, hasData=${hasData}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'Report A3 case-type',
    () => {
      const res = runCurl('GET', '/api/reports/case-type', { token: adminToken });
      const hasData = res.body && typeof res.body === 'object' && res.body.data !== undefined;
      const pass = res.status === 200 && hasData;
      return { pass, detail: `status=${res.status}, hasData=${hasData}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'Report A5 case-assignee',
    () => {
      const res = runCurl('GET', '/api/reports/case-assignee', { token: adminToken });
      const hasData = res.body && typeof res.body === 'object' && res.body.data !== undefined;
      const pass = res.status === 200 && hasData;
      return { pass, detail: `status=${res.status}, hasData=${hasData}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'Report B1 user-activity',
    () => {
      const res = runCurl('GET', '/api/reports/user-activity', { token: adminToken });
      const hasData = res.body && typeof res.body === 'object' && res.body.data !== undefined;
      const pass = res.status === 200 && hasData;
      return { pass, detail: `status=${res.status}, hasData=${hasData}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'Report B3 module-usage',
    () => {
      const res = runCurl('GET', '/api/reports/module-usage', { token: adminToken });
      const hasData = res.body && typeof res.body === 'object' && res.body.data !== undefined;
      const pass = res.status === 200 && hasData;
      return { pass, detail: `status=${res.status}, hasData=${hasData}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'Report B7 integration-sync',
    () => {
      const res = runCurl('GET', '/api/reports/integration-sync', { token: adminToken });
      const hasData = res.body && typeof res.body === 'object' && res.body.data !== undefined;
      const pass = res.status === 200 && hasData;
      return { pass, detail: `status=${res.status}, hasData=${hasData}` };
    },
    { requiresAdmin: true }
  );

  runTest(
    'Report B8 audit-summary',
    () => {
      const res = runCurl('GET', '/api/reports/audit-summary', { token: adminToken });
      const hasData = res.body && typeof res.body === 'object' && res.body.data !== undefined;
      const pass = res.status === 200 && hasData;
      return { pass, detail: `status=${res.status}, hasData=${hasData}` };
    },
    { requiresAdmin: true }
  );

  runTest('ESLint hooks rule configured', () => {
    const exists = fs.existsSync(FRONTEND_ESLINT_PATH);
    let hasReactHooks = false;
    if (exists) {
      const content = fs.readFileSync(FRONTEND_ESLINT_PATH, 'utf8');
      hasReactHooks = content.includes('react-hooks');
    }
    const pass = exists && hasReactHooks;
    return { pass, detail: `exists=${exists}, hasReactHooks=${hasReactHooks}` };
  });

  runTest('Scheduler accessible by superadmin', () => {
    const res = runCurl('GET', '/api/admin/scheduler/jobs', { token: saToken });
    const pass = res.status === 200;
    return { pass, detail: `status=${res.status}` };
  });

  const passCount = results.filter((row) => row.pass).length;
  console.log(`SPRINT 12 SMOKE: ${passCount}/30 PASS`);

  if (passCount !== 30) {
    process.exitCode = 1;
  }
}

run();
