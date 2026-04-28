# Pharaxis One — Smoke Test Codex Prompts

## Section 1 — File Header
- Title: Pharaxis One — Smoke Test Codex Prompts
- Date: 2026-04-12
- Platform context: Pharaxis One — 5 apps deployed on AWS EC2 at permanent IP 13.205.213.128
- All backends: Node.js + Express APIs (app-specific DB backends)
- All frontends: React (Vue for QMS) served as static files via Nginx
- Backend health check pattern: `GET /appname/api/health` → HTTP 200
- Note: Codex smoke tests use Node.js native `fetch` (Node 22) to hit live API endpoints directly — no browser needed

### QA Team Instructions
1. For each app section, copy only the text between the `---` delimiters.
2. Paste it into Codex exactly as-is.
3. Let Codex create the Node.js script, run it immediately, and print PASS/FAIL output.
4. Capture the console output and summary for your QA report.
5. Use the final combined prompt for a quick all-app health snapshot.

## Section 2 — 5 App Smoke Test Prompts

## App 1 — MIMS Smoke Test
### Codex Prompt (copy everything below this line into Codex)
---
[PROMPT STARTS HERE]
You are running a live API smoke test for the MIMS app.

Context:
- Frontend: http://13.205.213.128/mims/
- Superadmin URL: http://13.205.213.128/mims/superadmin.html
- API base: http://13.205.213.128/mims/api
- Admin login: vanaja_admin@reviewco.com / Test@1234
- Superadmin login: username superadmin / Manager@123

Write a Node.js 22 script named `smoke_mims.js` using native `fetch` (no imports), run it immediately, and print clear `✅ PASS` / `❌ FAIL` lines for each test plus a summary.

Test cases to implement:
1. `GET /health` → expect HTTP 200 + JSON response
2. `POST /auth/login` (admin login) → expect HTTP 200 + JSON response
3. If login returns `challengeToken` without JWT, call `POST /auth/2fa/skip-setup` to obtain JWT
4. `GET /cases` with admin Bearer JWT → expect HTTP 200 + JSON response
5. `GET /users` with admin Bearer JWT → expect HTTP 200 + JSON response
6. `GET /admin/picklists` with admin Bearer JWT → expect HTTP 200 + JSON response

Use this exact script:

```js
const API_BASE = 'http://13.205.213.128/mims/api';

const results = [];

function logResult(name, pass, details = '') {
  results.push({ name, pass, details });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'} - ${name}${details ? ` (${details})` : ''}`);
}

function extractToken(payload) {
  const candidates = [
    payload?.token,
    payload?.jwt,
    payload?.accessToken,
    payload?.authToken,
    payload?.data?.token,
    payload?.data?.jwt,
    payload?.data?.accessToken,
    payload?.result?.token,
    payload?.result?.accessToken,
    payload?.user?.token,
  ];
  return candidates.find((v) => typeof v === 'string' && v.trim().length > 0) || null;
}

async function requestJson(testName, path, { method = 'GET', body, token, expectedStatus = 200, expectedStatuses } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const raw = await res.text();
    let json = null;
    let isJsonObjectOrArray = false;

    try {
      json = raw ? JSON.parse(raw) : null;
      isJsonObjectOrArray = json !== null && typeof json === 'object';
    } catch {
      isJsonObjectOrArray = false;
    }

    const allowedStatuses = Array.isArray(expectedStatuses) && expectedStatuses.length > 0
      ? expectedStatuses
      : [expectedStatus];
    const pass = allowedStatuses.includes(res.status) && isJsonObjectOrArray;
    const details = `status=${res.status}, expected=${allowedStatuses.join('|')}, json=${isJsonObjectOrArray ? 'ok' : 'invalid'}`;
    logResult(testName, pass, details);

    return { res, json, raw };
  } catch (err) {
    logResult(testName, false, `request_error=${err.message}`);
    return { res: null, json: null, raw: '' };
  }
}

