/**
 * Admin auth — server-side error logging regression.
 *
 * 2026-08-07: the CP Portal demo returned 500 on admin login and Cloud Run's
 * stderr for that timestamp held a single blank line. Every handler in
 * routes/admin/auth.js caught `err` and discarded it, so the 500 carried no
 * server-side record at all. Diagnosis had to be inferred from request latency.
 * A handler that returns 500 and logs nothing fails silently by construction —
 * SOP 37.2.
 *
 * THE TEST THAT MATTERS IS T3. T1/T2 assert the error is recorded; T3 asserts
 * the recording does not leak the credential. A log that fixes observability by
 * writing passwords to stderr is a worse defect than the one it replaces.
 *
 * No network and no database — the db module is stubbed in require.cache and the
 * router is driven in-process, so this asserts the handler's own catch block.
 *
 * Run: node tests/admin-auth-error-logging.js
 */
const assert = require('assert');
const path   = require('path');

// Stub database/db before the router requires it, so pool.execute throws the
// way a real infrastructure fault does.
const dbPath = require.resolve('../database/db');
const BOOM = 'simulated infrastructure fault';
require.cache[dbPath] = {
  id: dbPath, filename: dbPath, loaded: true, exports: {
    pool: { execute: async () => { throw new Error(BOOM); } },
  },
};

// middleware/auth refuses to load without these outside development.
process.env.CP_ADMIN_JWT_SECRET  = process.env.CP_ADMIN_JWT_SECRET  || 'test-only-admin-secret';
process.env.CP_PORTAL_JWT_SECRET = process.env.CP_PORTAL_JWT_SECRET || 'test-only-portal-secret';

const express = require('express');
const router  = require('../routes/admin/auth');

const PASSWORD_CANARY = 'canary-pw-must-never-be-logged-8842';

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (err) { failures++; console.error(`✗ ${name}\n   ${err.message}`); }
}

// Drive one request through the router and capture everything written to stderr.
async function post(routePath, body) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.requestId = 'req-test-0001'; next(); });
  app.use('/api/admin/auth', router);

  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));

  const realWrite = process.stderr.write.bind(process.stderr);
  let captured = '';
  process.stderr.write = (chunk, ...rest) => { captured += chunk; return realWrite(chunk, ...rest); };

  let res;
  try {
    res = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/auth${routePath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } finally {
    process.stderr.write = realWrite;
    await new Promise((r) => server.close(r));
  }
  return { res, json: await res.json(), stderr: captured };
}

(async () => {
  const { res, json, stderr } = await post('/login', { email: 'admin@example.com', password: PASSWORD_CANARY });

  // T0 — the contract the fix must not change. A generic body is deliberate:
  // clients must not see internal error detail.
  check('T0 login still returns 500 with the generic body', () => {
    assert.strictEqual(res.status, 500);
    assert.deepStrictEqual(json, { error: 'Server error.' });
  });

  // T1 — the defect itself. Before the fix this is the empty string.
  check('T1 the 500 writes a structured line to stderr', () => {
    assert.ok(stderr.trim().length > 0, 'nothing was written to stderr — the error was swallowed');
  });

  const lines = stderr.trim().split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

  // T2 — the line has to identify the route and carry the actual cause,
  // otherwise the operator is back to inferring from latency.
  check('T2 the line identifies the route and carries the cause', () => {
    const line = lines.find((l) => l.level === 'error');
    assert.ok(line, `no parseable JSON error line in stderr: ${JSON.stringify(stderr)}`);
    assert.strictEqual(line.event, 'admin.auth.error');
    assert.strictEqual(line.route, 'POST /login');
    assert.strictEqual(line.request_id, 'req-test-0001');
    assert.ok(line.err && line.err.message.includes(BOOM), 'the error message is missing');
    assert.ok(line.err.stack, 'the stack is missing');
  });

  // T3 — THE ONE THAT MATTERS. `password` is in scope in the login handler.
  check('T3 the credential never reaches the logs', () => {
    assert.ok(!stderr.includes(PASSWORD_CANARY), 'the submitted password was written to stderr');
  });

  if (failures > 0) {
    console.error(`\nadmin auth error-logging regression failed: ${failures} check(s).`);
    process.exit(1);
  }
  console.log('\nAdmin auth error-logging regression passed.');
})();
