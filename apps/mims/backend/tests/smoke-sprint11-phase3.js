'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_URL = 'http://localhost:3000';

function escapeSingleQuotes(value) {
  return value.replace(/'/g, `"'"'"`);
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
  let createdIntegrationId = null;

  try {
    const saLogin = runCurl('POST', '/api/auth/login', {
      body: { email: 'superadmin', password: '__SET_SMOKE_TEST_PASSWORD__' },
    });

    if (saLogin.status !== 200 || !saLogin.body || !saLogin.body.token) {
      throw new Error(`Platform Admin login failed. status=${saLogin.status}`);
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
      name: 'TEST 1 — GET /api/admin/integrations/mir/config with adminToken returns 200 and has enabled field',
      run: () => {
        const res = runCurl('GET', '/api/admin/integrations/mir/config', { token: adminToken });
        const hasEnabled = !!(res.body && Object.prototype.hasOwnProperty.call(res.body, 'enabled'));
        const pass = res.status === 200 && hasEnabled;
        return { pass, detail: `status=${res.status}, hasEnabled=${hasEnabled}` };
      },
    },
    {
      name: 'TEST 2 — PUT /api/admin/integrations/mir/config saves config successfully',
      run: () => {
        const res = runCurl('PUT', '/api/admin/integrations/mir/config', {
          token: adminToken,
          body: {
            config: {
              endpoint_url: 'https://test-mir.example.com',
              api_key: 'test-key-123',
            },
          },
        });
        const message = res.body && res.body.message;
        const pass = res.status === 200 && !!message;
        return { pass, detail: `status=${res.status}, message=${message}` };
      },
    },
    {
      name: 'TEST 3 — GET /api/admin/integrations/mir/config returns saved config',
      run: () => {
        const res = runCurl('GET', '/api/admin/integrations/mir/config', { token: adminToken });
        const endpointUrl = res.body && res.body.config ? res.body.config.endpoint_url : undefined;
        const pass = res.status === 200 && !!res.body && !!res.body.config && endpointUrl === 'https://test-mir.example.com';
        return { pass, detail: `status=${res.status}, endpoint_url=${endpointUrl}` };
      },
    },
    {
      name: 'TEST 4 — GET /api/admin/cases/export without filters returns 200',
      run: () => {
        const runCurlRaw = (method, endpoint, { token, apiKey, body } = {}) => {
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
          const rawBody = parts[0];
          const status = parseInt(parts[1], 10);
          return { rawBody, status };
        };

        const res = runCurlRaw('GET', '/api/admin/cases/export', { token: adminToken });
        const pass = res.status === 200;
        return { pass, detail: `status=${res.status}` };
      },
    },
    {
      name: 'TEST 5 — GET /api/admin/cases/export with case_type=MI returns 200',
      run: () => {
        const runCurlRaw = (method, endpoint, { token, apiKey, body } = {}) => {
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
          const rawBody = parts[0];
          const status = parseInt(parts[1], 10);
          return { rawBody, status };
        };

        const res = runCurlRaw('GET', '/api/admin/cases/export?case_type=MI', { token: adminToken });
        const pass = res.status === 200;
        return { pass, detail: `status=${res.status}, case_type=MI` };
      },
    },
    {
      name: 'TEST 6 — GET /api/admin/cases/export with format=xlsx returns 400',
      run: () => {
        const res = runCurl('GET', '/api/admin/cases/export?format=xlsx', { token: adminToken });
        const error = res.body && res.body.error;
        const pass = res.status === 400 && !!error;
        return { pass, detail: `status=${res.status}, error=${error}` };
      },
    },
    {
      name: 'TEST 7 — POST /api/admin/platform/integrations creates crm integration for org 1',
      run: () => {
        const res = runCurl('POST', '/api/admin/platform/integrations', {
          token: saToken,
          body: {
            org_id: 1,
            integration_type: 'crm',
            enabled: 1,
            org_override_allowed: 0,
          },
        });
        if (res.status === 200 && res.body && res.body.id) {
          createdIntegrationId = res.body.id;
        }
        const pass = res.status === 200 && !!(res.body && res.body.id);
        return { pass, detail: `status=${res.status}, id=${res.body && res.body.id}` };
      },
    },
    {
      name: 'TEST 8 — Platform Admin enable: GET /api/admin/integrations/crm/config shows enabled=true',
      run: () => {
        if (!createdIntegrationId) {
          return { pass: false, detail: 'status=NA, enabled=NA (createdIntegrationId missing)' };
        }

        const putRes = runCurl('PUT', `/api/admin/platform/integrations/${createdIntegrationId}`, {
          token: saToken,
          body: { enabled: 1, org_override_allowed: 0 },
        });

        const getRes = runCurl('GET', '/api/admin/integrations/crm/config', { token: adminToken });
        const enabled = getRes.body && getRes.body.enabled;
        const pass = putRes.status === 200 && getRes.status === 200 && enabled === true;
        return { pass, detail: `status=${getRes.status}, enabled=${enabled}` };
      },
    },
    {
      name: 'TEST 9 — Cleanup: DELETE /api/admin/platform/integrations/:createdIntegrationId',
      run: () => {
        if (!createdIntegrationId) {
          return { pass: false, detail: 'status=NA (createdIntegrationId missing)' };
        }
        const res = runCurl('DELETE', `/api/admin/platform/integrations/${createdIntegrationId}`, { token: saToken });
        const pass = res.status === 200;
        return { pass, detail: `status=${res.status}` };
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

  if (failCount === 0) {
    console.log('ALL TESTS PASSED');
    process.exit(0);
  }

  process.exit(1);
}

run();