(async () => {
  await requestJson('Health check GET /health', '/health');

  const adminLogin = await requestJson('Admin login POST /auth/login', '/auth/login', {
    method: 'POST',
    body: { email: 'vanaja_admin@reviewco.com', password: 'Test@1234' },
  });
  let adminToken = extractToken(adminLogin.json);

  if (!adminToken && adminLogin?.json?.challengeToken && adminLogin?.json?.twoFactorRequired === false) {
    const skipSetup = await requestJson('POST /auth/2fa/skip-setup (optional setup bypass)', '/auth/2fa/skip-setup', {
      method: 'POST',
      body: { challengeToken: adminLogin.json.challengeToken },
    });
    adminToken = extractToken(skipSetup.json);
  }

  logResult('Admin login JWT present', Boolean(adminToken), adminToken ? 'token_found=yes' : 'token_found=no');

  await requestJson('GET /cases (admin auth)', '/cases', {
    token: adminToken || 'invalid-token',
  });

  await requestJson('GET /users (admin auth)', '/users', {
    token: adminToken || 'invalid-token',
  });

  await requestJson('GET /admin/picklists (admin auth)', '/admin/picklists', {
    token: adminToken || 'invalid-token',
  });

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log(`\nSummary: ${passed} passed, ${failed} failed, total ${results.length}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter((x) => !x.pass)) {
      console.log(`- ${r.name}${r.details ? ` :: ${r.details}` : ''}`);
    }
  }

  process.exit(failed === 0 ? 0 : 1);
})();
```

Then run:

```bash
node smoke_mims.js
```

Return:
1. Full console output
2. PASS/FAIL summary
3. Any failures with status code and response snippet
[PROMPT ENDS HERE]
---

## App 2 — CP Portal Smoke Test
### Codex Prompt (copy everything below this line into Codex)
---
[PROMPT STARTS HERE]
You are running a live API smoke test for the CP Portal app.

Context:
- Frontend: http://13.205.213.128/cp-portal/
- API base: http://13.205.213.128/cp-portal/api
- Admin login: cpadmin / Admin@123

Write a Node.js 22 script named `smoke_cp_portal.js` using native `fetch` (no imports), run it immediately, and print clear `✅ PASS` / `❌ FAIL` lines for each test plus a summary.

Test cases to implement:
1. `GET /health` → expect HTTP 200 + JSON response
2. `POST /admin/auth/login` (admin login) → expect HTTP 200 + JSON response + JWT present
3. `GET /admin/auth/me` with admin Bearer JWT → expect HTTP 200 + JSON response
4. `GET /admin/clients` with admin Bearer JWT → expect HTTP 200 + JSON response

Use this exact script:

```js
const API_BASE = 'http://13.205.213.128/cp-portal/api';

const results = [];

function logResult(name, pass, details = '') {
  results.push({ name, pass, details });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'} - ${name}${details ? ` (${details})` : ''}`);
}

function extractToken(payload) {
  const candidates = [
    payload?.token,
    payload?.jwt,
    payload?.accessToken,
    payload?.authToken,
    payload?.data?.token,
    payload?.data?.jwt,
    payload?.data?.accessToken,
    payload?.result?.token,
    payload?.result?.accessToken,
    payload?.user?.token,
  ];
  return candidates.find((v) => typeof v === 'string' && v.trim().length > 0) || null;
}

async function requestJson(testName, path, { method = 'GET', body, token, expectedStatus = 200, expectedStatuses } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const raw = await res.text();
    let json = null;
    let isJsonObjectOrArray = false;

    try {
      json = raw ? JSON.parse(raw) : null;
      isJsonObjectOrArray = json !== null && typeof json === 'object';
    } catch {
      isJsonObjectOrArray = false;
    }

    const allowedStatuses = Array.isArray(expectedStatuses) && expectedStatuses.length > 0
      ? expectedStatuses
      : [expectedStatus];
    const pass = allowedStatuses.includes(res.status) && isJsonObjectOrArray;
    const details = `status=${res.status}, expected=${allowedStatuses.join('|')}, json=${isJsonObjectOrArray ? 'ok' : 'invalid'}`;
    logResult(testName, pass, details);

    return { res, json, raw };
  } catch (err) {
    logResult(testName, false, `request_error=${err.message}`);
    return { res: null, json: null, raw: '' };
  }
}

