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

/**
 * One suite's failures, with the error text and the command that reproduces it.
 *
 * Shared by the run report and the release report. When the suite carries
 * provenance — it does in a release rollup, where suites come from different
 * runs — that line is printed, because "which run said this, at which commit"
 * is the first question anyone asks of a stitched-together document.
 */
function suiteFailuresMd(s, L) {
  L.push('### ' + s.app + ' · ' + s.name);
  L.push('');
  L.push('Tier ' + s.tier + ' · added in ' + (s.addedIn || 'unknown release') +
    ' · ' + s.passed + ' passed, ' + s.failed + ' failed, ' + s.skipped + ' skipped');
  if (s.fromRun) {
    L.push('');
    L.push('_Result from run `' + s.fromRun + '` at commit `' + s.fromCommit +
      '`, ' + fmtWhen(s.ranAt) + '._');
  }
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
}

function suiteFailuresHtml(s, parts) {
  parts.push('<section class="suite"><h3>' + esc(s.app) + ' · ' + esc(s.name) + '</h3>');
  parts.push('<p class="sub">Tier ' + esc(s.tier) + ' · added in ' + esc(s.addedIn || 'unknown release') +
    ' · ' + s.passed + ' passed, ' + s.failed + ' failed, ' + s.skipped + ' skipped</p>');
  if (s.fromRun) {
    parts.push('<p class="sub">Result from run <code>' + esc(s.fromRun) + '</code> at commit <code>' +
      esc(s.fromCommit) + '</code>, ' + esc(fmtWhen(s.ranAt)) + '</p>');
  }
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
    failingSuites.forEach((s) => suiteFailuresMd(s, L));
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
    failingSuites.forEach((s) => suiteFailuresHtml(s, parts));
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
.callout{background:#fffbeb;border:1px solid #fcd34d;border-left-width:4px;border-radius:7px;
padding:11px 14px;font-size:13px;color:#78350f;margin:14px 0}
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

/* ------------------------------------------------------------------ release */

function releaseTitle(rel) {
  return rel.apps.length === 1 ? rel.apps[0]
    : rel.apps.length ? rel.apps.length + ' applications'
    : 'Release';
}

function releaseHeadline(rel) {
  const total = rel.passed + rel.failed + rel.skipped;
  if (!rel.runs.length) return 'NO RUNS SELECTED.';
  if (rel.failed) {
    return rel.failed + ' failure' + (rel.failed === 1 ? '' : 's') + ' still open across ' +
      rel.suites.filter((s) => s.failed > 0).length + ' suite' +
      (rel.suites.filter((s) => s.failed > 0).length === 1 ? '' : 's') + '.';
  }
  if (rel.notCovered.length || rel.blocked.length) {
    return 'Nothing that ran failed — but ' + (rel.notCovered.length + rel.blocked.length) +
      ' suite' + (rel.notCovered.length + rel.blocked.length === 1 ? '' : 's') + ' never ran.';
  }
  return 'All ' + total + ' test' + (total === 1 ? '' : 's') + ' passed.';
}

function releaseMarkdown(rel) {
  const L = [];
  const failing = rel.suites.filter((s) => s.failed > 0);

  L.push('# Release report — ' + releaseTitle(rel));
  L.push('');
  L.push('**' + releaseHeadline(rel) + '**');
  L.push('');
  L.push('| | |');
  L.push('|---|---|');
  L.push('| Runs combined | ' + rel.runs.length + ' |');
  L.push('| Period | ' + fmtWhen(rel.startedAt) + ' → ' + fmtWhen(rel.endedAt) + ' |');
  L.push('| Newest commit | `' + rel.headCommit + '` |');
  L.push('| Suites covered | ' + rel.suites.length + ' |');
  L.push('');
  L.push('| Passed | Failed | Skipped | Trust |');
  L.push('|---:|---:|---:|---:|');
  L.push('| ' + rel.passed + ' | ' + rel.failed + ' | ' + rel.skipped + ' | ' + rel.trust + '% |');
  L.push('');
  L.push('_Each suite shows its newest result. Where a suite ran more than once, the later run ' +
    'supersedes the earlier one._');
  if (rel.mixedCommits) {
    L.push('');
    L.push('> **These results are not from a single point in time.** The runs below ran against ' +
      'different commits, so a suite reported green may have last run against older code. Each ' +
      'suite states the commit it ran at.');
  }
  L.push('');

  if (rel.missing.length) {
    L.push('> ' + rel.missing.length + ' selected run' + (rel.missing.length === 1 ? ' was' : 's were') +
      ' not found on disk and are absent from this report: ' +
      rel.missing.map((m) => '`' + m + '`').join(', '));
    L.push('');
  }

  // Coverage before verdict. An all-green report that quietly omits half the
  // corpus is the exact failure this section exists to prevent.
  if (rel.notCovered.length || rel.blocked.length) {
    L.push('## Not covered — ' + (rel.notCovered.length + rel.blocked.length) + ' suite' +
      (rel.notCovered.length + rel.blocked.length === 1 ? '' : 's'));
    L.push('');
    L.push('No selected run reached these, so this report says nothing about them either way:');
    L.push('');
    rel.blocked.forEach((b) => {
      L.push('- **' + b.suiteName + '** (' + b.app + ') — blocked: ' + b.reason);
    });
    rel.notCovered.forEach((s) => {
      L.push('- **' + s.name + '** (' + s.app + ', Tier ' + s.tier + ') — not run');
    });
    L.push('');
  }

  if (!failing.length) {
    L.push('## Open failures');
    L.push('');
    L.push('None.');
    L.push('');
  } else {
    L.push('## Open failures — ' + rel.failed + ' across ' + failing.length +
      ' suite' + (failing.length === 1 ? '' : 's'));
    L.push('');
    failing.forEach((s) => suiteFailuresMd(s, L));
  }

  if (rel.fixed.length) {
    L.push('## Fixed during this release — ' + rel.fixed.length);
    L.push('');
    L.push('These failed in an earlier run and are no longer failing in the newest result for ' +
      'their suite:');
    L.push('');
    rel.fixed.forEach((f) => {
      L.push('- **' + f.title + '** — ' + f.app + ' · ' + f.suite +
        ' (failed in `' + f.failedIn + '`, passing in `' + f.laterRun + '`)');
    });
    L.push('');
  }

  // Kept apart from "fixed" on purpose. A test that went from failing to
  // skipped, or that stopped appearing, has stopped reporting — which is not
  // the same as working, and counting it as a fix is how a release talks itself
  // into being greener than it is.
  if ((rel.stoppedFailing || []).length) {
    L.push('## No longer failing, but not verified — ' + rel.stoppedFailing.length);
    L.push('');
    L.push('These failed earlier and are not failing now, but they did not pass either — they ' +
      'were skipped or did not run at all. Treat them as unverified, not as fixed:');
    L.push('');
    rel.stoppedFailing.forEach((f) => {
      L.push('- **' + f.title + '** — ' + f.app + ' · ' + f.suite +
        ' (failed in `' + f.failedIn + '`, now **' + f.now + '** in `' + f.laterRun + '`)');
    });
    L.push('');
  }

  L.push('## Suite status');
  L.push('');
  L.push('| Application | Suite | Tier | Passed | Failed | Skipped | Trust | From run | Commit |');
  L.push('|---|---|---|---:|---:|---:|---:|---|---|');
  rel.suites.forEach((s) => {
    L.push('| ' + s.app + ' | ' + s.name + ' | ' + s.tier + ' | ' + s.passed + ' | ' +
      s.failed + ' | ' + s.skipped + ' | ' + (s.trust == null ? '—' : s.trust + '%') +
      ' | `' + s.fromRun + '` | `' + s.fromCommit + '`' +
      (s.fromCommit !== rel.headCommit ? ' ⚠ older' : '') + ' |');
  });
  L.push('');

  L.push('## Runs in this report');
  L.push('');
  L.push('| Run | Scope | Commit | Passed | Failed | Skipped | Started |');
  L.push('|---|---|---|---:|---:|---:|---|');
  rel.runs.forEach((r) => {
    L.push('| `' + r.id + '` | ' + r.app + ', ' +
      (r.tier === 'all' ? 'all tiers' : 'Tier ' + r.tier) + ' | `' + r.commit + '` | ' +
      r.passed + ' | ' + r.failed + ' | ' + r.skipped + ' | ' + fmtWhen(r.startedAt) + ' |');
  });
  L.push('');
  L.push('---');
  L.push('');
  L.push('Generated by the Pharaxis Test Console by combining ' + rel.runs.length +
    ' run' + (rel.runs.length === 1 ? '' : 's') + '. Full records are stored under ' +
    '`apps/test-console/data/runs/`.');
  L.push('');

  return L.join('\n');
}

function releaseHtml(rel) {
  const failing = rel.suites.filter((s) => s.failed > 0);
  const parts = [];
  const title = 'Release report — ' + releaseTitle(rel);

  parts.push('<!doctype html><html lang="en"><head><meta charset="utf-8">');
  parts.push('<meta name="viewport" content="width=device-width,initial-scale=1">');
  parts.push('<title>' + esc(title) + '</title><style>' + CSS + '</style></head><body>');
  parts.push('<header><div class="mark">P</div><div><h1>' + esc(releaseTitle(rel)) +
    '</h1><p>Pharaxis One · release report</p></div></header>');

  parts.push('<p class="headline ' + (rel.failed ? 'bad' :
    (rel.notCovered.length || rel.blocked.length) ? 'warn' : 'good') + '">' +
    esc(releaseHeadline(rel)) + '</p>');

  parts.push('<table class="kv"><tbody>' +
    row('Runs combined', String(rel.runs.length)) +
    row('Period', esc(fmtWhen(rel.startedAt)) + ' → ' + esc(fmtWhen(rel.endedAt))) +
    row('Newest commit', '<code>' + esc(rel.headCommit) + '</code>') +
    row('Suites covered', String(rel.suites.length)) +
    '</tbody></table>');

  parts.push('<div class="stats">' +
    stat('Passed', rel.passed, 'pass') +
    stat('Failed', rel.failed, rel.failed ? 'fail' : '') +
    stat('Skipped', rel.skipped, rel.skipped ? 'skip' : '') +
    stat('Trust', rel.trust + '%', '') +
    '</div>');
  parts.push('<p class="note">Each suite shows its newest result. Where a suite ran more than ' +
    'once, the later run supersedes the earlier one.</p>');

  if (rel.mixedCommits) {
    parts.push('<p class="callout"><b>These results are not from a single point in time.</b> ' +
      'The runs below ran against different commits, so a suite reported green may have last run ' +
      'against older code. Each suite states the commit it ran at.</p>');
  }
  if (rel.missing.length) {
    parts.push('<p class="callout">' + rel.missing.length + ' selected run' +
      (rel.missing.length === 1 ? ' was' : 's were') + ' not found on disk and are absent: ' +
      rel.missing.map((m) => '<code>' + esc(m) + '</code>').join(', ') + '</p>');
  }

  if (rel.notCovered.length || rel.blocked.length) {
    parts.push('<h2>Not covered — ' + (rel.notCovered.length + rel.blocked.length) +
      ' suite' + (rel.notCovered.length + rel.blocked.length === 1 ? '' : 's') + '</h2>');
    parts.push('<p class="note">No selected run reached these, so this report says nothing ' +
      'about them either way.</p><ul class="blocked">');
    rel.blocked.forEach((b) => {
      parts.push('<li><b>' + esc(b.suiteName) + '</b> (' + esc(b.app) + ') — blocked: ' +
        esc(b.reason) + '</li>');
    });
    rel.notCovered.forEach((s) => {
      parts.push('<li><b>' + esc(s.name) + '</b> (' + esc(s.app) + ', Tier ' + esc(s.tier) +
        ') — not run</li>');
    });
    parts.push('</ul>');
  }

  parts.push('<h2>Open failures' + (rel.failed ? ' — ' + rel.failed + ' across ' +
    failing.length + ' suite' + (failing.length === 1 ? '' : 's') : '') + '</h2>');
  if (!failing.length) parts.push('<p class="note">None.</p>');
  else failing.forEach((s) => suiteFailuresHtml(s, parts));

  if (rel.fixed.length) {
    parts.push('<h2>Fixed during this release — ' + rel.fixed.length + '</h2>');
    parts.push('<p class="note">These failed in an earlier run and are no longer failing in the ' +
      'newest result for their suite.</p><ul class="skips">');
    rel.fixed.forEach((f) => {
      parts.push('<li><b>' + esc(f.title) + '</b> — ' + esc(f.app) + ' · ' + esc(f.suite) +
        ' (failed in <code>' + esc(f.failedIn) + '</code>, passing in <code>' +
        esc(f.laterRun) + '</code>)</li>');
    });
    parts.push('</ul>');
  }

  if ((rel.stoppedFailing || []).length) {
    parts.push('<h2>No longer failing, but not verified — ' + rel.stoppedFailing.length + '</h2>');
    parts.push('<p class="note">These failed earlier and are not failing now, but they did not ' +
      'pass either — they were skipped or did not run at all. Treat them as unverified, not as ' +
      'fixed.</p><ul class="skips">');
    rel.stoppedFailing.forEach((f) => {
      parts.push('<li><b>' + esc(f.title) + '</b> — ' + esc(f.app) + ' · ' + esc(f.suite) +
        ' (failed in <code>' + esc(f.failedIn) + '</code>, now <b>' + esc(f.now) +
        '</b> in <code>' + esc(f.laterRun) + '</code>)</li>');
    });
    parts.push('</ul>');
  }

  parts.push('<h2>Suite status</h2><table class="grid"><thead><tr>' +
    '<th>Application</th><th>Suite</th><th>Tier</th><th class="r">Passed</th>' +
    '<th class="r">Failed</th><th class="r">Skipped</th><th class="r">Trust</th>' +
    '<th>From run</th><th>Commit</th></tr></thead><tbody>');
  rel.suites.forEach((s) => {
    parts.push('<tr><td>' + esc(s.app) + '</td><td class="m">' + esc(s.name) + '</td>' +
      '<td>' + esc(s.tier) + '</td><td class="r">' + s.passed + '</td>' +
      '<td class="r' + (s.failed ? ' bad' : '') + '">' + s.failed + '</td>' +
      '<td class="r' + (s.skipped ? ' warn' : '') + '">' + s.skipped + '</td>' +
      '<td class="r">' + (s.trust == null ? '—' : s.trust + '%') + '</td>' +
      '<td class="m">' + esc(s.fromRun) + '</td>' +
      '<td class="m">' + esc(s.fromCommit) +
      (s.fromCommit !== rel.headCommit ? ' <span class="pill">older</span>' : '') + '</td></tr>');
  });
  parts.push('</tbody></table>');

  parts.push('<h2>Runs in this report</h2><table class="grid"><thead><tr>' +
    '<th>Run</th><th>Scope</th><th>Commit</th><th class="r">Passed</th>' +
    '<th class="r">Failed</th><th class="r">Skipped</th><th>Started</th></tr></thead><tbody>');
  rel.runs.forEach((r) => {
    parts.push('<tr><td class="m">' + esc(r.id) + '</td><td>' + esc(r.app) + ', ' +
      esc(r.tier === 'all' ? 'all tiers' : 'Tier ' + r.tier) + '</td>' +
      '<td class="m">' + esc(r.commit) + '</td><td class="r">' + r.passed + '</td>' +
      '<td class="r' + (r.failed ? ' bad' : '') + '">' + r.failed + '</td>' +
      '<td class="r">' + r.skipped + '</td><td class="m">' + esc(fmtWhen(r.startedAt)) +
      '</td></tr>');
  });
  parts.push('</tbody></table>');

  parts.push('<footer>Generated by the Pharaxis Test Console by combining ' + rel.runs.length +
    ' run' + (rel.runs.length === 1 ? '' : 's') +
    '. Full records: <code>apps/test-console/data/runs/</code></footer>');
  parts.push('</body></html>');
  return parts.join('\n');
}

/** A filename that says what it is without being opened. */
function filename(run, ext) {
  const app = (run.app === 'all' ? 'all-apps' : run.app).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const when = String(run.startedAt || '').slice(0, 10) || 'undated';
  return path.basename('pharaxis-test-report-' + app + '-' + when + '-' + run.id + '.' + ext);
}

/** Same idea for a rollup, named by what it covers rather than by one run id. */
function releaseFilename(rel, ext) {
  const who = releaseTitle(rel).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const when = String(rel.endedAt || '').slice(0, 10) || 'undated';
  return path.basename('pharaxis-release-report-' + who + '-' + when + '.' + ext);
}

module.exports = { markdown, html, filename, releaseMarkdown, releaseHtml, releaseFilename };
