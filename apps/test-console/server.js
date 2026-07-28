'use strict';

/**
 * Pharaxis Test Console — internal engineering tool.
 *
 * Standalone by design: it reads and runs the suites of all five applications
 * without living inside any of them. Zero dependencies so it starts with plain
 * `node server.js` and never needs its own install step.
 *
 *   GET  /api/registry            apps and their suites
 *   GET  /api/runs                run history, newest first
 *   GET  /api/runs/:id            one run, with per-test detail
 *   GET  /api/run/stream?…        execute and stream results over SSE
 *   POST /api/promote             add release suites to the regression corpus
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const { runSuite } = require('./src/runner');
const store = require('./src/store');
const impact = require('./src/impact');
const discover = require('./src/discover');

const PORT = Number(process.env.TEST_CONSOLE_PORT || 4300);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/** One run at a time. Concurrent runs would fight over the test databases. */
let activeRun = null;

function sendJson(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, rel);
  // Never serve outside public/.
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
}

/**
 * Is the application's own dev server up?
 *
 * The console must never start or stop an application server. Setting the
 * app's base-URL env var disables its playwright config's webServer block, so
 * Playwright reuses what is already running instead of managing a server whose
 * lifetime we would then have to control — that is how a Tier 3 run previously
 * took down two of the developer's running backends.
 */
function checkUp(healthUrl) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => { if (!settled) { settled = true; resolve(ok); } };
    try {
      const req = http.get(healthUrl, { timeout: 3000 }, (r) => {
        r.resume();
        done(r.statusCode > 0 && r.statusCode < 500);
      });
      req.on('error', () => done(false));
      req.on('timeout', () => { req.destroy(); done(false); });
    } catch { done(false); }
  });
}

/** Suites selected by app id and optional tier. */
function selectSuites(registry, appId, tier) {
  const apps = appId && appId !== 'all'
    ? registry.apps.filter((a) => a.id === appId)
    : registry.apps;
  const out = [];
  apps.forEach((app) => {
    (app.suites || []).forEach((s) => {
      if (tier && Number(s.tier) !== Number(tier)) return;
      out.push({ app, suite: s });
    });
  });
  return out;
}

