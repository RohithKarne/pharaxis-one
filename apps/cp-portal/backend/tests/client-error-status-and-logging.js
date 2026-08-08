/**
 * CP-88 — a client error must be reported as a client error, and still recorded.
 *
 * A request from a disallowed origin was answered 500 `{"error":"Server error."}`,
 * logged at error level, and raised a Sentry exception. Nothing had failed on the
 * server: the caller's origin was refused. Anyone on the internet could drive our
 * error-log and Sentry volume by sending an Origin header.
 *
 * THE TRAP THIS FILE EXISTS TO CATCH IS T3.
 *
 * `globalErrorHandler` logged only when `status >= 500`. So the obvious fix —
 * give the CORS error a 403 — silently converts a misleading log into NO log,
 * reintroducing the swallow-without-logging class that #543 was raised to
 * remove. T3 fails if a 4xx reaches the handler and leaves no record.
 *
 * T5 is the same gap found elsewhere while fixing this one: `inputSecurity`
 * rejects XSS, SQL-injection, command-injection and prototype-pollution attempts
 * with a 400 — and every one of those was recorded nowhere. A security control
 * that blocks an attack and tells no one is half a control.
 *
 * No database and no network beyond loopback.
 *
 * Run: node tests/client-error-status-and-logging.js
 */
const assert  = require('assert');
const fs      = require('fs');
const path    = require('path');
const express = require('express');

const { globalErrorHandler } = require('../middleware/errorHandler');
const { inputSecurity }      = require('../middleware/inputSecurity');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (err) { failures++; console.error(`✗ ${name}\n   ${err.message}`); }
}

// Drive one request through the real globalErrorHandler and capture both the
// response and everything written to stdout/stderr by the real logger.
async function run(buildApp, request = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.requestId = 'req-cp88-test'; next(); });
  buildApp(app);
  app.use(globalErrorHandler);

  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));

  const realErr = process.stderr.write.bind(process.stderr);
  const realOut = process.stdout.write.bind(process.stdout);
  let captured = '';
  process.stderr.write = (c) => { captured += c; return true; };
  process.stdout.write = (c) => { captured += c; return true; };

  let res, body;
  try {
    res = await fetch(`http://127.0.0.1:${server.address().port}${request.path || '/x'}`, {
      method: request.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(request.headers || {}) },
      body: request.body ? JSON.stringify(request.body) : undefined,
    });
    body = await res.json();
  } finally {
    process.stderr.write = realErr;
    process.stdout.write = realOut;
    await new Promise((r) => server.close(r));
  }

  const lines = captured.split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
  return { res, body, lines, captured };
}

// A throwing middleware standing in for any 4xx that reaches the handler.
const throws = (status, message) => (_req, _res, next) => {
  const err = new Error(message);
  err.statusCode = status;
  next(err);
};

(async () => {
  // ── T1: the real file, not a copy ───────────────────────────────────────
  check('T1 server.js gives the CORS rejection a 403 status', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const start = src.indexOf('app.use(cors(');
    assert.notStrictEqual(start, -1, 'app.use(cors( not found in server.js');
    const block = src.slice(start, start + 700);
    assert.ok(/statusCode\s*=\s*403/.test(block),
      'the CORS origin callback does not set statusCode 403 — a rejected origin will be answered 500 "Server error."');
  });

  // ── T2: a 403 is answered as a 403, truthfully ──────────────────────────
  const denied = await run((app) => app.use(throws(403, 'Origin not allowed.')));

  check('T2 a 403 is returned as 403 with its real message, not "Server error."', () => {
    assert.strictEqual(denied.res.status, 403);
    assert.strictEqual(denied.body.error, 'Origin not allowed.');
    assert.notStrictEqual(denied.body.error, 'Server error.');
  });

  check('T2.1 the request id still reaches the caller on a 4xx', () => {
    assert.strictEqual(denied.body.request_id, 'req-cp88-test');
  });

  // ── T3: THE ONE THAT MATTERS ────────────────────────────────────────────
  check('T3 a 4xx that reaches the handler is still recorded', () => {
    const line = denied.lines.find((l) => l.level === 'warn' || l.level === 'error');
    assert.ok(line,
      'a 403 reached globalErrorHandler and NOTHING was logged — the 403 fix has ' +
      'traded a misleading log for silence (SOP §37.2)');
    assert.ok(line.err && /Origin not allowed/.test(line.err.message), 'the cause is missing from the log');
    assert.strictEqual(line.request_id, 'req-cp88-test');
  });

  check('T3.2 the 4xx line carries no stack — this path is attacker-drivable', () => {
    const line = denied.lines.find((l) => l.level === 'warn');
    assert.ok(line, 'nothing logged at all');
    assert.ok(!line.err.stack,
      'a stack is written on every rejected request — bulk without signal on a path ' +
      'anyone can trigger with one header, which is half of what CP-88 is about');
    assert.strictEqual(line.status, 403, 'the status is missing from the line');
  });

  check('T3.1 a client error is logged at warn, not error — it is not an incident', () => {
    const line = denied.lines.find((l) => l.level === 'warn' || l.level === 'error');
    assert.ok(line, 'nothing logged at all');
    assert.strictEqual(line.level, 'warn',
      `a rejected client request was logged at "${line.level}" — error level pages people ` +
      'and reaches Sentry, which is what CP-88 is about');
  });

  // ── T4: 500s must be unchanged ──────────────────────────────────────────
  const boom = await run((app) => app.use((_req, _res, next) => next(new Error('kaboom'))));

  check('T4 a real 500 still returns the generic body and logs at error', () => {
    assert.strictEqual(boom.res.status, 500);
    assert.strictEqual(boom.body.error, 'Server error.');
    const line = boom.lines.find((l) => l.level === 'error');
    assert.ok(line, 'a 500 was not logged at error level — regression');
    assert.strictEqual(line.event, 'request.error');
  });

  // ── T5: the same silence, found elsewhere ───────────────────────────────
  const blocked = await run(
    (app) => app.use(inputSecurity),
    { method: 'POST', path: '/x', body: { note: "1' UNION SELECT password FROM users" } }
  );

  check('T5 a blocked injection attempt is recorded, not silently rejected', () => {
    assert.strictEqual(blocked.res.status, 400);
    const line = blocked.lines.find((l) => l.level === 'warn' || l.level === 'error');
    assert.ok(line,
      'inputSecurity blocked a SQL-injection attempt and logged nothing — an attack ' +
      'was stopped and no one can ever know it happened');
    assert.ok(line.err && /unsafe input/i.test(line.err.message), 'the rejection reason is missing');
  });

  // ── T6: never reveal what IS allowed ────────────────────────────────────
  check('T6 the response body never carries the allow-list', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const allowed = (src.match(/https?:\/\/[\w.:-]+/g) || []).filter((u) => u.includes('localhost') || u.includes('127.0.0.1'));
    const serialized = JSON.stringify(denied.body);
    for (const origin of allowed) {
      assert.ok(!serialized.includes(origin), `the response leaked an allowed origin: ${origin}`);
    }
  });

  if (failures > 0) {
    console.error(`\nCP-88 client-error regression failed: ${failures} check(s).`);
    process.exit(1);
  }
  console.log('\nCP-88 client-error status and logging regression passed.');
})();