(async () => {
  await requestJson('Health check GET /health', '/health');

  const adminLogin = await requestJson('Admin login POST /admin/auth/login', '/admin/auth/login', {
    method: 'POST',
    body: { email: 'cpadmin', password: 'Admin@123' },
  });

  const adminToken = extractToken(adminLogin.json);
  logResult('Admin login JWT present', Boolean(adminToken), adminToken ? 'token_found=yes' : 'token_found=no');

  await requestJson('GET /admin/auth/me (admin auth)', '/admin/auth/me', {
    token: adminToken || 'invalid-token',
  });

  await requestJson('GET /admin/clients (admin auth)', '/admin/clients', {
    token: adminToken || 'invalid-token',
  });

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log(`\nSummary: ${passed} passed, ${failed} failed, total ${results.length}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter((x) => !x.pass)) {
      console.log(`- ${r.name}${r.details ? ` :: ${r.details}` : ''}`);
    }
  }

  process.exit(failed === 0 ? 0 : 1);
})();
```

Then run:

```bash
node smoke_cp_portal.js
```

Return:
1. Full console output
2. PASS/FAIL summary
3. Any failures with status code and response snippet
[PROMPT ENDS HERE]
---

## App 3 — Pharaxis Vault Smoke Test
### Codex Prompt (copy everything below this line into Codex)
---
[PROMPT STARTS HERE]
You are running a live API smoke test for the Pharaxis Vault app.

Context:
- Frontend: http://13.205.213.128/vault/
- API base: http://13.205.213.128/vault/api
- Admin login: admin@novartis.local / Admin@123
- Author login: author@novartis.local / Author@123

Write a Node.js 22 script named `smoke_vault.js` using native `fetch` (no imports), run it immediately, and print clear `✅ PASS` / `❌ FAIL` lines for each test plus a summary.

Test cases to implement:
1. `GET /health` → expect HTTP 200 + JSON response
2. `POST /auth/login` (org admin login) → expect HTTP 200 + JSON response + JWT present
3. `GET /dossiers` with org admin Bearer JWT → expect HTTP 200 + JSON response
4. `GET /users` with org admin Bearer JWT → expect HTTP 200 + JSON response

Use this exact script:

```js
const API_BASE = 'http://13.205.213.128/vault/api';

const results = [];

function logResult(name, pass, details = '') {
  results.push({ name, pass, details });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'} - ${name}${details ? ` (${details})` : ''}`);
}

function extractToken(payload) {
  const candidates = [
    payload?.token,
    payload?.jwt,
    payload?.accessToken,
    payload?.authToken,
    payload?.data?.token,
    payload?.data?.jwt,
    payload?.data?.accessToken,
    payload?.result?.token,
    payload?.result?.accessToken,
    payload?.user?.token,
  ];
  return candidates.find((v) => typeof v === 'string' && v.trim().length > 0) || null;
}

async function requestJson(testName, path, { method = 'GET', body, token, expectedStatus = 200 } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const raw = await res.text();
    let json = null;
    let isJsonObjectOrArray = false;

    try {
      json = raw ? JSON.parse(raw) : null;
      isJsonObjectOrArray = json !== null && typeof json === 'object';
    } catch {
      isJsonObjectOrArray = false;
    }

    const pass = res.status === expectedStatus && isJsonObjectOrArray;
    const details = `status=${res.status}, expected=${expectedStatus}, json=${isJsonObjectOrArray ? 'ok' : 'invalid'}`;
    logResult(testName, pass, details);

    return { res, json, raw };
  } catch (err) {
    logResult(testName, false, `request_error=${err.message}`);
    return { res: null, json: null, raw: '' };
  }
}

