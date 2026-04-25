'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_URL = 'http://localhost:3000';
const INTEGRATION_ENGINE_PATH = path.resolve(__dirname, '../services/integrationEngine.js');

function escapeSingleQuotes(value) {
  return value.replace(/'/g, `'"'"'`);
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
  const parsedBody = JSON.parse(parts[0]);
  const status = parseInt(parts[1], 10);
  return { body: parsedBody, status };
}

function printResult(row) {
  console.log(`${row.pass ? 'PASS' : 'FAIL'} - ${row.name} (${row.detail})`);
}

function run() {
  const results = [];
  let saToken = null;
  let adminToken = null;
  let createdId = null;

  try {
    const saLogin = runCurl('POST', '/api/auth/login', {
      body: { email: 'superadmin', password: '__SET_SMOKE_TEST_PASSWORD__' },
    });

    if (saLogin.status !== 200 || !saLogin.body || !saLogin.body.token) {
      throw new Error(`Superadmin login failed. status=${saLogin.status}`);
    }
    saToken = saLogin.body.token;

    const adminLogin = runCurl('POST', '/api/auth/login', {
      body: { email: 'rohithreddy480@gmail.com', password: '__SET_SMOKE_TEST_PASSWORD__' },
    });

    if (
      adminLogin.status !== 200 ||
      !adminLogin.body ||
      (!adminLogin.body.token && !adminLogin.body.challengeToken)
    ) {
      throw new Error(`Admin login failed. status=${adminLogin.status}`);
    }
    adminToken = adminLogin.body.token || adminLogin.body.challengeToken;
  } catch (err) {
    console.log(`FAIL - Precondition login (${err.message})`);
    console.log('0 PASS | 1 FAIL');
    process.exit(1);
  }

  const tests = [
    {
      name: 'TEST 1 — GET /api/health returns 200',
      run: () => {
        const res = runCurl('GET', '/api/health');
        const pass = res.status === 200;
        return { pass, detail: `status=${res.status}` };
      },
    },
    {
      name: 'TEST 2 — GET /api/v1/superadmin/integrations with saToken returns 200',
      run: () => {
        const res = runCurl('GET', '/api/v1/superadmin/integrations', { token: saToken });
        const pass = res.status === 200;
        return { pass, detail: `status=${res.status}` };
      },
    },
    {
      name: 'TEST 3 — GET /api/superadmin/integrations returns integrations array',
      run: () => {
        const res = runCurl('GET', '/api/superadmin/integrations', { token: saToken });
        const isArray = res.body && Array.isArray(res.body.integrations);
        const pass = res.status === 200 && isArray;
        return { pass, detail: `status=${res.status}, integrationsArray=${isArray}` };
      },
    },
    {
      name: 'TEST 4 — export/cases without x-api-key returns 401',
      run: () => {
        const res = runCurl('GET', '/api/integrations/export/cases');
        const pass = res.status === 401;
        return { pass, detail: `status=${res.status}` };
      },
    },
    {
      name: 'TEST 5 — export/cases with invalid x-api-key returns 401',
      run: () => {
        const res = runCurl('GET', '/api/integrations/export/cases', { apiKey: '__SET_INVALID_TEST_API_KEY__' });
        const pass = res.status === 401;
        return { pass, detail: `status=${res.status}` };
      },
    },
    {
      name: 'TEST 6 — integrationEngine.js file exists',
      run: () => {
        const exists = fs.existsSync(INTEGRATION_ENGINE_PATH);
        return { pass: exists, detail: `path=${INTEGRATION_ENGINE_PATH}, exists=${exists}` };
      },
    },
    {
      name: 'TEST 7 — integrationEngine exports fireIntegrationEvent function',
      run: () => {
        if (!fs.existsSync(INTEGRATION_ENGINE_PATH)) {
          return { pass: false, detail: 'integrationEngine.js not found' };
        }
        const integrationEngine = require(INTEGRATION_ENGINE_PATH);
        const hasFn = typeof integrationEngine.fireIntegrationEvent === 'function';
        return { pass: hasFn, detail: `typeof fireIntegrationEvent=${typeof integrationEngine.fireIntegrationEvent}` };
      },
    },
    {
      name: 'TEST 8 — POST /api/superadmin/integrations creates integration',
      run: () => {
        const payload = {
          org_id: 26,
          integration_type: 'veeva_vault',
          endpoint_url: 'https://test.veeva.com/api',
          api_key: 'test-api-key-sprint11',
          enabled: 1,
          event_triggers: ['case.created', 'case.updated'],
          org_override_allowed: 0,
        };
        const res = runCurl('POST', '/api/superadmin/integrations', { token: saToken, body: payload });
        const okStatus = res.status === 201 || res.status === 200;
        const idNum = res.body && typeof res.body.id === 'number';
        if (okStatus && idNum) {
          createdId = res.body.id;
        }
        const pass = okStatus && idNum;
        return { pass, detail: `status=${res.status}, id=${res.body && res.body.id}` };
      },
    },
    {
      name: 'TEST 9 — created veeva_vault integration appears in superadmin list',
      run: () => {
        const res = runCurl('GET', '/api/superadmin/integrations', { token: saToken });
        const list = res.body && Array.isArray(res.body.integrations) ? res.body.integrations : [];
        const found = list.some((row) => row && row.id === createdId && row.integration_type === 'veeva_vault');
        const pass = res.status === 200 && found;
        return { pass, detail: `status=${res.status}, foundCreatedId=${found}, createdId=${createdId}` };
      },
    },
    {
      name: 'TEST 10 — PUT /api/superadmin/integrations/:id updates integration',
      run: () => {
        if (!createdId) {
          return { pass: false, detail: 'createdId missing from TEST 8' };
        }
        const payload = {
          endpoint_url: 'https://test-updated.veeva.com/api',
          api_key: 'test-api-key-sprint11',
          enabled: 1,
          event_triggers: ['case.created'],
          org_override_allowed: 0,
        };
        const res = runCurl('PUT', `/api/superadmin/integrations/${createdId}`, { token: saToken, body: payload });
        const pass = res.status === 200;
        return { pass, detail: `status=${res.status}, id=${createdId}` };
      },
    },
    {
      name: 'TEST 11 — GET /api/admin/integrations with adminToken returns array',
      run: () => {
        const res = runCurl('GET', '/api/admin/integrations', { token: adminToken });
        const isArray = res.body && Array.isArray(res.body.integrations);
        const pass = res.status === 200 && isArray;
        return { pass, detail: `status=${res.status}, integrationsArray=${isArray}` };
      },
    },
    {
      name: 'TEST 12 — admin toggle blocked when org_override_allowed=0',
      run: () => {
        if (!createdId) {
          return { pass: false, detail: 'createdId missing from TEST 8' };
        }
        const res = runCurl('PUT', `/api/admin/integrations/${createdId}/toggle`, {
          token: adminToken,
          body: { enabled: 0 },
        });
        const pass = res.status === 403;
        return { pass, detail: `status=${res.status}, id=${createdId}` };
      },
    },
    {
      name: 'TEST 13 — GET /api/v1/admin/integrations with adminToken returns 200',
      run: () => {
        const res = runCurl('GET', '/api/v1/admin/integrations', { token: adminToken });
        const pass = res.status === 200;
        return { pass, detail: `status=${res.status}` };
      },
    },
    {
      name: 'TEST 14 — export/cases with valid api key returns export payload',
      run: () => {
        const res = runCurl('GET', '/api/integrations/export/cases', { apiKey: 'test-api-key-sprint11' });
        const body = res.body || {};
        const hasFields =
          Object.prototype.hasOwnProperty.call(body, 'org_id') &&
          Object.prototype.hasOwnProperty.call(body, 'exported_at') &&
          Object.prototype.hasOwnProperty.call(body, 'count') &&
          Object.prototype.hasOwnProperty.call(body, 'cases');
        const pass = res.status === 200 && hasFields;
        return { pass, detail: `status=${res.status}, hasFields=${hasFields}` };
      },
    },
    {
      name: 'TEST 15 — DELETE /api/superadmin/integrations/:id removes created integration',
      run: () => {
        if (!createdId) {
          return { pass: false, detail: 'createdId missing from TEST 8' };
        }
        const res = runCurl('DELETE', `/api/superadmin/integrations/${createdId}`, { token: saToken });
        const pass = res.status === 200;
        return { pass, detail: `status=${res.status}, id=${createdId}` };
      },
    },
  ];

  for (const test of tests) {
    try {
      const outcome = test.run();
      const row = { name: test.name, pass: !!outcome.pass, detail: outcome.detail || '' };
      results.push(row);
      printResult(row);
    } catch (err) {
      const row = { name: test.name, pass: false, detail: err && err.message ? err.message : String(err) };
      results.push(row);
      printResult(row);
    }
  }

  const passCount = results.filter((row) => row.pass).length;
  const failCount = results.length - passCount;
  console.log(`${passCount} PASS | ${failCount} FAIL`);

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

run();
