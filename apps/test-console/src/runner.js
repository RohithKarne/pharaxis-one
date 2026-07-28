'use strict';

/**
 * runner.js — executes a suite and emits one event per test as it finishes.
 *
 * Why line parsing rather than the JSON reporters: `--reporter=json` only
 * writes once, at the very end, so nothing can be streamed while a run is in
 * flight. The list-style reporters print a line per test as each completes,
 * which is what makes the live view actually live.
 *
 * Statuses are normalised to pass | fail | skip across Playwright, Jest and
 * Vitest, because all three use different glyphs for the same three outcomes.
 */

const { spawn } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

function stripAnsi(s) {
  return String(s).replace(ANSI, '');
}

/**
 * Recognise a completed test line from any of the three runners.
 *
 *   Playwright list:  ✓  3 [chromium] › e2e/smoke.spec.js:4:3 › suite › title (610ms)
 *   Jest verbose:     ✓ resolves an active picklist (12 ms)
 *   Vitest:           ✓ src/foo.test.js > does the thing 4ms
 */
const PASS = /^\s*(?:[✓✔√])\s+(.*)$/;
const FAIL = /^\s*(?:[✘✕×✗])\s+(.*)$/;
// A bare "- " is too common in ordinary runner output to treat as a skip, so a
// hyphen only counts when followed by the wide gap Playwright's list reporter
// prints. The other glyphs are unambiguous.
const SKIP = /^\s*(?:[–○↓]\s+|-\s{2,})(.*)$/;
const DURATION = /\((\d+(?:\.\d+)?)\s*m?s\)\s*$/;

/**
 * Runner summary lines, used to correct the counts.
 *
 * Jest does not reliably emit per-test lines even with --verbose, so parsing
 * only the per-test output would report "1 passed" for a 74-test suite. That
 * is precisely the class of lie this tool exists to catch, so the authoritative
 * totals come from the summary when one is present.
 *
 *   Jest:   Tests:       1 failed, 72 passed, 73 total
 *   Vitest: Tests  8 passed (8)
 */
function parseSummary(raw) {
  const line = stripAnsi(raw);
  if (!/^\s*Tests[:\s]/.test(line)) return null;
  const num = (re) => { const m = re.exec(line); return m ? Number(m[1]) : 0; };
  const passed  = num(/(\d+)\s+passed/);
  const failed  = num(/(\d+)\s+failed/);
  const skipped = num(/(\d+)\s+(?:skipped|todo|pending)/);
  if (passed + failed + skipped === 0) return null;
  return { passed, failed, skipped };
}

function parseLine(raw) {
  const line = stripAnsi(raw).replace(/\s+$/, '');
  if (!line.trim()) return null;

  let status = null;
  let m = PASS.exec(line);
  if (m) status = 'pass';
  if (!status) { m = FAIL.exec(line); if (m) status = 'fail'; }
  if (!status) { m = SKIP.exec(line); if (m) status = 'skip'; }
  if (!status) return null;

  let title = m[1].trim();

  // Pull the duration out of the tail if the reporter supplied one.
  let durationMs = null;
  const d = DURATION.exec(title);
  if (d) {
    const n = parseFloat(d[1]);
    durationMs = /ms\)\s*$/.test(title) ? Math.round(n) : Math.round(n * 1000);
    title = title.replace(DURATION, '').trim();
  }

  // Playwright prefixes an index and a project name; drop both so the title
  // reads the way a person would say it.
  title = title
    .replace(/^\d+\s+/, '')
    .replace(/^\[[^\]]+\]\s*›\s*/, '')
    .trim();

  if (!title) return null;
  return { status, title, durationMs };
}

/**
 * Run one suite.
 *
 * onEvent receives:
 *   { type: 'start',  suite, cmd, cwd }
 *   { type: 'test',   status, title, durationMs }
 *   { type: 'output', line }                       — unrecognised runner output
 *   { type: 'done',   code, passed, failed, skipped, durationMs }
 *
 * Resolves with the summary. Never rejects on a failing suite — a suite that
 * fails is a result, not an error.
 */
