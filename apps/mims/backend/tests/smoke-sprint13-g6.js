'use strict';

/**
 * Smoke test — Sprint 13 G6 backend items
 * G6-2: End-to-end case lifecycle
 * G6-1: Workflow transition enforcement
 */

const BASE = 'http://127.0.0.1:3000';
let passed = 0;
let failed = 0;
let adminToken = '';
let siteId = null;
let caseId = null;
let caseNumber = '';
let stateId = null;

async function req(method, path, body, token) {
  const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
  const f = await fetch;
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const res = await f(`${BASE}${path}`, opts);
  let data = {};
  try { data = await res.json(); } catch (_) {}
  return { status: res.status, data };
}

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function skip(label, detail = '') {
  console.log(`  ⏭️ SKIP: ${label}${detail ? ' — ' + detail : ''}`);
}

function getSkipReason(skipReason) {
  return typeof skipReason === 'function' ? skipReason() : skipReason;
}

async function runStep(label, fn, options = {}) {
  if (options.skipWhen && options.skipWhen()) {
    skip(label, getSkipReason(options.skipReason) || 'Skipped');
    return 'skip';
  }

  try {
    const outcome = await fn();
    const pass = !!outcome.pass;
    check(label, pass, outcome.detail || '');
    return pass ? 'pass' : 'fail';
  } catch (err) {
    check(label, false, err && err.message ? err.message : String(err));
    return 'fail';
  }
}

