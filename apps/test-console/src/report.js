'use strict';

/**
 * report.js — turns a stored run into something you can send to a person.
 *
 * The audience is an engineer who was not watching the screen. So the report is
 * built around what they need to act, in this order:
 *
 *   1. What failed, grouped by suite, with the error text.
 *   2. The exact command to reproduce each failing suite.
 *   3. What did NOT run — blocked suites and skipped tests — kept separate from
 *      failures, because "your app wasn't running" is not a product defect and
 *      sending it as one wastes the reader's afternoon.
 *
 * Two formats from the same data: Markdown for pasting into a message, HTML for
 * attaching or printing. Nothing here re-runs or re-interprets anything — it
 * only renders the run record that was already saved to disk.
 */

const path = require('node:path');

function fmtMs(ms) {
  if (ms == null) return '—';
  return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's';
}

function fmtWhen(iso) {
  if (!iso) return 'unknown time';
  return String(iso).replace('T', ' ').replace(/\.\d+Z?$/, '').slice(0, 16) + ' UTC';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

/**
 * The error text for one test.
 *
 * Playwright's failure-block header carries file:line and the full title chain,
 * which usually matches the streamed row exactly — but not always, so fall back
 * to containment rather than reporting "no output captured" for a failure that
 * clearly produced some.
 */
function detailFor(suite, title) {
  const map = suite.details || {};
  if (map[title]) return map[title];
  const keys = Object.keys(map);
  const hit = keys.find((k) => k === title || k.indexOf(title) !== -1 || title.indexOf(k) !== -1);
  return hit ? map[hit] : '';
}

/** The command that reproduces this suite on its own, environment included. */
function repro(suite) {
  const env = Object.keys(suite.env || {})
    .map((k) => k + '=' + suite.env[k])
    .join(' ');
  const cd = suite.cwd ? 'cd ' + suite.cwd + ' && ' : '';
  return cd + (env ? env + ' ' : '') + (suite.cmd || '(command not recorded)');
}

/** Tests of one status, in the order they ran. */
function testsWith(suite, status) {
  return (suite.tests || []).filter((t) => t.status === status);
}

/**
 * The application's display name.
 *
 * run.app holds the id the run was scoped by ("cp-portal"), which is not what
 * the app is called. The suites carry the real name, so prefer that and fall
 * back to the id only when nothing ran.
 */
function appLabel(run) {
  if (run.app === 'all') return 'All applications';
  const named = (run.suites || []).find((s) => s.app) || (run.blocked || []).find((b) => b.app);
  return named ? named.app : run.app;
}

function scopeLine(run) {
  const app = appLabel(run);
  const tier = !run.tier || run.tier === 'all' ? 'all tiers' : 'Tier ' + run.tier;
  const mode = run.mode === 'release'
    ? 'current release (only suites the change in flight can affect)'
    : 'regression (the full cumulative corpus)';
  return app + ' · ' + tier + ' · ' + mode;
}

/**
 * A run is not just its verdict. Trust says how much of the suite actually
 * asserted anything, and a reader who sees only "48 failed" cannot tell a bad
 * build from a suite that never ran. Both numbers travel together.
 */
function headline(run) {
  const total = run.passed + run.failed + run.skipped;
  if (run.cancelled) return 'STOPPED before finishing — the figures below are partial.';
  if (total === 0) return 'NO TESTS RAN.';
  const tests = total === 1 ? 'test' : 'tests';
  if (run.failed) return run.failed + ' of ' + total + ' ' + tests + ' failed.';
  if (run.skipped) {
    return 'All executed tests passed, but ' + run.skipped +
      (run.skipped === 1 ? ' was' : ' were') + ' skipped.';
  }
  return 'All ' + total + ' ' + tests + ' passed.';
}

function markdown(run) {
  const L = [];
  const failingSuites = (run.suites || []).filter((s) => s.failed > 0);
  const skippingSuites = (run.suites || []).filter((s) => s.skipped > 0);

  L.push('# Test report — ' + appLabel(run));
  L.push('');
  L.push('**' + headline(run) + '**');
  L.push('');
  L.push('| | |');
  L.push('|---|---|');
  L.push('| Run | `' + run.id + '` |');
  L.push('| Commit | `' + run.commit + '` |');
  L.push('| Scope | ' + scopeLine(run) + ' |');
  L.push('| Started | ' + fmtWhen(run.startedAt) + ' |');
  L.push('| Duration | ' + fmtMs(run.durationMs) + ' |');
  L.push('');
  L.push('| Passed | Failed | Skipped | Trust |');
  L.push('|---:|---:|---:|---:|');
  L.push('| ' + run.passed + ' | ' + run.failed + ' | ' + run.skipped + ' | ' + run.trust + '% |');
  L.push('');
  L.push('_Trust is not the pass rate: it is the share of the suite that actually executed. ' +
    'A high verdict with low trust means most of the suite never asserted anything._');
  L.push('');

  // Blocked suites first. These are environment, not code — and a reader who
  // starts debugging them is debugging nothing.
  if ((run.blocked || []).length) {
    L.push('## Not run — ' + run.blocked.length + ' suite' + (run.blocked.length === 1 ? '' : 's') + ' blocked');
    L.push('');
    L.push('These never executed, so they are **not** failures and there is nothing to fix in the code:');
    L.push('');
    run.blocked.forEach((b) => {
      L.push('- **' + b.suiteName + '** (' + b.app + ') — ' + b.reason);
    });
    L.push('');
  }

  if (!failingSuites.length) {
    L.push('## Failures');
    L.push('');
    L.push('None.');
    L.push('');
  } else {
    L.push('## Failures — ' + run.failed + ' across ' + failingSuites.length +
      ' suite' + (failingSuites.length === 1 ? '' : 's'));
    L.push('');
    failingSuites.forEach((s) => {
      L.push('### ' + s.app + ' · ' + s.name);
      L.push('');
      L.push('Tier ' + s.tier + ' · added in ' + (s.addedIn || 'unknown release') +
        ' · ' + s.passed + ' passed, ' + s.failed + ' failed, ' + s.skipped + ' skipped');
      L.push('');
      L.push('Reproduce:');
      L.push('');
      L.push('```bash');
      L.push(repro(s));
      L.push('```');
      L.push('');
      testsWith(s, 'fail').forEach((t, i) => {
        L.push('**' + (i + 1) + '. ' + (t.base || t.title) + '**' +
          (t.retry ? ' _(failed again on retry #' + t.retry + ')_' : '') +
          (t.durationMs != null ? ' — ' + fmtMs(t.durationMs) : ''));
        const err = detailFor(s, t.base || t.title);
        L.push('');
        if (err) {
          L.push('```');
          L.push(err.trim());
          L.push('```');
        } else {
          L.push('_No error output was captured for this test._');
        }
        L.push('');
      });
    });
  }

  if (skippingSuites.length) {
    L.push('## Skipped — ' + run.skipped + ' test' + (run.skipped === 1 ? '' : 's'));
    L.push('');
    L.push('Skipped tests report neither pass nor fail. They are listed because they are the ' +
      'part of the suite that is silently not protecting anything.');
    L.push('');
    skippingSuites.forEach((s) => {
      L.push('**' + s.app + ' · ' + s.name + '** — ' + s.skipped + ' skipped');
      L.push('');
      testsWith(s, 'skip').forEach((t) => L.push('- ' + t.title));
      L.push('');
    });
  }

  L.push('## All suites in this run');
  L.push('');
  L.push('| Application | Suite | Tier | Passed | Failed | Skipped | Trust | Duration |');
  L.push('|---|---|---|---:|---:|---:|---:|---:|');
  (run.suites || []).forEach((s) => {
    L.push('| ' + s.app + ' | ' + s.name + ' | ' + s.tier + ' | ' + s.passed + ' | ' +
      s.failed + ' | ' + s.skipped + ' | ' + (s.trust == null ? '—' : s.trust + '%') +
      ' | ' + fmtMs(s.durationMs) + ' |');
  });
  L.push('');
  L.push('---');
  L.push('');
  L.push('Generated by the Pharaxis Test Console from run `' + run.id + '` at commit `' +
    run.commit + '`. The full record is stored at ' +
    '`apps/test-console/data/runs/' + run.id + '.json`.');
  L.push('');

  return L.join('\n');
}

function html(run) {
  const failingSuites = (run.suites || []).filter((s) => s.failed > 0);
  const skippingSuites = (run.suites || []).filter((s) => s.skipped > 0);
  const title = 'Test report — ' + appLabel(run) + ' · ' + run.id;

  const parts = [];
  parts.push('<!doctype html><html lang="en"><head><meta charset="utf-8">');
  parts.push('<meta name="viewport" content="width=device-width,initial-scale=1">');
  parts.push('<title>' + esc(title) + '</title><style>' + CSS + '</style></head><body>');

  parts.push('<header><div class="mark">P</div><div><h1>' + esc(appLabel(run)) +
    '</h1><p>Pharaxis One · test report</p></div></header>');

  parts.push('<p class="headline ' + (run.failed ? 'bad' : run.skipped ? 'warn' : 'good') + '">' +
    esc(headline(run)) + '</p>');

  parts.push('<table class="kv"><tbody>' +
    row('Run', '<code>' + esc(run.id) + '</code>') +
    row('Commit', '<code>' + esc(run.commit) + '</code>') +
    row('Scope', esc(scopeLine(run))) +
    row('Started', esc(fmtWhen(run.startedAt))) +
    row('Duration', esc(fmtMs(run.durationMs))) +
    '</tbody></table>');

  parts.push('<div class="stats">' +
    stat('Passed', run.passed, 'pass') +
    stat('Failed', run.failed, run.failed ? 'fail' : '') +
    stat('Skipped', run.skipped, run.skipped ? 'skip' : '') +
    stat('Trust', run.trust + '%', '') +
    '</div>');
  parts.push('<p class="note">Trust is not the pass rate — it is the share of the suite that ' +
    'actually executed. A high verdict with low trust means most of the suite never asserted anything.</p>');

  if ((run.blocked || []).length) {
    parts.push('<h2>Not run — ' + run.blocked.length + ' suite' +
      (run.blocked.length === 1 ? '' : 's') + ' blocked</h2>');
    parts.push('<p class="note">These never executed, so they are <b>not</b> failures and there ' +
      'is nothing to fix in the code.</p><ul class="blocked">');
    run.blocked.forEach((b) => {
      parts.push('<li><b>' + esc(b.suiteName) + '</b> (' + esc(b.app) + ') — ' + esc(b.reason) + '</li>');
    });
    parts.push('</ul>');
  }

  parts.push('<h2>Failures' + (run.failed ? ' — ' + run.failed + ' across ' +
    failingSuites.length + ' suite' + (failingSuites.length === 1 ? '' : 's') : '') + '</h2>');
  if (!failingSuites.length) {
    parts.push('<p class="note">None.</p>');
  } else {
    failingSuites.forEach((s) => {
      parts.push('<section class="suite"><h3>' + esc(s.app) + ' · ' + esc(s.name) + '</h3>');
      parts.push('<p class="sub">Tier ' + esc(s.tier) + ' · added in ' + esc(s.addedIn || 'unknown release') +
        ' · ' + s.passed + ' passed, ' + s.failed + ' failed, ' + s.skipped + ' skipped</p>');
      parts.push('<p class="sub">Reproduce:</p><pre class="cmd">' + esc(repro(s)) + '</pre>');
      testsWith(s, 'fail').forEach((t, i) => {
        const err = detailFor(s, t.base || t.title);
        parts.push('<div class="fail-item"><div class="ft"><span class="n">' + (i + 1) + '</span>' +
          esc(t.base || t.title) +
          (t.retry ? '<span class="pill">failed again on retry #' + esc(t.retry) + '</span>' : '') +
          (t.durationMs != null ? '<span class="ms">' + esc(fmtMs(t.durationMs)) + '</span>' : '') +
          '</div>' +
          (err ? '<pre>' + esc(err.trim()) + '</pre>'
               : '<p class="note">No error output was captured for this test.</p>') +
          '</div>');
      });
      parts.push('</section>');
    });
  }

  if (skippingSuites.length) {
    parts.push('<h2>Skipped — ' + run.skipped + ' test' + (run.skipped === 1 ? '' : 's') + '</h2>');
    parts.push('<p class="note">Skipped tests report neither pass nor fail. They are listed ' +
      'because they are the part of the suite that is silently not protecting anything.</p>');
    skippingSuites.forEach((s) => {
      parts.push('<h3>' + esc(s.app) + ' · ' + esc(s.name) + '</h3><ul class="skips">');
      testsWith(s, 'skip').forEach((t) => parts.push('<li>' + esc(t.title) + '</li>'));
      parts.push('</ul>');
    });
  }

  parts.push('<h2>All suites in this run</h2><table class="grid"><thead><tr>' +
    '<th>Application</th><th>Suite</th><th>Tier</th><th class="r">Passed</th>' +
    '<th class="r">Failed</th><th class="r">Skipped</th><th class="r">Trust</th>' +
    '<th class="r">Duration</th></tr></thead><tbody>');
  (run.suites || []).forEach((s) => {
    parts.push('<tr><td>' + esc(s.app) + '</td><td class="m">' + esc(s.name) + '</td>' +
      '<td>' + esc(s.tier) + '</td>' +
      '<td class="r">' + s.passed + '</td>' +
      '<td class="r' + (s.failed ? ' bad' : '') + '">' + s.failed + '</td>' +
      '<td class="r' + (s.skipped ? ' warn' : '') + '">' + s.skipped + '</td>' +
      '<td class="r">' + (s.trust == null ? '—' : s.trust + '%') + '</td>' +
      '<td class="r">' + esc(fmtMs(s.durationMs)) + '</td></tr>');
  });
  parts.push('</tbody></table>');

  parts.push('<footer>Generated by the Pharaxis Test Console from run <code>' + esc(run.id) +
    '</code> at commit <code>' + esc(run.commit) + '</code>. Full record: ' +
    '<code>apps/test-console/data/runs/' + esc(run.id) + '.json</code></footer>');

  parts.push('</body></html>');
  return parts.join('\n');
}

function row(k, v) { return '<tr><th>' + esc(k) + '</th><td>' + v + '</td></tr>'; }
function stat(k, v, cls) {
  return '<div class="stat ' + cls + '"><div class="k">' + esc(k) + '</div>' +
    '<div class="v">' + esc(v) + '</div></div>';
}

const CSS = `
:root{--ink:#111827;--ink-2:#4b5563;--ink-3:#9ca3af;--line:#e5e7eb;--bg:#fff;
--pass:#059669;--fail:#dc2626;--skip:#d97706;--brand:#0f766e}
*{box-sizing:border-box}
body{margin:0;padding:32px;max-width:1000px;margin-inline:auto;background:var(--bg);color:var(--ink);
font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
header{display:flex;align-items:center;gap:12px;padding-bottom:18px;border-bottom:2px solid var(--line);margin-bottom:22px}
.mark{width:36px;height:36px;border-radius:9px;background:var(--brand);color:#fff;display:grid;place-items:center;font-weight:700}
h1{font-size:20px;margin:0}
header p{margin:2px 0 0;color:var(--ink-3);font-size:13px}
h2{font-size:16px;margin:32px 0 12px;padding-bottom:7px;border-bottom:1px solid var(--line)}
h3{font-size:14px;margin:20px 0 6px}
.headline{font-size:17px;font-weight:600;margin:0 0 18px}
.headline.bad{color:var(--fail)}.headline.warn{color:var(--skip)}.headline.good{color:var(--pass)}
table{border-collapse:collapse;width:100%;font-size:13px}
.kv{max-width:640px;margin-bottom:20px}
.kv th{text-align:left;width:110px;color:var(--ink-3);font-weight:500;padding:5px 12px 5px 0;vertical-align:top}
.kv td{padding:5px 0}
.grid th,.grid td{border:1px solid var(--line);padding:7px 10px;text-align:left}
.grid th{background:#f9fafb;font-weight:600}
.r{text-align:right}
.bad{color:var(--fail);font-weight:600}.warn{color:var(--skip);font-weight:600}
.m{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);
border:1px solid var(--line);border-radius:9px;overflow:hidden;margin-bottom:12px}
.stat{background:#fff;padding:13px 16px}
.stat .k{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3)}
.stat .v{font-size:24px;font-weight:700;margin-top:2px}
.stat.pass .v{color:var(--pass)}.stat.fail .v{color:var(--fail)}.stat.skip .v{color:var(--skip)}
.note{color:var(--ink-2);font-size:13px;margin:8px 0 0}
.sub{color:var(--ink-3);font-size:12px;margin:4px 0}
.suite{border:1px solid var(--line);border-radius:10px;padding:16px 18px;margin-bottom:18px}
.suite h3{margin-top:0}
pre{background:#f9fafb;border:1px solid var(--line);border-radius:7px;padding:11px 13px;
overflow-x:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.5;margin:6px 0}
pre.cmd{background:#111827;color:#e5e7eb;border-color:#111827}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:#f3f4f6;padding:1px 5px;border-radius:4px}
.fail-item{margin:14px 0 0;padding-top:12px;border-top:1px dashed var(--line)}
.ft{font-weight:600;font-size:13px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.ft .n{background:var(--fail);color:#fff;border-radius:5px;padding:1px 7px;font-size:11px}
.ft .ms{color:var(--ink-3);font-weight:400;font-size:12px;margin-left:auto}
.pill{background:#fef3c7;color:#92400e;border-radius:20px;padding:1px 9px;font-size:11px;font-weight:500}
ul.blocked,ul.skips{margin:8px 0;padding-left:20px;font-size:13px;color:var(--ink-2)}
ul.blocked li,ul.skips li{margin:3px 0}
footer{margin-top:36px;padding-top:14px;border-top:1px solid var(--line);color:var(--ink-3);font-size:12px}
@media print{body{padding:0}.suite{break-inside:avoid}}
`;

/** A filename that says what it is without being opened. */
function filename(run, ext) {
  const app = (run.app === 'all' ? 'all-apps' : run.app).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const when = String(run.startedAt || '').slice(0, 10) || 'undated';
  return path.basename('pharaxis-test-report-' + app + '-' + when + '-' + run.id + '.' + ext);
}

module.exports = { markdown, html, filename };
