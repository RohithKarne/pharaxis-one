'use strict';

/**
 * store.js — persists run results as JSON on disk.
 *
 * Deliberately files rather than a database: this is an internal tool and
 * should not add another schema to migrate. Each run is a self-contained
 * record stamped with the commit it ran against, which is what makes it usable
 * as validation evidence (Vasu's requirement) rather than just a dev
 * convenience.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const RUNS_DIR = path.join(DATA_DIR, 'runs');
const REGISTRY = path.join(DATA_DIR, 'registry.json');

function ensureDirs() {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
}

function readRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
}

function writeRegistry(reg) {
  fs.writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + '\n');
}

/** Short commit hash, or 'unknown' outside a git checkout. */
function currentCommit() {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: path.resolve(__dirname, '..', '..', '..'),
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
  } catch {
    return 'unknown';
  }
}

function saveRun(run) {
  ensureDirs();
  const file = path.join(RUNS_DIR, run.id + '.json');
  fs.writeFileSync(file, JSON.stringify(run, null, 2) + '\n');
  return file;
}

/** Newest-first run summaries, without the per-test detail. */
function listRuns(limit = 50) {
  ensureDirs();
  return fs.readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, f), 'utf8'));
        return {
          id: r.id, app: r.app, mode: r.mode, commit: r.commit,
          startedAt: r.startedAt, durationMs: r.durationMs,
          passed: r.passed, failed: r.failed, skipped: r.skipped,
          trust: r.trust, suites: (r.suites || []).length,
        };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
    .slice(0, limit);
}

function getRun(id) {
  const file = path.join(RUNS_DIR, path.basename(id) + '.json');
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Trust is not the pass rate — that is the whole point of it.
 *
 * A suite that skips half its tests, or reports no tests at all, is not giving
 * you coverage no matter how green the tests that did run look. Trust answers
 * "how much of this suite actually asserted something?", so it can fall while
 * the verdict improves. On 27 July MIMS read 11 passed / 2 failed while 41 of
 * 54 tests skipped: verdict fine, trust 20%.
 */
function computeTrust(passed, failed, skipped) {
  const total = passed + failed + skipped;
  if (total === 0) return 0;
  const executed = passed + failed;
  return Math.round((executed / total) * 100);
}

module.exports = {
  DATA_DIR, RUNS_DIR, REGISTRY,
  readRegistry, writeRegistry, currentCommit,
  saveRun, listRuns, getRun, computeTrust, ensureDirs,
};
