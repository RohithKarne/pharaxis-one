'use strict';

/**
 * discover.js — finds test files that exist on disk but are not in the corpus.
 *
 * This is what makes promotion meaningful. A release adds new spec files; until
 * they are registered they never run in a regression, so the corpus quietly
 * falls behind the code. Discovery surfaces the gap, and promotion closes it by
 * appending the suite tagged with the release that introduced it.
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const SPEC = /\.(spec|test)\.(js|cjs|mjs|jsx|ts|tsx)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'test-results', 'playwright-report']);

function walk(dir, out, depth) {
  if (depth > 6) return out;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  entries.forEach((e) => {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) return;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out, depth + 1);
    else if (SPEC.test(e.name)) out.push(full);
  });
  return out;
}

/** How a newly found spec should be run, inferred from where it lives. */
function commandFor(app, rel) {
  if (rel.startsWith('e2e/')) {
    const cfg = fs.existsSync(path.join(REPO_ROOT, app.cwd, 'playwright.config.cjs'))
      ? ' --config=playwright.config.cjs' : '';
    return { tier: 3, cmd: 'npx playwright test ' + rel + cfg + ' --reporter=list', parser: 'playwright' };
  }
  if (rel.includes('frontend/')) {
    return { tier: 1, cmd: 'npx vitest run --reporter=verbose ' + rel.replace(/^frontend\//, ''),
             cwd: app.cwd + '/frontend', parser: 'vitest' };
  }
  return { tier: 1, cmd: 'npx jest --testPathPatterns=' + rel + ' --forceExit --verbose', parser: 'jest' };
}

/**
 * Spec files present in each app but absent from the registry.
 * Matching is by suite name, which is the path relative to the app root.
 */
function unregistered(registry) {
  const out = [];
  registry.apps.forEach((app) => {
    const root = path.join(REPO_ROOT, app.cwd);
    if (!fs.existsSync(root)) return;

    // A file counts as registered if a suite names it directly, or if a suite's
    // command sweeps the directory it sits in. Without the second rule every
    // file under a "run all backend tests" suite is reported as missing.
    const known = new Set();      // exact paths
    const covered = [];           // directory prefixes a command sweeps
    (app.suites || []).forEach((s) => {
      const n = String(s.name || '');
      if (n && SPEC.test(n)) known.add(n);
      const cmd = String(s.cmd || '');

      const named = /(?:^|\s)((?:e2e|src|backend|frontend)\/\S+\.(?:spec|test)\.\w+)/.exec(cmd);
      if (named) known.add(named[1]);

      const pattern = /--testPathPatterns?=(\S+)/.exec(cmd);
      if (pattern) covered.push(pattern[1].replace(/^\.?\//, ''));

      // `vitest run` with no file argument runs every test under its cwd.
      if (/\bvitest run\b/.test(cmd) && !named) {
        covered.push(s.cwd ? path.relative(app.cwd, s.cwd) : 'frontend');
      }
      // A whole-config playwright run covers the entire e2e directory.
      if (/\bplaywright test\b/.test(cmd) && !named) covered.push('e2e');
    });

    walk(root, [], 0).forEach((full) => {
      const rel = path.relative(root, full);
      if (known.has(rel)) return;
      if (covered.some((c) => c && rel.startsWith(c))) return;
      const spec = commandFor(app, rel);
      out.push({
        appId: app.id, appName: app.name,
        id: app.id + '-' + rel.replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '').toLowerCase(),
        name: rel, tier: spec.tier, cmd: spec.cmd, parser: spec.parser,
        cwd: spec.cwd,
      });
    });
  });
  return out;
}

module.exports = { unregistered, commandFor, REPO_ROOT };
