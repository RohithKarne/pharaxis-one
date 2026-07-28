'use strict';

/**
 * impact.js — works out which suites a change in flight can actually affect.
 *
 * Current Release mode previously ran the same thing as Regression, which made
 * the mode toggle close to cosmetic. This module is what makes the difference
 * real: it reads the working tree's changed files and maps them to suites.
 *
 * The mapping is deliberately conservative. Guessing too narrowly means a
 * regression slips through, so anything that cannot be attributed precisely
 * falls back to "every suite in that application".
 */

const { execSync } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * Files changed in the working tree, plus anything committed since the given
 * base. Uncommitted work is the common case while a fix is in flight.
 */
function changedFiles(base) {
  const cmds = [
    'git diff --name-only HEAD',          // unstaged + staged vs HEAD
    'git ls-files --others --exclude-standard', // new, untracked files
  ];
  if (base) cmds.push('git diff --name-only ' + base + '...HEAD');

  const seen = new Set();
  cmds.forEach((cmd) => {
    try {
      execSync(cmd, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((f) => seen.add(f));
    } catch { /* not a git checkout, or bad base — treat as no changes */ }
  });
  return Array.from(seen).sort();
}

/** Which application does this path belong to? */
function appForFile(file, registry) {
  return registry.apps.find((a) => file.startsWith(a.cwd + '/')) || null;
}

/**
 * Map changed files to suites.
 *
 * Rules, most specific first:
 *   1. The changed file IS a suite's spec  → that suite, certainly.
 *   2. A test fixture or seed changed      → every suite in that app.
 *   3. Any other file inside an app        → every suite in that app.
 *   4. Something shared or outside an app  → every suite everywhere.
 *
 * Rules 2–4 are broad on purpose: a narrow guess that misses a regression is
 * worse than running more tests than strictly necessary.
 */
function impactedSuites(files, registry) {
  const impacted = new Map();     // suiteId -> { app, suite, reason }
  let global = false;

  const addSuite = (app, suite, reason) => {
    if (!impacted.has(suite.id)) impacted.set(suite.id, { app, suite, reason });
  };
  const addApp = (app, reason) => {
    (app.suites || []).forEach((s) => addSuite(app, s, reason));
  };

  files.forEach((file) => {
    const app = appForFile(file, registry);

    if (!app) {
      // Outside every registered application. CI workflows and shared scripts
      // can affect anything, so they widen the run. Docs, git hooks and the
      // console's own source cannot break an application's tests.
      const harmless = /^(docs\/|\.githooks\/|apps\/test-console\/|README|LICENSE)/.test(file);
      if (!harmless) global = true;
      return;
    }

    const rel = file.slice(app.cwd.length + 1);

    // 1. The file is itself a registered spec.
    const exact = (app.suites || []).filter((s) => {
      const name = String(s.name || '');
      return name && (rel === name || rel.endsWith(name) || name.endsWith(rel));
    });
    if (exact.length) {
      exact.forEach((s) => addSuite(app, s, 'this spec changed'));
      return;
    }

    // 2. Fixtures and seeds shift what every suite in the app sees.
    if (/(^|\/)(tests?|e2e|fixtures?)\//.test(rel) || /seed|fixture/i.test(rel)) {
      addApp(app, 'test fixture or seed changed');
      return;
    }

    // 3. Any other source file in the app.
    addApp(app, 'application source changed');
  });

  if (global) {
    registry.apps.forEach((a) => addApp(a, 'shared or CI file changed'));
  }

  return Array.from(impacted.values());
}

function summarise(registry, base) {
  const files = changedFiles(base);
  const suites = impactedSuites(files, registry);
  const byApp = {};
  suites.forEach((x) => {
    byApp[x.app.name] = (byApp[x.app.name] || 0) + 1;
  });
  return {
    files,
    fileCount: files.length,
    suites: suites.map((x) => ({
      id: x.suite.id, name: x.suite.name, app: x.app.name,
      appId: x.app.id, tier: x.suite.tier, reason: x.reason,
    })),
    byApp,
  };
}

module.exports = { changedFiles, impactedSuites, summarise, appForFile, REPO_ROOT };