function runSuite(app, suite, onEvent, handle) {
  return new Promise((resolve) => {
    const cwd = path.resolve(REPO_ROOT, suite.cwd || app.cwd);
    const env = Object.assign({}, process.env, app.env || {}, suite.env || {}, {
      NODE_ENV: 'test',
      FORCE_COLOR: '0',
      CI: '1',
    });

    // Point the suite at the already-running app. This also disables the
    // playwright config's webServer block, which is deliberate: the console
    // must never own an application server's lifetime. Managing one is how a
    // cancelled Tier 3 run previously killed a developer's running backends.
    if (app.e2e && app.e2e.baseUrlEnv && Number(suite.tier) === 3) {
      env[app.e2e.baseUrlEnv] = app.e2e.url;
    }

    const started = Date.now();
    let passed = 0, failed = 0, skipped = 0;

    onEvent({ type: 'start', suite: suite.id, name: suite.name, cmd: suite.cmd, cwd });

    // detached so the whole process group can be signalled — `shell: true`
    // means the child is a shell, and killing only the shell leaves the real
    // test runner orphaned and still writing to the databases.
    const child = spawn(suite.cmd, {
      cwd,
      env,
      shell: true,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Let the caller stop a run that is genuinely in flight, rather than only
    // declining to start the next suite.
    if (handle) {
      handle.kill = () => {
        try { process.kill(-child.pid, 'SIGTERM'); }
        catch { try { child.kill('SIGTERM'); } catch { /* already gone */ } }
      };
    }

    // Playwright prints failure detail in numbered blocks *after* the run:
    //   1) [chromium] › e2e/x.spec.js:4:3 › suite › title ───────────
    //      Error: …
    // Attributing those blocks to the right test is what makes the failure
    // panel trustworthy; scraping "whatever was printed nearby" showed the
    // wrong message when a suite had several failures.
    const FAIL_HEADER = /^\s*(\d+)\)\s+(?:\[[^\]]+\]\s*›\s*)?(.+?)(?:\s*─{3,}.*)?$/;
    let detailFor = null;                 // title currently being described
    const details = new Map();            // title -> error text

    // Playwright prints every retry as its own result line:
    //   ✘  1 … › Templates section renders (177ms)
    //   ✘  2 … › Templates section renders (retry #1) (161ms)
    // Counting both doubles the failure count and halves trust, and a report
    // built on that sends someone chasing twice the work that exists. A retry
    // supersedes the attempt before it — only the final attempt is the verdict.
    //
    // Only a line that actually carries the retry suffix supersedes anything.
    // Deduplicating on title alone would silently merge the same test run under
    // two Playwright projects, which are genuinely two results.
    const RETRY_SUFFIX = /\s*\(retry\s*#(\d+)\)\s*$/i;
    const attempts = new Map();           // base title -> status of last attempt

    let buf = '';
    let summary = null;
    const consume = (chunk) => {
      buf += chunk.toString();
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);

        const sum = parseSummary(line);
        if (sum) { summary = sum; onEvent({ type: 'output', line: stripAnsi(line).trim() }); continue; }

        const evt = parseLine(line);
        if (evt) {
          const rm = RETRY_SUFFIX.exec(evt.title);
          const base = rm ? evt.title.replace(RETRY_SUFFIX, '').trim() : evt.title;

          let supersedes = false;
          if (rm && attempts.has(base)) {
            const prev = attempts.get(base);
            if (prev === 'pass') passed--;
            else if (prev === 'fail') failed--;
            else skipped--;
            supersedes = true;
          }
          attempts.set(base, evt.status);

          if (evt.status === 'pass') passed++;
          else if (evt.status === 'fail') failed++;
          else skipped++;

          detailFor = null;                       // a new result ends any block
          onEvent(Object.assign({ type: 'test', base, retry: rm ? Number(rm[1]) : 0, supersedes }, evt));
        } else {
          const clean = stripAnsi(line).replace(/\s+$/, '');
          // Blank lines sit inside failure blocks — skip them without ending
          // the block we are currently attributing output to.
          if (!clean.trim()) continue;

          const header = FAIL_HEADER.exec(clean);
          if (header && /›/.test(header[2])) {
            // Normalise to the same shape parseLine produces, so the title
            // matches the row the user clicked.
            detailFor = header[2].replace(/^\d+\s+/, '').trim();
            details.set(detailFor, '');
            onEvent({ type: 'output', line: clean });
            continue;
          }

          if (detailFor) {
            const prev = details.get(detailFor) || '';
            if (prev.length < 1200) details.set(detailFor, prev ? prev + '\n' + clean : clean);
            onEvent({ type: 'detail', title: detailFor, line: clean });
          } else {
            onEvent({ type: 'output', line: clean });
          }
        }
      }
    };

    child.stdout.on('data', consume);
    child.stderr.on('data', consume);

    const finish = (code) => {
      if (buf.trim()) consume('\n');
      const durationMs = Date.now() - started;

      // The runner's own summary wins over what we could parse line by line.
      // Jest in particular reports totals it never printed per test.
      if (summary && (summary.passed + summary.failed + summary.skipped) > (passed + failed + skipped)) {
        onEvent({
          type: 'reconcile',
          reason: 'runner summary reported more tests than were streamed',
          streamed: passed + failed + skipped,
          reported: summary.passed + summary.failed + summary.skipped,
        });
        passed = summary.passed;
        failed = summary.failed;
        skipped = summary.skipped;
      }

      // A suite with no per-test output (a syntax check, say) still has a
      // verdict: its exit code. Record that as a single result rather than
      // reporting an empty run as if it had passed everything.
      if (passed + failed + skipped === 0) {
        const status = code === 0 ? 'pass' : 'fail';
        if (status === 'pass') passed = 1; else failed = 1;
        onEvent({ type: 'test', status, title: suite.name + ' (exit ' + code + ')', durationMs });
      }

      // Ship the collected failure blocks so the UI can attach the right error
      // to the right test rather than guessing from nearby output.
      if (details.size) {
        onEvent({ type: 'details', map: Object.fromEntries(details) });
      }

      // Named `result`, not `summary` — `summary` is the outer variable holding
      // the runner's own reported totals, and shadowing it here put the read
      // above into the temporal dead zone.
      const result = { code, passed, failed, skipped, durationMs };
      onEvent(Object.assign({ type: 'done' }, result));
      resolve(result);
    };

    child.on('error', (err) => {
      onEvent({ type: 'output', line: 'runner error: ' + err.message });
      finish(-1);
    });
    child.on('close', finish);
  });
}

module.exports = { runSuite, parseLine, parseSummary, stripAnsi, REPO_ROOT };
