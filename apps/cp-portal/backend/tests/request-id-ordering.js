/**
 * Request id must be attached before CORS can reject.
 *
 * `attachRequestContext` was registered after `cors`, so a request rejected by
 * the CORS origin callback reached `globalErrorHandler` with no `req.requestId`.
 * The 500 was logged with `request_id: null` and returned a body with the same
 * — the one class of failure where the operator most wants a correlation id,
 * because nothing downstream ever ran to produce one.
 *
 * That is the shape of the 2026-08-07 admin-login incident: the throw happened
 * in middleware, before any route, and left almost nothing behind.
 *
 * TWO TESTS, DELIBERATELY DIFFERENT IN KIND.
 *
 * T1 is structural — it reads server.js and asserts the registration order. It
 * exists because server.js cannot be imported here: it runs migrations, opens a
 * MySQL pool, starts timers and calls process.exit(1) on failure, and it exports
 * no app. A behavioural test would therefore have to rebuild the chain by hand,
 * and a hand-built copy passes whatever server.js actually does — which is worth
 * nothing. T1 asserts the real file.
 *
 * T2 is behavioural and covers what T1 cannot: that the ordering genuinely
 * produces a request id in the log, using the real requestContext and real
 * errorHandler. T2.2 runs the OLD order and asserts request_id IS null — so the
 * test is shown to distinguish the two, rather than merely passing.
 *
 * No database and no network.
 *
 * Run: node tests/request-id-ordering.js
 */
const assert  = require('assert');
const fs      = require('fs');
const path    = require('path');
const express = require('express');
const cors    = require('cors');

const { attachRequestContext } = require('../middleware/requestContext');
const { globalErrorHandler }   = require('../middleware/errorHandler');

let failures = 0;
function check(name, fn) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (err) { failures++; console.error(`✗ ${name}\n   ${err.message}`); }
}

// A CORS config shaped like server.js's: the origin callback errors on a
// disallowed origin, which is the path that produced request_id: null.
const corsMw = cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin === 'http://localhost:5173') return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
});

// Drive one disallowed-origin request through a given middleware order and
// return the parsed error line the real globalErrorHandler wrote.
async function rejectedRequest(order, inboundId) {
  const app = express();
  if (order === 'fixed') {
    app.use(attachRequestContext);
    app.use(corsMw);
  } else {
    app.use(corsMw);
    app.use(attachRequestContext);
  }
  app.get('/api/admin/auth/login', (_req, res) => res.json({ reached: true }));
  app.use(globalErrorHandler);

  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));

  const realWrite = process.stderr.write.bind(process.stderr);
  let captured = '';
  process.stderr.write = (chunk) => { captured += chunk; return true; };

  let res, body;
  try {
    res = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/auth/login`, {
      headers: inboundId
        ? { Origin: 'https://evil.example.com', 'X-Request-Id': inboundId }
        : { Origin: 'https://evil.example.com' },
    });
    body = await res.json();
  } finally {
    process.stderr.write = realWrite;
    await new Promise((r) => server.close(r));
  }

  const line = captured.split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .find((l) => l && l.level === 'error');
  return { res, body, line, captured };
}

(async () => {
  // T1 — the real file. Fails if the registration order is ever put back.
  check('T1 server.js registers attachRequestContext before cors', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const ctxAt  = src.indexOf('app.use(attachRequestContext)');
    const corsAt = src.indexOf('app.use(cors(');
    assert.notStrictEqual(ctxAt, -1, 'app.use(attachRequestContext) not found in server.js');
    assert.notStrictEqual(corsAt, -1, 'app.use(cors( not found in server.js');
    assert.ok(ctxAt < corsAt,
      `attachRequestContext is registered at index ${ctxAt}, after cors at ${corsAt} — ` +
      'a CORS rejection will log request_id: null');
  });

  const fixed = await rejectedRequest('fixed');

  // T2.1 — the behaviour the ordering buys.
  check('T2.1 a CORS rejection is logged with a real request id', () => {
    assert.ok(fixed.line, `no error line written to stderr: ${JSON.stringify(fixed.captured)}`);
    assert.strictEqual(fixed.line.event, 'request.error');
    assert.ok(fixed.line.request_id, 'request_id is missing or null on a CORS rejection');
    assert.match(fixed.line.request_id, /\S/);
    assert.ok(fixed.line.err && /CORS/.test(fixed.line.err.message), 'the CORS cause is missing');
  });

  // The id in the log must be the one the caller can quote back.
  check('T2.2 the same id reaches the client, in body and header', () => {
    assert.strictEqual(fixed.body.request_id, fixed.line.request_id);
    assert.strictEqual(fixed.res.headers.get('x-request-id'), fixed.line.request_id);
  });

  // An inbound X-Request-Id must win, so a caller can correlate across services
  // even when the request never gets past CORS.
  const traced = await rejectedRequest('fixed', 'trace-abc-123');
  check('T2.3 an inbound X-Request-Id is honoured on a rejected request', () => {
    assert.ok(traced.line, 'no error line for the traced request');
    assert.strictEqual(traced.line.request_id, 'trace-abc-123');
  });

  const old = await rejectedRequest('old');

  // T2.4 — THE ONE THAT MAKES THE REST MEAN ANYTHING. Under the previous order
  // request_id is null. If this ever passes with a real id, the tests above are
  // not measuring the ordering and prove nothing.
  check('T2.4 the OLD order really did log request_id: null', () => {
    assert.ok(old.line, 'no error line under the old order');
    assert.strictEqual(old.line.request_id, null,
      `expected null under the old order but got ${JSON.stringify(old.line.request_id)} — ` +
      'these tests are not detecting the ordering');
  });

  if (failures > 0) {
    console.error(`\nrequest-id ordering regression failed: ${failures} check(s).`);
    process.exit(1);
  }
  console.log('\nRequest-id ordering regression passed.');
})();
