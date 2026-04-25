'use strict';

const http = require('http');

const HOST = 'localhost';
const PORT = 3000;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requestJson(path, { method = 'GET', token, body } = {}) {
  return new Promise((resolve) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const headers = {};

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (payload !== null) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        host: HOST,
        port: PORT,
        path,
        method,
        headers,
        timeout: 10000,
      },
      (res) => {
        let raw = '';

        res.on('data', (chunk) => {
          raw += chunk;
        });

        res.on('end', () => {
          let json = null;
          let parseError = null;

          if (raw.trim().length > 0) {
            try {
              json = JSON.parse(raw);
            } catch (err) {
              parseError = err;
            }
          }

          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: json,
            raw,
            error: parseError,
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });

    req.on('error', (err) => {
      resolve({
        status: 0,
        headers: {},
        body: null,
        raw: '',
        error: err,
      });
    });

    if (payload !== null) {
      req.write(payload);
    }

    req.end();
  });
}

function extractSections(payload) {
  if (payload && Array.isArray(payload.sections)) return payload.sections;
  if (payload && payload.data && Array.isArray(payload.data.sections)) return payload.data.sections;
  return [];
}

function extractAllFields(sections) {
  const fields = [];
  for (const section of sections) {
    if (section && Array.isArray(section.fields)) {
      fields.push(...section.fields);
    }
  }
  return fields;
}

async function loginAndGetToken() {
  const loginCandidates = [
    { email: 'superadmin', password: '__SET_SMOKE_TEST_PASSWORD__' },
  ];

  const failures = [];

  for (const creds of loginCandidates) {
    const response = await requestJson('/api/auth/login', {
      method: 'POST',
      body: creds,
    });

    if (response.error) {
      failures.push(`${creds.email} => request error: ${response.error.message}`);
      continue;
    }

    if (response.status !== 200) {
      failures.push(`${creds.email} => status ${response.status}: ${response.raw || '<empty>'}`);
      continue;
    }

    if (response.body === null) {
      failures.push(`${creds.email} => response is not valid JSON`);
      continue;
    }

    const token =
      response.body.token ||
      response.body.jwt ||
      response.body.accessToken ||
      (response.body.data && (response.body.data.token || response.body.data.jwt || response.body.data.accessToken));

    if (!token) {
      failures.push(`${creds.email} => token missing in response`);
      continue;
    }

    return token;
  }

  throw new Error(`Login failed for all admin candidates: ${failures.join(' | ')}`);
}

async function runTest(results, name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail: detail || '' });
    console.log(`PASS - ${name}${detail ? `: ${detail}` : ''}`);
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    results.push({ name, ok: false, detail: message });
    console.log(`FAIL - ${name}: ${message}`);
  }
}

(async () => {
  const results = [];

  try {
    const token = await loginAndGetToken();

    await runTest(results, 'TEST 1 — form-config returns 200 for MI', async () => {
      const res = await requestJson('/api/cases/form-config?case_type=MI&org_id=1', { token });
      if (res.error) throw new Error(`Request error: ${res.error.message}`);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const sections = extractSections(res.body);
      assert(sections.length > 0, `Expected sections.length > 0, got ${sections.length}`);
      return `status=${res.status}, sections=${sections.length}`;
    });

    await runTest(results, 'TEST 2 — form-config returns 200 for AE', async () => {
      const res = await requestJson('/api/cases/form-config?case_type=AE&org_id=1', { token });
      if (res.error) throw new Error(`Request error: ${res.error.message}`);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const sections = extractSections(res.body);
      assert(sections.length > 0, `Expected sections.length > 0, got ${sections.length}`);
      return `status=${res.status}, sections=${sections.length}`;
    });

    await runTest(results, 'TEST 3 — form-config returns 200 for PC', async () => {
      const res = await requestJson('/api/cases/form-config?case_type=PC&org_id=1', { token });
      if (res.error) throw new Error(`Request error: ${res.error.message}`);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);
      const sections = extractSections(res.body);
      assert(sections.length > 0, `Expected sections.length > 0, got ${sections.length}`);
      return `status=${res.status}, sections=${sections.length}`;
    });

    await runTest(results, 'TEST 4 — missing case_type returns 400', async () => {
      const res = await requestJson('/api/cases/form-config?org_id=1', { token });
      if (res.error) throw new Error(`Request error: ${res.error.message}`);
      assert(res.status === 400, `Expected status 400, got ${res.status}`);
      return `status=${res.status}`;
    });

    await runTest(results, 'TEST 5 — invalid case_type returns 400', async () => {
      const res = await requestJson('/api/cases/form-config?case_type=XX&org_id=1', { token });
      if (res.error) throw new Error(`Request error: ${res.error.message}`);
      assert(res.status === 400, `Expected status 400, got ${res.status}`);
      return `status=${res.status}`;
    });

    await runTest(results, 'TEST 6 — dropdown fields have options array', async () => {
      const res = await requestJson('/api/cases/form-config?case_type=MI&org_id=1', { token });
      if (res.error) throw new Error(`Request error: ${res.error.message}`);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);

      const sections = extractSections(res.body);
      const fields = extractAllFields(sections);
      const dropdown = fields.find((field) => field && field.field_type === 'dropdown');

      assert(dropdown, 'No field with field_type="dropdown" found');
      assert(Array.isArray(dropdown.options), 'Dropdown field options is not an array');
      assert(dropdown.options.length > 0, `Expected options.length > 0, got ${dropdown.options.length}`);

      return `dropdown_options=${dropdown.options.length}`;
    });

    await runTest(results, 'TEST 7 — hidden fields not in response', async () => {
      const res = await requestJson('/api/cases/form-config?case_type=AE&org_id=1', { token });
      if (res.error) throw new Error(`Request error: ${res.error.message}`);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);

      const sections = extractSections(res.body);
      const fields = extractAllFields(sections);
      const hiddenField = fields.find((field) => Number(field && field.is_hidden) === 1);

      assert(!hiddenField, 'Found field with is_hidden=1 in response');
      return `fields_checked=${fields.length}`;
    });

    await runTest(results, 'TEST 8 — section count matches expected', async () => {
      const res = await requestJson('/api/cases/form-config?case_type=AE&org_id=1', { token });
      if (res.error) throw new Error(`Request error: ${res.error.message}`);
      assert(res.status === 200, `Expected status 200, got ${res.status}`);

      const sections = extractSections(res.body);
      assert(sections.length === 10, `Expected sections.length = 10, got ${sections.length}`);
      return `sections=${sections.length}`;
    });
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.log(`FATAL - ${message}`);
    results.push({ name: 'FATAL', ok: false, detail: message });
  } finally {
    const passCount = results.filter((row) => row.ok).length;
    const failCount = results.filter((row) => !row.ok).length;
    console.log(`\n${passCount} PASS | ${failCount} FAIL`);

    if (failCount > 0) {
      process.exitCode = 1;
    }
  }
})();
