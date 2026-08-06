/**
 * PAUD-2 remediation — CP Portal items 8, 6 and 5.
 *
 * Item 8 is the reason this file exists. The trials endpoint served three
 * invented NCT numbers with named investigators to any doctor who opened the
 * page. That is fabricated clinical information on an HCP-facing screen, so the
 * test that matters most is T8.3: an EMPTY table must produce an EMPTY list.
 * A fix that keeps the hardcoded array as a "fallback for when nothing is
 * configured" would pass every other assertion here and still ship the defect.
 *
 * No database. The db module is replaced in require.cache before the routes are
 * loaded, and the routers are mounted on a real express app — so these exercise
 * the actual route handlers, not a copy of their logic.
 *
 * Run: node tests/paud2-remediation.js
 */
'use strict';

// The auth middleware exits the process if these are unset outside development.
// Set before any route is required. Values are never used — nothing here signs
// or verifies a token.
process.env.CP_ADMIN_JWT_SECRET  = process.env.CP_ADMIN_JWT_SECRET  || 'test-only-admin-secret';
process.env.CP_PORTAL_JWT_SECRET = process.env.CP_PORTAL_JWT_SECRET || 'test-only-portal-secret';

const assert = require('assert');
const path   = require('path');
const http   = require('http');
const express = require('express');

let failures = 0;
const pending = [];
function check(name, fn) { pending.push({ name, fn }); }

// ── Fake database ───────────────────────────────────────────────────────────
// Records every statement so the tests can assert what was actually queried.

const db = { queries: [], responder: null };

function fakePool() {
  return {
    execute: async (sql, params = []) => {
      db.queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      const rows = db.responder ? db.responder(sql, params) : [];
      return [rows, []];
    },
  };
}

