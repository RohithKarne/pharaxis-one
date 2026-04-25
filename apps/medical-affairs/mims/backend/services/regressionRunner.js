'use strict';
/**
 * regressionRunner.js — Core Regression Test Engine
 *
 * - Auto-discovers all *.tests.js files from regression-tests/
 * - Runs them sequentially with 50ms gaps (no server load spike)
 * - Scores results and returns structured report
 * - Stores run history in regression_runs table
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const pool = require('../database/db');
const { normalizePath } = require('./processExplorerService');
const { getRouteServiceCatalog } = require('./routeCatalogService');

const TESTS_DIR = path.join(__dirname, '../regression-tests');
const BASE_URL = `http://127.0.0.1:${process.env.PORT || 3000}`;
const REGRESSION_EMAIL = String(process.env.REGRESSION_EMAIL || '').trim();
const REGRESSION_PASSWORD = String(process.env.REGRESSION_PASSWORD || '');
const REGRESSION_FALLBACK_EMAIL = String(process.env.REGRESSION_FALLBACK_EMAIL || '').trim();
const REGRESSION_FALLBACK_PASSWORD = String(process.env.REGRESSION_FALLBACK_PASSWORD || '');
const DELAY_MS = 50;

// ── HTTP helper ───────────────────────────────────────────────────────────────
function makeRequest(method, urlPath, body, token) {
  return new Promise((resolve) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': bodyStr ? Buffer.byteLength(bodyStr) : 0,
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const url = new URL(urlPath, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (_) { parsed = data; }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 0, body: { error: err.message }, headers: {} });
    });

    req.setTimeout(8000, () => {
      req.destroy();
      resolve({ status: 408, body: { error: 'Request timeout' }, headers: {} });
    });

    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Token acquisition ─────────────────────────────────────────────────────────
async function ensureRegressionUserOrgAccess() {
  try {
    const [[regUser]] = await pool.execute('SELECT id FROM users WHERE email = ?', [REGRESSION_EMAIL]);
    if (!regUser) return;
    const [[firstOrg]] = await pool.execute(
      `SELECT id FROM organisations WHERE is_active = 1 ORDER BY id ASC LIMIT 1`
    );
    if (!firstOrg) return;
    await pool.execute(
      `INSERT IGNORE INTO user_org_access (user_id, org_id, is_active) VALUES (?, ?, 1)`,
      [regUser.id, firstOrg.id]
    );
  } catch (err) {
    console.warn('[Regression] ensureRegressionUserOrgAccess failed (non-fatal):', err.message);
  }
}

async function resolveAuthToken(email, password) {
  const res = await makeRequest('POST', '/api/auth/login', { email, password }, null);
  if (res.status !== 200) return null;
  if (res.body?.token) return res.body.token;

  if (res.body?.challengeToken) {
    const skip = await makeRequest('POST', '/api/auth/2fa/skip-setup', {
      challengeToken: res.body.challengeToken,
    }, null);
    if (skip.status === 200 && skip.body?.token) return skip.body.token;
  }

  return null;
}

async function getToken() {
  if (!REGRESSION_EMAIL || !REGRESSION_PASSWORD) {
    console.warn('[Regression] Missing REGRESSION_EMAIL or REGRESSION_PASSWORD. Token bootstrap skipped.');
    return null;
  }

  // First attempt
  const directToken = await resolveAuthToken(REGRESSION_EMAIL, REGRESSION_PASSWORD);
  if (directToken) return directToken;

  const res = await makeRequest('POST', '/api/auth/login', {
    email: REGRESSION_EMAIL,
    password: REGRESSION_PASSWORD,
  }, null);

  // If noOrgAccess, self-heal the user_org_access row and retry once
  if (res.status === 200 && res.body?.noOrgAccess) {
    console.warn('[Regression] Regression user has no org access — self-healing...');
    await ensureRegressionUserOrgAccess();
    const retryToken = await resolveAuthToken(REGRESSION_EMAIL, REGRESSION_PASSWORD);
    if (retryToken) {
      console.log('[Regression] Self-heal succeeded — regression user now has org access.');
      return retryToken;
    }
  }

  // Optional fallback account for non-org-scoped test execution.
  if (!REGRESSION_FALLBACK_EMAIL || !REGRESSION_FALLBACK_PASSWORD) {
    return null;
  }

  console.warn('[Regression] Falling back to configured fallback token. Org-scoped tests may fail.');
  return resolveAuthToken(REGRESSION_FALLBACK_EMAIL, REGRESSION_FALLBACK_PASSWORD);
}

// ── Test discovery ────────────────────────────────────────────────────────────
function discoverTests() {
  if (!fs.existsSync(TESTS_DIR)) return [];
  for (const cacheKey of Object.keys(require.cache)) {
    if (cacheKey.startsWith(TESTS_DIR)) delete require.cache[cacheKey];
  }
  const files = fs.readdirSync(TESTS_DIR).filter(f => f.endsWith('.tests.js')).sort();
  const all = [];
  for (const file of files) {
    try {
      const absPath = path.join(TESTS_DIR, file);
      const tests = require(absPath);
      if (Array.isArray(tests)) all.push(...tests);
    } catch (err) {
      console.error(`[Regression] Failed to load ${file}:`, err.message);
    }
  }
  return all;
}

function normalizeCatalogPath(pathname) {
  const normalized = normalizePath(String(pathname || '').trim() || '/').replace(/\/+/g, '/');
  return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized;
}

function extractCoveredSignatures(tests) {
  const covered = new Map();

  for (const test of tests) {
    const signatures = new Set();
    const explicit = Array.isArray(test.covers) ? test.covers : [];
    for (const item of explicit) {
      const match = String(item || '').trim().match(/^(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/i);
      if (!match) continue;
      signatures.add(`${match[1].toUpperCase()} ${normalizeCatalogPath(match[2])}`);
    }

    const inferredMatches = String(test.name || '').matchAll(/\b(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/[^\s]+)/gi);
    for (const match of inferredMatches) {
      signatures.add(`${match[1].toUpperCase()} ${normalizeCatalogPath(match[2])}`);
    }

    for (const signature of signatures) {
      if (!covered.has(signature)) covered.set(signature, []);
      covered.get(signature).push(test.name);
    }
  }

  return covered;
}

// ── DB health check ───────────────────────────────────────────────────────────
async function getDbHealth() {
  try {
    const [tables] = await pool.execute('SHOW TABLES');
    const dbName = process.env.MYSQL_DATABASE || 'pharaxis_mims_dev';
    const tableKey = `Tables_in_${dbName}`;
    const tableNames = tables.map(t => t[tableKey] || Object.values(t)[0]);

    const details = [];
    for (const tableName of tableNames) {
      try {
        const [cols] = await pool.execute(`DESCRIBE \`${tableName}\``);
        const [[countRow]] = await pool.execute(`SELECT COUNT(*) as cnt FROM \`${tableName}\``);
        details.push({
          name: tableName,
          columns: cols.length,
          rows: countRow.cnt,
          columnNames: cols.map(c => c.Field),
        });
      } catch (_) {
        details.push({ name: tableName, columns: 0, rows: 0, columnNames: [], error: true });
      }
    }
    return { status: 'ok', table_count: tableNames.length, tables: details };
  } catch (err) {
    return { status: 'error', error: err.message, tables: [] };
  }
}

// ── API catalog ───────────────────────────────────────────────────────────────
function getRegressionCoverage() {
  const tests = discoverTests();
  const coveredBySignature = extractCoveredSignatures(tests);
  const routes = getRouteServiceCatalog()
    .filter(route => String(route.path_pattern || '').startsWith('/api/'))
    .map((route) => {
      const method = String(route.method || '').toUpperCase();
      const path = normalizeCatalogPath(route.path_pattern);
      const signature = `${method} ${path}`;
      const matchedTests = coveredBySignature.get(signature) || [];
      return {
        method,
        path,
        signature,
        covered: matchedTests.length > 0,
        matched_tests: matchedTests,
        source_module: route.source_module || 'Core',
        route_file: route.route_file || null,
      };
    })
    .sort((a, b) => {
      const moduleCompare = String(a.source_module).localeCompare(String(b.source_module));
      if (moduleCompare !== 0) return moduleCompare;
      const pathCompare = String(a.path).localeCompare(String(b.path));
      if (pathCompare !== 0) return pathCompare;
      return String(a.method).localeCompare(String(b.method));
    });

  const coveredRoutes = routes.filter(route => route.covered).length;
  const uncoveredRoutes = routes.length - coveredRoutes;

  return {
    total_routes: routes.length,
    covered_routes: coveredRoutes,
    uncovered_routes: uncoveredRoutes,
    total_tests: tests.length,
    routes,
  };
}

function getApiCatalog() {
  return getRegressionCoverage().routes;
}

// ── Main runner ───────────────────────────────────────────────────────────────
async function runRegressionSuite({ runByUserId, app } = {}) {
  const startedAt = new Date();
  const token = await getToken();
  const tests = discoverTests();

  const results = [];
  let passed = 0, failed = 0, skipped = 0;

  for (const test of tests) {
    const testStart = Date.now();
    try {
      const result = await test.run({ makeRequest, token });
      const durationMs = Date.now() - testStart;
      const passed_ = !!result.pass;
      results.push({
        name: test.name,
        module: test.module || 'Unknown',
        pass: passed_,
        details: result.details || '',
        durationMs,
      });
      if (passed_) passed++; else failed++;
    } catch (err) {
      const durationMs = Date.now() - testStart;
      results.push({
        name: test.name,
        module: test.module || 'Unknown',
        pass: false,
        details: `Error: ${err.message}`,
        durationMs,
        error: true,
      });
      failed++;
    }
    await sleep(DELAY_MS);
  }

  const totalTests = passed + failed + skipped;
  const healthScore = totalTests > 0 ? parseFloat(((passed / totalTests) * 100).toFixed(2)) : 0;
  const completedAt = new Date();

  // Group by module
  const modules = {};
  for (const r of results) {
    if (!modules[r.module]) modules[r.module] = { name: r.module, tests: [], passed: 0, failed: 0 };
    modules[r.module].tests.push(r);
    if (r.pass) modules[r.module].passed++; else modules[r.module].failed++;
  }

  const report = {
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    totalTests,
    passed,
    failed,
    skipped,
    healthScore,
    coverage: getRegressionCoverage(),
    modules: Object.values(modules),
    results,
  };

  // Store run in DB
  try {
    await pool.execute(
      `INSERT INTO regression_runs (run_by, started_at, completed_at, total_tests, passed, failed, skipped, health_score, results)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [runByUserId || null, startedAt, completedAt, totalTests, passed, failed, skipped, healthScore, JSON.stringify(report)]
    );
  } catch (err) {
    console.error('[Regression] Failed to store run:', err.message);
  }

  return report;
}

module.exports = { runRegressionSuite, getDbHealth, getApiCatalog, getRegressionCoverage, discoverTests };
