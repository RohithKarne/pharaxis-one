/**
 * api-integration.js  (CP-18)
 *
 * Lightweight, dependency-free integration tests for the critical invariants:
 * health, public vs protected endpoints, and the security fixes (auth required,
 * anonymous MSL PII redaction). Runs against a live backend.
 *
 *   TEST_BASE_URL=http://localhost:4000 node tests/api-integration.js
 *
 * Skips gracefully (exit 0) if the server isn't reachable, so it never blocks CI
 * before the CI DB/server is provisioned; fails (exit 1) on any assertion miss.
 */

const http = require('http');

const BASE   = process.env.TEST_BASE_URL || 'http://localhost:4000';
const CLIENT = process.env.TEST_CLIENT || 'novartis';

function req(method, pathname) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, BASE);
    const r = http.request(url, { method, timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', d => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    r.on('error', reject);
    r.on('timeout', () => r.destroy(new Error('timeout')));
    r.end();
  });
}

const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, ok: true }); }
  catch (err) { results.push({ name, ok: false, msg: err.message }); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

(async () => {
  // Reachability gate — skip (not fail) if the server is down.
  try { await req('GET', '/api/health'); }
  catch { console.log(`⏭  ${BASE} not reachable — skipping integration tests.`); process.exit(0); }

  await check('health returns ok', async () => {
    const r = await req('GET', '/api/health');
    assert(r.status === 200, `expected 200, got ${r.status}`);
    assert(JSON.parse(r.body).status === 'ok', 'status not ok');
  });

  await check('public portal config is reachable anonymously', async () => {
    const r = await req('GET', `/api/portal/config/${CLIENT}`);
    assert(r.status === 200, `expected 200, got ${r.status}`);
  });

  await check('portal /me requires auth (401 without cookie)', async () => {
    const r = await req('GET', '/api/portal/auth/me');
    assert(r.status === 401, `expected 401, got ${r.status}`);
  });

  await check('admin /me requires auth (401 without cookie)', async () => {
    const r = await req('GET', '/api/admin/auth/me');
    assert(r.status === 401, `expected 401, got ${r.status}`);
  });

  await check('anonymous MSL directory redacts email/phone (security fix)', async () => {
    const r = await req('GET', `/api/portal/content/${CLIENT}/msls`);
    assert(r.status === 200, `expected 200, got ${r.status}`);
    const items = JSON.parse(r.body).items || [];
    const leaks = items.filter(m => 'email' in m || 'phone' in m);
    assert(leaks.length === 0, `PII leaked to anonymous caller on ${leaks.length} MSL(s)`);
  });

  const failed = results.filter(r => !r.ok);
  results.forEach(r => console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ' — ' + r.msg}`));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