function stub(modulePath, exports) {
  const resolved = require.resolve(modulePath);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

// Outbound mail, captured instead of sent.
const mail = { sent: [] };

stub('../database/db', { pool: fakePool(), initializeDatabase: async () => {} });
stub('../utils/mailer', {
  sendEmail: async (clientId, opts) => { mail.sent.push({ clientId, ...opts }); },
});
// The real queue defers and retries; here it runs the job inline so the
// assertions see the mail the request actually produced.
stub('../utils/jobQueue', { enqueue: (name, fn) => Promise.resolve(fn()) });
// Portal auth is not what these tests cover — a signed-in HCP is a given.
stub('../middleware/auth', {
  authenticatePortal: (req, _res, next) => {
    req.portalUser = { id: 42, user_type: 'hcp' };
    next();
  },
  authenticateAdmin: (_req, _res, next) => next(),
  requireClientAccess: (_req, _res, next) => next(),
});

// Loaded AFTER the cache injection, so they bind to the fakes.
const contentRoutes  = require('../routes/portal/content');
const bookingsRoutes = require('../routes/portal/bookings');

// ── Test server ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use('/content', contentRoutes);
app.use('/bookings', bookingsRoutes);
let server, baseUrl;

async function get(url) {
  const res = await fetch(`${baseUrl}${url}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function post(url, payload) {
  const res = await fetch(`${baseUrl}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const CLIENT = [{ id: 7 }];

// ── Item 8 — clinical trials come from the database ─────────────────────────

check('T8.1 the trials endpoint reads cp_clinical_trials, scoped to the client', async () => {
  db.queries = [];
  db.responder = (sql) => {
    if (/cp_clients/.test(sql)) return CLIENT;
    if (/cp_clinical_trials/.test(sql)) {
      return [{ id: 1, nct_id: 'NCT01234567', title: 'A real study', phase: 'Phase II',
                indication: 'Asthma', status: 'Recruiting', site_location: 'Leeds, UK', pi: 'Dr A Patel' }];
    }
    return [];
  };

  const { status, body } = await get('/content/acme/trials');
  assert.strictEqual(status, 200);

  const trialQuery = db.queries.find((q) => /cp_clinical_trials/.test(q.sql));
  assert.ok(trialQuery, 'the endpoint never queried cp_clinical_trials');
  assert.ok(/client_id\s*=\s*\?/.test(trialQuery.sql), 'trial query is not scoped to a client');
  assert.ok(trialQuery.params.includes(7), 'trial query did not use the resolved client id');

  assert.strictEqual(body.items.length, 1);
  assert.strictEqual(body.items[0].nct_id, 'NCT01234567');
});

check('T8.2 only active trials are served', async () => {
  db.queries = [];
  const { status } = await get('/content/acme/trials');
  assert.strictEqual(status, 200);
  const trialQuery = db.queries.find((q) => /cp_clinical_trials/.test(q.sql));
  assert.ok(/is_active\s*=\s*1/.test(trialQuery.sql),
    'a de-activated trial would still be shown to doctors');
});

check('T8.3 an empty table serves an empty list — never the fabricated fallback', async () => {
  // THE TEST THAT MATTERS. Falling back to hardcoded trials when nothing is
  // configured is the original defect wearing a different hat.
  db.responder = (sql) => (/cp_clients/.test(sql) ? CLIENT : []);

  const { status, body } = await get('/content/acme/trials');
  assert.strictEqual(status, 200);
  assert.deepStrictEqual(body.items, [], 'an unconfigured portal invented trials');
});

check('T8.4 the invented NCT numbers are gone from the source', async () => {
  const src = require('fs').readFileSync(
    path.join(__dirname, '..', 'routes', 'portal', 'content.js'), 'utf8');
  for (const invented of ['NCT048291', 'NCT059281', 'NCT062849', 'E. Vance', 'M. Rossi', 'S. Thorne']) {
    assert.ok(!src.includes(invented), `fabricated trial data still present: ${invented}`);
  }
});

// ── Item 6 — CME modules come from the database ─────────────────────────────

check('T6.1 the training endpoint reads cp_training_modules, scoped to the client', async () => {
  db.queries = [];
  db.responder = (sql) => {
    if (/cp_clients/.test(sql)) return CLIENT;
    if (/cp_training_modules/.test(sql)) {
      return [{ id: 3, title: 'Approved module', type: 'CME Accredited',
                duration: '30 mins', credits: '1.0 CME', pass_score: 80, status: 'Available' }];
    }
    return [];
  };

  const { status, body } = await get('/content/acme/training');
  assert.strictEqual(status, 200);

  const q = db.queries.find((x) => /cp_training_modules/.test(x.sql));
  assert.ok(q, 'the endpoint never queried cp_training_modules');
  assert.ok(/client_id\s*=\s*\?/.test(q.sql), 'module query is not scoped to a client');
  assert.ok(/is_active\s*=\s*1/.test(q.sql), 'a retired module would still be offered');
  assert.strictEqual(body.items[0].title, 'Approved module');
});

check('T6.2 an empty table serves an empty list — never the hardcoded three', async () => {
  db.responder = (sql) => (/cp_clients/.test(sql) ? CLIENT : []);
  const { body } = await get('/content/acme/training');
  assert.deepStrictEqual(body.items, [], 'an unconfigured portal invented CME modules');
});

check('T6.3 the hardcoded module ids are gone from the source', async () => {
  const src = require('fs').readFileSync(
    path.join(__dirname, '..', 'routes', 'portal', 'content.js'), 'utf8');
  for (const invented of ['cme-101', 'cme-202', 'cme-303']) {
    assert.ok(!src.includes(invented), `hardcoded module still present: ${invented}`);
  }
});

// ── Item 5 — the MSL is told about their own meeting ────────────────────────

function bookingDb({ mslEmail }) {
  return (sql) => {
    if (/cp_clients/.test(sql))      return CLIENT;
    if (/cp_msls/.test(sql))         return [{ id: 3, name: 'Dr Nadia Rahim', email: mslEmail }];
    if (/cp_msl_bookings/.test(sql) && /^\s*SELECT/i.test(sql)) return []; // no duplicate today
    if (/INSERT INTO cp_msl_bookings/.test(sql)) return { insertId: 555 };
    return [];
  };
}

const BOOKING = { requester_name: 'Dr Ellis', requester_email: 'ellis@hospital.example', topic: 'Dosing' };

check('T5.1 the requesting doctor still gets their confirmation', async () => {
  mail.sent = [];
  db.responder = bookingDb({ mslEmail: 'nadia@pharma.example' });

  const { status } = await post('/bookings/acme/3', BOOKING);
  assert.strictEqual(status, 201);

  const toDoctor = mail.sent.find((m) => m.to === 'ellis@hospital.example');
  assert.ok(toDoctor, 'the doctor lost their confirmation email');
});

check('T5.2 the MSL is emailed about their own meeting', async () => {
  mail.sent = [];
  db.responder = bookingDb({ mslEmail: 'nadia@pharma.example' });

  await post('/bookings/acme/3', BOOKING);

  const toMsl = mail.sent.find((m) => m.to === 'nadia@pharma.example');
  assert.ok(toMsl, 'the MSL was never told a doctor booked time with them');
  assert.ok(/Dr Ellis/.test(toMsl.html), 'the MSL email does not say who requested the meeting');
});

check('T5.3 an MSL with no email on file does not break the booking', async () => {
  // cp_msls.email is nullable. Sending to null would throw inside the queued
  // job and lose the doctor's confirmation with it.
  mail.sent = [];
  db.responder = bookingDb({ mslEmail: null });

  const { status } = await post('/bookings/acme/3', BOOKING);
  assert.strictEqual(status, 201, 'a missing MSL address broke the booking');
  assert.ok(mail.sent.some((m) => m.to === 'ellis@hospital.example'),
    'the doctor lost their confirmation because the MSL had no address');
  assert.ok(!mail.sent.some((m) => !m.to), 'attempted to send mail to an empty address');
});

// ── Runner ──────────────────────────────────────────────────────────────────

(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  for (const { name, fn } of pending) {
    try { await fn(); console.log(`✓ ${name}`); }
    catch (err) { failures++; console.error(`✗ ${name}\n   ${err.message}`); }
  }

  server.close();
  console.log(failures ? `\n${failures} failing` : '\nall passing');
  process.exit(failures ? 1 : 0);
})();
