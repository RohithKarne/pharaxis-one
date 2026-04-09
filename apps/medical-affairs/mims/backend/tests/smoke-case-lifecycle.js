'use strict';

const { execSync } = require('child_process');

const BASE_URL = 'http://localhost:3000';

function escapeSingleQuotes(value) {
  return value.replace(/'/g, `"'"'`);
}

function runCurl(method, endpoint, { token, body } = {}) {
  let cmd = `curl -s -w "HTTPSTATUS:%{http_code}" -X ${method} "${BASE_URL}${endpoint}"`;

  if (token) {
    cmd += ` -H "Authorization: Bearer ${token}"`;
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

function run() {
  const results = [];
  const email = 'vanaja_admin@reviewco.com';
  const password = 'Manager@123';

  let challengeToken = null;
  let token = null;
  let caseId = null;

  function runTest(name, fn, options = {}) {
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

  runTest('Admin login', () => {
    const res = runCurl('POST', '/api/auth/login', { body: { email, password } });
    const hasChallengeToken = res.body && typeof res.body === 'object' && !!res.body.challengeToken;
    if (hasChallengeToken) {
      challengeToken = res.body.challengeToken;
    }
    const pass = res.status === 200 && hasChallengeToken;
    return { pass, detail: `status=${res.status}, challengeToken=${hasChallengeToken}` };
  });

  runTest('2FA skip-setup', () => {
    const res = runCurl('POST', '/api/auth/2fa/skip-setup', { body: { challengeToken } });
    const hasToken = res.body && typeof res.body === 'object' && !!res.body.token;
    if (hasToken) {
      token = res.body.token;
    }
    const pass = res.status === 200 && hasToken;
    return { pass, detail: `status=${res.status}, token=${hasToken}` };
  });

  runTest('Get workflow states', () => {
    const res = runCurl('GET', '/api/admin/workflow-states', { token });
    const pass = (res.status === 200 || res.status === 404) && res.status !== 500;
    return { pass, detail: `Workflow states endpoint status=${res.status}` };
  });

  runTest('Create case', () => {
    const res = runCurl('POST', '/api/cases', {
      token,
      body: {
        case_type: 'MI',
        org_id: 1,
        site_id: 1,
        priority: 'normal',
        intake_channel: 'manual',
        date_received: '2026-04-03',
      },
    });
    const hasId = res.body && typeof res.body === 'object' && !!res.body.id;
    if (hasId) {
      caseId = res.body.id;
    }
    const pass = (res.status === 200 || res.status === 201) && hasId;
    return { pass, detail: `status=${res.status}, caseId=${hasId ? caseId : 'none'}` };
  });

  const skipIfNoCaseId = () => !caseId;

  runTest(
    'Get created case',
    () => {
      const res = runCurl('GET', `/api/cases/${caseId}`, { token });
      const hasCaseObject = res.body && typeof res.body === 'object';
      const pass = res.status === 200 && hasCaseObject;
      return { pass, detail: `status=${res.status}, caseObject=${hasCaseObject}` };
    },
    { skipWhen: skipIfNoCaseId, skipReason: 'Create case failed' }
  );

  runTest(
    'Update case priority',
    () => {
      const res = runCurl('PUT', `/api/cases/${caseId}`, { token, body: { priority: 'high' } });
      const pass = res.status === 200;
      return { pass, detail: `status=${res.status}` };
    },
    { skipWhen: skipIfNoCaseId, skipReason: 'Create case failed' }
  );

  runTest(
    'Update case description',
    () => {
      const res = runCurl('PUT', `/api/cases/${caseId}`, {
        token,
        body: { description: 'Lifecycle smoke test case' },
      });
      const pass = res.status === 200;
      return { pass, detail: `status=${res.status}` };
    },
    { skipWhen: skipIfNoCaseId, skipReason: 'Create case failed' }
  );

  runTest(
    'Workflow engine reachable',
    () => {
      const res = runCurl('PUT', `/api/cases/${caseId}`, { token, body: { status_id: null } });
      const pass = (res.status === 200 || res.status === 400) && res.status !== 500;
      return { pass, detail: `status=${res.status}` };
    },
    { skipWhen: skipIfNoCaseId, skipReason: 'Create case failed' }
  );

  runTest(
    'Get case after updates',
    () => {
      const res = runCurl('GET', `/api/cases/${caseId}`, { token });
      const currentPriority = res.body && typeof res.body === 'object' ? res.body.priority : undefined;
      const pass = res.status === 200 && currentPriority === 'high';
      return { pass, detail: `status=${res.status}, priority=${currentPriority}` };
    },
    { skipWhen: skipIfNoCaseId, skipReason: 'Create case failed' }
  );

  runTest(
    'Case delete',
    () => {
      const res = runCurl('DELETE', `/api/cases/${caseId}`, { token });
      const pass = (res.status === 200 || res.status === 404) && res.status !== 500;
      return { pass, detail: `status=${res.status}` };
    },
    { skipWhen: skipIfNoCaseId, skipReason: 'Create case failed' }
  );

  const passCount = results.filter((r) => r.pass).length;
  console.log(`\nCASE LIFECYCLE SMOKE: ${passCount}/10 PASS`);
}

run();