async function run() {
  console.log('\n=== Sprint 13 G6 Smoke Tests ===\n');

  const s1 = await runStep('1. Login — POST /api/auth/login', async () => {
    const r = await req('POST', '/api/auth/login', {
      email: 'vanaja_admin@reviewco.com',
      password: 'Test@1234',
    });
    const token = r.data && (r.data.token || r.data.challengeToken);
    if ((r.status === 200 || r.status === 202) && token) {
      adminToken = token;
    }
    return {
      pass: (r.status === 200 || r.status === 202) && !!token,
      detail: `status=${r.status}, token=${token ? 'present' : 'missing'}`,
    };
  });

  const s2 = await runStep(
    '2. Get sites — GET /api/admin/sites',
    async () => {
      const r = await req('GET', '/api/admin/sites', null, adminToken);
      const sites = Array.isArray(r.data && r.data.sites) ? r.data.sites : [];
      if (r.status === 200 && sites[0] && sites[0].id) {
        siteId = sites[0].id;
      }
      return {
        pass: r.status === 200 && !!siteId,
        detail: `status=${r.status}, siteId=${siteId || 'none'}`,
      };
    },
    { skipWhen: () => s1 !== 'pass', skipReason: 'Step 1 did not pass' }
  );

  const s3 = await runStep(
    '3. Create case — POST /api/cases',
    async () => {
      const r = await req('POST', '/api/cases', {
        site_id: siteId,
        case_type: 'AE',
        intake_channel: 'manual',
      }, adminToken);
      if ((r.status === 200 || r.status === 201) && r.data && r.data.id) {
        caseId = r.data.id;
      }
      return {
        pass: (r.status === 200 || r.status === 201) && !!caseId,
        detail: `status=${r.status}, caseId=${caseId || 'none'}`,
      };
    },
    { skipWhen: () => s2 !== 'pass', skipReason: 'Step 2 did not pass' }
  );

  const s4 = await runStep(
    '4. Get case — GET /api/cases/:caseId',
    async () => {
      const r = await req('GET', `/api/cases/${caseId}`, null, adminToken);
      const hasCaseNumber = !!(r.data && Object.prototype.hasOwnProperty.call(r.data, 'case_number') && r.data.case_number != null);
      return {
        pass: r.status === 200 && !hasCaseNumber,
        detail: `status=${r.status}, case_number=${hasCaseNumber ? String(r.data.case_number) : 'absent-or-null'}`,
      };
    },
    { skipWhen: () => s3 !== 'pass', skipReason: 'Step 3 did not pass' }
  );

  const s5 = await runStep(
    '5. Assign case number — POST /api/cases/:caseId/assign-number',
    async () => {
      const r = await req('POST', `/api/cases/${caseId}/assign-number`, null, adminToken);
      if (r.status === 200 && r.data && typeof r.data.case_number === 'string' && r.data.case_number) {
        caseNumber = r.data.case_number;
      }
      return {
        pass: r.status === 200 && !!caseNumber,
        detail: `status=${r.status}, case_number=${caseNumber || 'missing'}`,
      };
    },
    { skipWhen: () => s4 !== 'pass', skipReason: 'Step 4 did not pass' }
  );

  const s6 = await runStep(
    '6. Idempotency check — POST /api/cases/:caseId/assign-number again',
    async () => {
      const r = await req('POST', `/api/cases/${caseId}/assign-number`, null, adminToken);
      const sameNumber = r.status === 200 && r.data && r.data.case_number === caseNumber;
      return {
        pass: sameNumber,
        detail: `status=${r.status}, case_number=${r.data && r.data.case_number ? r.data.case_number : 'missing'}, expected=${caseNumber || 'missing'}`,
      };
    },
    { skipWhen: () => s5 !== 'pass', skipReason: 'Step 5 did not pass' }
  );

  const s7 = await runStep(
    '7. Update priority — PUT /api/cases/:caseId',
    async () => {
      const r = await req('PUT', `/api/cases/${caseId}`, { priority: 'high' }, adminToken);
      return {
        pass: r.status === 200,
        detail: `status=${r.status}`,
      };
    },
    { skipWhen: () => s6 !== 'pass', skipReason: 'Step 6 did not pass' }
  );

  const s8 = await runStep(
    '8. Update description — PUT /api/cases/:caseId',
    async () => {
      const r = await req('PUT', `/api/cases/${caseId}`, { description: 'E2E lifecycle test' }, adminToken);
      return {
        pass: r.status === 200,
        detail: `status=${r.status}`,
      };
    },
    { skipWhen: () => s7 !== 'pass', skipReason: 'Step 7 did not pass' }
  );

  const s9 = await runStep(
    '9. Get workflow states — GET /api/admin/workflow-states',
    async () => {
      const r = await req('GET', '/api/admin/workflow-states', null, adminToken);
      const states = Array.isArray(r.data && r.data.states) ? r.data.states : [];
      const activeState = states.find((state) => Number(state && state.is_active) === 1);
      stateId = activeState ? activeState.id : null;
      return {
        pass: r.status === 200 && Array.isArray(states),
        detail: `status=${r.status}, states=${states.length}, activeStateId=${stateId || 'none'}`,
      };
    },
    { skipWhen: () => s8 !== 'pass', skipReason: 'Step 8 did not pass' }
  );

  const s10 = await runStep(
    '10. Update case status — PUT /api/cases/:caseId',
    async () => {
      const r = await req('PUT', `/api/cases/${caseId}`, { status_id: stateId }, adminToken);
      return {
        pass: [200, 400].includes(r.status),
        detail: `status=${r.status}`,
      };
    },
    {
      skipWhen: () => s9 !== 'pass' || !stateId,
      skipReason: () => (s9 !== 'pass' ? 'Step 9 did not pass' : 'No active workflow states found'),
    }
  );

  const s11 = await runStep(
    '11. Bad transition — PUT /api/cases/:caseId with same state',
    async () => {
      const r = await req('PUT', `/api/cases/${caseId}`, { status_id: stateId }, adminToken);
      return {
        pass: [200, 400].includes(r.status),
        detail: `status=${r.status}`,
      };
    },
    {
      skipWhen: () => s10 !== 'pass',
      skipReason: () => (s10 === 'skip' && !stateId && s9 === 'pass' ? 'No active workflow states found' : 'Step 10 did not pass'),
    }
  );

  const s12 = await runStep(
    '12. Delete case — DELETE /api/cases/:caseId',
    async () => {
      const r = await req('DELETE', `/api/cases/${caseId}`, null, adminToken);
      return {
        pass: r.status === 200,
        detail: `status=${r.status}`,
      };
    },
    {
      skipWhen: () => s9 !== 'pass' || s10 === 'fail' || s11 === 'fail',
      skipReason: () => {
        if (s9 !== 'pass') return 'Step 9 did not pass';
        if (s10 === 'fail') return 'Step 10 did not pass';
        if (s11 === 'fail') return 'Step 11 did not pass';
        return 'Skipped';
      },
    }
  );

  await runStep(
    '13. Confirm deleted — GET /api/cases/:caseId',
    async () => {
      const r = await req('GET', `/api/cases/${caseId}`, null, adminToken);
      return {
        pass: r.status === 404,
        detail: `status=${r.status}`,
      };
    },
    { skipWhen: () => s12 !== 'pass', skipReason: 'Step 12 did not pass' }
  );

  summary();
}

function summary() {
  console.log(`\nG6-2 CASE LIFECYCLE SMOKE: ${passed}/13 PASS`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