(async () => {
  await requestJson('Health check GET /health', '/health');

  const adminLogin = await requestJson('Org admin login POST /auth/login', '/auth/login', {
    method: 'POST',
    body: { email: 'admin@novartis.local', password: 'Admin@123', orgSlug: 'novartis' },
  });

  const adminToken = extractToken(adminLogin.json);
  logResult('Org admin login JWT present', Boolean(adminToken), adminToken ? 'token_found=yes' : 'token_found=no');

  await requestJson('GET /dossiers (admin auth)', '/dossiers', {
    token: adminToken || 'invalid-token',
  });

  await requestJson('GET /users (admin auth)', '/users', {
    token: adminToken || 'invalid-token',
  });

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log(`\nSummary: ${passed} passed, ${failed} failed, total ${results.length}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter((x) => !x.pass)) {
      console.log(`- ${r.name}${r.details ? ` :: ${r.details}` : ''}`);
    }
  }

  process.exit(failed === 0 ? 0 : 1);
})();
```

Then run:

```bash
node smoke_vault.js
```

Return:
1. Full console output
2. PASS/FAIL summary
3. Any failures with status code and response snippet
[PROMPT ENDS HERE]
---

## App 4 — AI Agent Smoke Test
### Codex Prompt (copy everything below this line into Codex)
---
[PROMPT STARTS HERE]
You are running a live API smoke test for the AI Agent app.

Context:
- Frontend: http://13.205.213.128/ai-agent/
- API base: http://13.205.213.128/ai-agent/api/v1/agent
- Note: No seeded default user exists. Validate health endpoint and unauthenticated protection behavior.

Write a Node.js 22 script named `smoke_ai_agent.js` using native `fetch` (no imports), run it immediately, and print clear `✅ PASS` / `❌ FAIL` lines for each test plus a summary.

Test cases to implement:
1. `GET /health` → expect HTTP 200 + JSON response
2. `POST /query` without token → expect HTTP 401 + JSON response

Use this exact script:

```js
const API_BASE = 'http://13.205.213.128/ai-agent/api/v1/agent';

const results = [];

function logResult(name, pass, details = '') {
  results.push({ name, pass, details });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'} - ${name}${details ? ` (${details})` : ''}`);
}

async function requestJson(testName, path, { method = 'GET', body, expectedStatus = 200 } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const raw = await res.text();

    let json = null;
    let isJsonObjectOrArray = false;
    try {
      json = raw ? JSON.parse(raw) : null;
      isJsonObjectOrArray = json !== null && typeof json === 'object';
    } catch {
      isJsonObjectOrArray = false;
    }

    const pass = res.status === expectedStatus && isJsonObjectOrArray;
    const details = `status=${res.status}, expected=${expectedStatus}, json=${isJsonObjectOrArray ? 'ok' : 'invalid'}`;
    logResult(testName, pass, details);

    return { res, json, raw };
  } catch (err) {
    logResult(testName, false, `request_error=${err.message}`);
    return { res: null, json: null, raw: '' };
  }
}