async function streamRun(req, res, url) {
  if (activeRun) {
    return sendJson(res, 409, { error: 'A run is already in progress.', runId: activeRun });
  }

  const registry = store.readRegistry();
  const appId = url.searchParams.get('app') || 'all';
  const tier = url.searchParams.get('tier') || '';
  const mode = url.searchParams.get('mode') || 'regression';

  // Regression runs the whole cumulative corpus. Current Release runs only what
  // the change in flight can affect — that difference is the point of the mode.
  let selected;
  let changeInfo = null;
  if (mode === 'release') {
    changeInfo = impact.summarise(registry, url.searchParams.get('base') || '');
    const ids = new Set(changeInfo.suites.map((s) => s.id));
    selected = selectSuites(registry, appId, tier).filter((x) => ids.has(x.suite.id));
  } else {
    selected = selectSuites(registry, appId, tier);
  }

  if (!selected.length) {
    return sendJson(res, 400, {
      error: mode === 'release'
        ? 'Nothing in flight affects the selected application and tier.'
        : 'No suites match that selection.',
      changedFiles: changeInfo ? changeInfo.fileCount : undefined,
    });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const runId = 'run-' + Date.now();
  activeRun = runId;

  const run = {
    id: runId,
    app: appId,
    mode,
    tier: tier || 'all',
    commit: store.currentCommit(),
    startedAt: new Date().toISOString(),
    suites: [],
    passed: 0, failed: 0, skipped: 0,
    durationMs: 0, trust: 0,
  };

  const send = (event) => {
    if (res.writableEnded) return;
    res.write('data: ' + JSON.stringify(event) + '\n\n');
  };

  // Closing the stream must actually stop the work, not just stop reporting it.
  // The handle is populated by runSuite with a killer for the live child.
  let cancelled = false;
  const handle = {};
  req.on('close', () => {
    cancelled = true;
    if (typeof handle.kill === 'function') handle.kill();
  });

  send({
    type: 'run-start', runId, app: appId, mode, commit: run.commit,
    total: selected.length,
    changedFiles: changeInfo ? changeInfo.files : null,
    reasons: changeInfo
      ? selected.map((x) => {
          const m = changeInfo.suites.find((s) => s.id === x.suite.id);
          return { id: x.suite.id, reason: m ? m.reason : '' };
        })
      : null,
  });

  const started = Date.now();

  // Preflight: a Tier 3 suite drives the real UI, so the app's dev server has
  // to be up already. Checking once per app turns "every test failed for a
  // reason unrelated to the code" into one clear message.
  const upCache = new Map();
  const appIsUp = async (app) => {
    if (!app.e2e) return true;
    if (!upCache.has(app.id)) upCache.set(app.id, await checkUp(app.e2e.health));
    return upCache.get(app.id);
  };

  for (const { app, suite } of selected) {
    if (cancelled) break;

    if (Number(suite.tier) === 3) {
      // eslint-disable-next-line no-await-in-loop
      const up = await appIsUp(app);
      if (!up) {
        send({
          type: 'blocked', suiteId: suite.id, suiteName: suite.name, app: app.name,
          reason: app.name + ' is not running at ' + app.e2e.health +
            ' — start it first. The console never starts or stops your servers.',
        });
        continue;
      }
    }

    const record = {
      id: suite.id, name: suite.name, app: app.name, tier: suite.tier,
      addedIn: suite.addedIn, tests: [], passed: 0, failed: 0, skipped: 0, durationMs: 0,
    };

    // eslint-disable-next-line no-await-in-loop
    const summary = await runSuite(app, suite, (evt) => {   // eslint-disable-line no-loop-func
      if (evt.type === 'test') {
        record.tests.push({ status: evt.status, title: evt.title, durationMs: evt.durationMs });
      }
      send(Object.assign({ suiteId: suite.id, suiteName: suite.name, app: app.name }, evt));
    }, handle);

    record.passed = summary.passed;
    record.failed = summary.failed;
    record.skipped = summary.skipped;
    record.durationMs = summary.durationMs;
    record.trust = store.computeTrust(summary.passed, summary.failed, summary.skipped);

    run.suites.push(record);
    run.passed += summary.passed;
    run.failed += summary.failed;
    run.skipped += summary.skipped;
  }

  run.durationMs = Date.now() - started;
  run.trust = store.computeTrust(run.passed, run.failed, run.skipped);
  run.cancelled = cancelled;

  store.saveRun(run);
  send({
    type: 'run-done',
    runId,
    passed: run.passed, failed: run.failed, skipped: run.skipped,
    trust: run.trust, durationMs: run.durationMs, cancelled,
  });

  activeRun = null;
  if (!res.writableEnded) res.end();
}

function promote(req, res) {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let payload;
    try { payload = JSON.parse(body || '{}'); }
    catch { return sendJson(res, 400, { error: 'Body must be JSON.' }); }

    const { appId, release, suites } = payload;
    if (!appId || !release || !Array.isArray(suites) || !suites.length) {
      return sendJson(res, 400, { error: 'appId, release and a non-empty suites array are required.' });
    }

    const registry = store.readRegistry();
    const app = registry.apps.find((a) => a.id === appId);
    if (!app) return sendJson(res, 404, { error: 'Unknown application: ' + appId });

    const added = [];
    suites.forEach((s) => {
      if (!s.id || !s.name || !s.cmd) return;
      if (app.suites.some((x) => x.id === s.id)) return;   // promotion is idempotent
      app.suites.push({
        id: s.id, name: s.name, tier: s.tier || 3,
        addedIn: release, cmd: s.cmd, parser: s.parser || 'playwright',
      });
      added.push(s.id);
    });

    if (registry.releases.indexOf(release) === -1) registry.releases.push(release);
    store.writeRegistry(registry);
    sendJson(res, 200, { promoted: added, release, total: app.suites.length });
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const p = url.pathname;

  if (p === '/api/registry') return sendJson(res, 200, store.readRegistry());
  if (p === '/api/runs') return sendJson(res, 200, store.listRuns());
  if (p.startsWith('/api/runs/')) {
    const run = store.getRun(p.slice('/api/runs/'.length));
    return run ? sendJson(res, 200, run) : sendJson(res, 404, { error: 'No such run.' });
  }
  if (p === '/api/discover') {
    const found = discover.unregistered(store.readRegistry());
    const appFilter = url.searchParams.get('app');
    return sendJson(res, 200, appFilter && appFilter !== 'all'
      ? found.filter((s) => s.appId === appFilter) : found);
  }
  if (p === '/api/changes') {
    return sendJson(res, 200, impact.summarise(store.readRegistry(), url.searchParams.get('base') || ''));
  }
  if (p === '/api/run/stream') return streamRun(req, res, url);
  if (p === '/api/promote' && req.method === 'POST') return promote(req, res);
  if (p === '/api/status') return sendJson(res, 200, { ok: true, activeRun });

  if (p.startsWith('/api/')) return sendJson(res, 404, { error: 'Unknown endpoint.' });
  return serveStatic(req, res, p);
});

server.listen(PORT, () => {
  store.ensureDirs();
  console.log('[test-console] listening on http://localhost:' + PORT);
});
