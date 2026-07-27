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
function runSuite(app, suite, onEvent) {
  return new Promise((resolve) => {
    const cwd = path.resolve(REPO_ROOT, suite.cwd || app.cwd);
    const env = Object.assign({}, process.env, app.env || {}, suite.env || {}, {
      NODE_ENV: 'test',
      FORCE_COLOR: '0',
      CI: '1',
    });

    const started = Date.now();
    let passed = 0, failed = 0, skipped = 0;

    onEvent({ type: 'start', suite: suite.id, name: suite.name, cmd: suite.cmd, cwd });

    const child = spawn(suite.cmd, {
      cwd,
      env,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

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
          if (evt.status === 'pass') passed++;
          else if (evt.status === 'fail') failed++;
          else skipped++;
          onEvent(Object.assign({ type: 'test' }, evt));
        } else {
          const clean = stripAnsi(line).replace(/\s+$/, '');
          if (clean.trim()) onEvent({ type: 'output', line: clean });
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