(async () => {
  await requestJson('Health check GET /health', '/health', { expectedStatus: 200 });
  await requestJson('POST /query without token expects 401', '/query', {
    method: 'POST',
    body: {
      org_id: 1,
      app_source: 'mims',
      query_type: 'document_search',
      payload: { query: 'smoke test' },
    },
    expectedStatus: 401,
  });

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log(`\nSummary: ${passed} passed, ${failed} failed, total ${results.length}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter((x) => !x.pass)) {
      console.log(`- ${r.name}${r.details ? ` :: ${r.details}` : ''}`);
    }
  }

  process.exit(failed === 0 ? 0 : 1);
})();
```

Then run:

```bash
node smoke_ai_agent.js
```

Return:
1. Full console output
2. PASS/FAIL summary
3. Any failures with status code and response snippet
[PROMPT ENDS HERE]
---

## App 5 — QMS Smoke Test
### Codex Prompt (copy everything below this line into Codex)
---
[PROMPT STARTS HERE]
You are running a live API smoke test for the QMS app.

Context:
- Frontend: http://13.205.213.128/qms/
- API base: http://13.205.213.128/qms/api
- Admin login: admin@pharaxis.local / Admin@123 / orgCode PHA_DEV

Write a Node.js 22 script named `smoke_qms.js` using native `fetch` (no imports), run it immediately, and print clear `✅ PASS` / `❌ FAIL` lines for each test plus a summary.

Test cases to implement:
1. `GET /health` → expect HTTP 200 + JSON response
2. `POST /auth/login` → expect HTTP 200 + JSON response + JWT present
3. `GET /protected/me` with Bearer JWT → expect HTTP 200 + JSON response
4. `GET /document-control/documents` with Bearer JWT → expect HTTP 200 + JSON response

Use this exact script:

```js
const API_BASE = 'http://13.205.213.128/qms/api';

const results = [];

function logResult(name, pass, details = '') {
  results.push({ name, pass, details });
  console.log(`${pass ? '✅ PASS' : '❌ FAIL'} - ${name}${details ? ` (${details})` : ''}`);
}

function extractToken(payload) {
  const candidates = [
    payload?.token,
    payload?.jwt,
    payload?.accessToken,
    payload?.authToken,
    payload?.data?.token,
    payload?.data?.jwt,
    payload?.data?.accessToken,
    payload?.result?.token,
    payload?.result?.accessToken,
    payload?.user?.token,
  ];
  return candidates.find((v) => typeof v === 'string' && v.trim().length > 0) || null;
}

async function requestJson(testName, path, { method = 'GET', body, token, expectedStatus = 200 } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const raw = await res.text();
    let json = null;
    let isJsonObjectOrArray = false;

    try {
      json = raw ? JSON.parse(raw) : null;
      isJsonObjectOrArray = json !== null && typeof json === 'object';
    } catch {
      isJsonObjectOrArray = false;
    }

    const pass = res.status === expectedStatus && isJsonObjectOrArray;
    const details = `status=${res.status}, expected=${expectedStatus}, json=${isJsonObjectOrArray ? 'ok' : 'invalid'}`;
    logResult(testName, pass, details);

    return { res, json, raw };
  } catch (err) {
    logResult(testName, false, `request_error=${err.message}`);
    return { res: null, json: null, raw: '' };
  }
}

(async () => {
  await requestJson('Health check GET /health', '/health');

  const login = await requestJson('Login POST /auth/login', '/auth/login', {
    method: 'POST',
    body: { email: 'admin@pharaxis.local', password: 'Admin@123', orgCode: 'PHA_DEV' },
  });

  const token = extractToken(login.json);
  logResult('Login JWT present', Boolean(token), token ? 'token_found=yes' : 'token_found=no');

  await requestJson('GET /protected/me (authenticated)', '/protected/me', {
    token: token || 'invalid-token',
  });

  await requestJson('GET /document-control/documents (authenticated)', '/document-control/documents', {
    token: token || 'invalid-token',
  });

  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  console.log(`\nSummary: ${passed} passed, ${failed} failed, total ${results.length}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    for (const r of results.filter((x) => !x.pass)) {
      console.log(`- ${r.name}${r.details ? ` :: ${r.details}` : ''}`);
    }
  }

  process.exit(failed === 0 ? 0 : 1);
})();
```

Then run:

```bash
node smoke_qms.js
```

Return:
1. Full console output
2. PASS/FAIL summary
3. Any failures with status code and response snippet
[PROMPT ENDS HERE]
---

## Section 3 — All Apps Combined Prompt

## All Apps Combined — Quick Health Check
### Codex Prompt (copy everything below this line into Codex)
---
[PROMPT STARTS HERE]
You are running a quick health smoke test across all Pharaxis One apps.

Write a Node.js 22 script named `smoke_all_apps_health.js` using native `fetch` (no imports), run it immediately, print `✅ PASS` or `❌ FAIL` per app for `GET /api/health`, and print a final summary with total passing and failing apps.

Test these 5 health endpoints in sequence:
1. http://13.205.213.128/mims/api/health
2. http://13.205.213.128/cp-portal/api/health
3. http://13.205.213.128/vault/api/health
4. http://13.205.213.128/ai-agent/api/v1/agent/health
5. http://13.205.213.128/qms/api/health

Use this exact script:

```js
const checks = [
  { app: 'MIMS', url: 'http://13.205.213.128/mims/api/health' },
  { app: 'CP Portal', url: 'http://13.205.213.128/cp-portal/api/health' },
  { app: 'Pharaxis Vault', url: 'http://13.205.213.128/vault/api/health' },
  { app: 'AI Agent', url: 'http://13.205.213.128/ai-agent/api/v1/agent/health' },
  { app: 'QMS', url: 'http://13.205.213.128/qms/api/health' },
];

let passed = 0;
let failed = 0;

(async () => {
  for (const check of checks) {
    try {
      const res = await fetch(check.url);
      const raw = await res.text();
      let json = null;
      let isJsonObjectOrArray = false;

      try {
        json = raw ? JSON.parse(raw) : null;
        isJsonObjectOrArray = json !== null && typeof json === 'object';
      } catch {
        isJsonObjectOrArray = false;
      }

      const ok = res.status === 200 && isJsonObjectOrArray;
      if (ok) {
        passed += 1;
        console.log(`✅ PASS - ${check.app} health (${res.status})`);
      } else {
        failed += 1;
        console.log(`❌ FAIL - ${check.app} health (status=${res.status}, json=${isJsonObjectOrArray ? 'ok' : 'invalid'})`);
      }
    } catch (err) {
      failed += 1;
      console.log(`❌ FAIL - ${check.app} health (request_error=${err.message})`);
    }
  }

  console.log(`\nSummary: ${passed} passing apps, ${failed} failing apps, total ${checks.length}`);
  process.exit(failed === 0 ? 0 : 1);
})();
```

Then run:

```bash
node smoke_all_apps_health.js
```

Return:
1. Per-app PASS/FAIL output
2. Final count of passing and failing apps
3. Any failing app with status/error details
[PROMPT ENDS HERE]
---
