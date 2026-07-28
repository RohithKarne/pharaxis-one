'use strict';

/**
 * release.js — rolls several runs into one release-level picture.
 *
 * A release is rarely one execution. Tier 1 runs without the app servers up and
 * Tier 3 needs them; a failure gets fixed and only that app is re-run. By the
 * end there are four or five runs scattered across the history and no single
 * document saying where the release actually stands.
 *
 * The rule is: newest run wins, per suite. Re-run a suite after fixing it and
 * its old failure drops out of the report, because the newer result is simply
 * the truth about that suite.
 *
 * Two things stop that from becoming a lie. A rollup of runs from different
 * days reads as a single moment in time, so every suite carries the run and
 * commit it came from. And suites that no selected run touched are listed
 * explicitly — otherwise an all-green release report means "nothing we ran
 * failed" while being read as "everything was checked".
 */

const store = require('./store');

/** Apps a set of runs claims to speak for. A run scoped to 'all' covers all. */
function appsCovered(runs, registry) {
  const ids = new Set();
  runs.forEach((r) => {
    if (r.app === 'all') registry.apps.forEach((a) => ids.add(a.id));
    else ids.add(r.app);
  });
  // A run scoped by id still names its app on each suite record; trust that too,
  // so a run whose scope string drifted from the registry still resolves.
  runs.forEach((r) => (r.suites || []).forEach((s) => { if (s.appId) ids.add(s.appId); }));
  return ids;
}

/** Failing tests of a suite record, keyed the way the runner keys retries. */
function failingTitles(record) {
  const out = new Set();
  (record.tests || []).forEach((t) => {
    if (t.status === 'fail') out.add(t.base || t.title);
  });
  return out;
}

/**
 * Build the release view.
 *
 * runIds are taken in whatever order they arrive; ordering is decided here by
 * startedAt so the "newest wins" rule cannot depend on how the UI listed them.
 * Unknown ids are dropped rather than throwing — a stale bookmark should not
 * fail the whole report.
 */
function build(runIds) {
  const registry = store.readRegistry();

  const runs = (runIds || [])
    .map((id) => store.getRun(id))
    .filter(Boolean)
    .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));

  const missing = (runIds || []).filter((id) => !store.getRun(id));

  const winner = new Map();     // suiteId -> record, provenance attached
  const history = new Map();    // suiteId -> [{runId, commit, startedAt, failing}]
  const blocked = new Map();    // suiteId -> latest blocked entry

  runs.forEach((run) => {
    (run.suites || []).forEach((record) => {
      const withProvenance = Object.assign({}, record, {
        fromRun: run.id,
        fromCommit: run.commit,
        ranAt: run.startedAt,
      });
      winner.set(record.id, withProvenance);
      // Once a suite runs, any earlier block on it is history.
      blocked.delete(record.id);

      const h = history.get(record.id) || [];
      h.push({
        runId: run.id, commit: run.commit, startedAt: run.startedAt,
        failing: failingTitles(record),
      });
      history.set(record.id, h);
    });

    (run.blocked || []).forEach((b) => {
      // Only stands if no run — this one or a later one — actually executed it.
      if (!winner.has(b.suiteId)) {
        blocked.set(b.suiteId, Object.assign({}, b, { fromRun: run.id, ranAt: run.startedAt }));
      }
    });
  });

  const suites = Array.from(winner.values());

  // Failures that were real earlier in the release and are not failing in the
  // winning result. This is the part that makes a rollup worth having: it shows
  // the fix landed rather than silently dropping the old red row.
  const fixed = [];
  const stoppedFailing = [];
  history.forEach((entries, suiteId) => {
    if (entries.length < 2) return;
    const win = winner.get(suiteId);
    if (!win) return;
    const stillFailing = failingTitles(win);
    const byTitle = new Map();
    (win.tests || []).forEach((t) => byTitle.set(t.base || t.title, t.status));
    const seen = new Set();
    entries.slice(0, -1).forEach((e) => {
      e.failing.forEach((title) => {
        if (stillFailing.has(title) || seen.has(title)) return;
        seen.add(title);
        const now = byTitle.get(title);
        const entry = {
          suiteId, suite: win.name, app: win.app, title,
          failedIn: e.runId, laterRun: win.fromRun, now: now || 'absent',
        };
        // Only a pass is a fix. A test that went from failing to skipped, or
        // that stopped appearing altogether, has stopped reporting — which is
        // not the same as working, and must not be counted as one.
        if (now === 'pass') fixed.push(entry);
        else stoppedFailing.push(entry);
      });
    });
  });

  // Everything in the corpus for the apps in scope that no selected run reached.
  const scope = appsCovered(runs, registry);
  const notCovered = [];
  registry.apps.forEach((app) => {
    if (!scope.has(app.id)) return;
    (app.suites || []).forEach((s) => {
      if (winner.has(s.id) || blocked.has(s.id)) return;
      notCovered.push({
        id: s.id, name: s.name, app: app.name, tier: s.tier, addedIn: s.addedIn,
      });
    });
  });

  const totals = suites.reduce((acc, s) => {
    acc.passed += s.passed || 0;
    acc.failed += s.failed || 0;
    acc.skipped += s.skipped || 0;
    return acc;
  }, { passed: 0, failed: 0, skipped: 0 });

  // The newest commit anything ran against. A suite whose result predates it may
  // not reflect the code as it now stands, and the report says so per suite
  // rather than printing one commit at the top and implying they all match.
  const newest = runs.length ? runs[runs.length - 1] : null;
  const commits = Array.from(new Set(runs.map((r) => r.commit)));

  return {
    runs: runs.map((r) => ({
      id: r.id, app: r.app, mode: r.mode, tier: r.tier, commit: r.commit,
      startedAt: r.startedAt, durationMs: r.durationMs,
      passed: r.passed, failed: r.failed, skipped: r.skipped,
    })),
    missing,
    apps: registry.apps.filter((a) => scope.has(a.id)).map((a) => a.name),
    suites,
    blocked: Array.from(blocked.values()),
    fixed,
    stoppedFailing,
    notCovered,
    passed: totals.passed,
    failed: totals.failed,
    skipped: totals.skipped,
    trust: store.computeTrust(totals.passed, totals.failed, totals.skipped),
    headCommit: newest ? newest.commit : 'unknown',
    mixedCommits: commits.length > 1,
    startedAt: runs.length ? runs[0].startedAt : null,
    endedAt: newest ? newest.startedAt : null,
  };
}

module.exports = { build };
