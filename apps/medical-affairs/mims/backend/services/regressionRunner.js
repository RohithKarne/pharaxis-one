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

const TESTS_DIR = path.join(__dirname, '../regression-tests');
const BASE_URL = `http://127.0.0.1:${process.env.PORT || 3000}`;
const REGRESSION_EMAIL = 'regression@system';
const REGRESSION_PASSWORD = 'Regression@System123';
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

async function getToken() {
  // First attempt
  const res = await makeRequest('POST', '/api/auth/login', {
    email: REGRESSION_EMAIL,
    password: REGRESSION_PASSWORD,
  }, null);

  if (res.status === 200 && res.body?.token) return res.body.token;

  // If noOrgAccess, self-heal the user_org_access row and retry once
  if (res.status === 200 && res.body?.noOrgAccess) {
    console.warn('[Regression] Regression user has no org access — self-healing...');
    await ensureRegressionUserOrgAccess();
    const retry = await makeRequest('POST', '/api/auth/login', {
      email: REGRESSION_EMAIL,
      password: REGRESSION_PASSWORD,
    }, null);
    if (retry.status === 200 && retry.body?.token) {
      console.log('[Regression] Self-heal succeeded — regression user now has org access.');
      return retry.body.token;
    }
  }

  // Final fallback: superadmin (orgId will be null — only use for non-org-scoped tests)
  console.warn('[Regression] Falling back to superadmin token. Org-scoped tests may fail.');
  const res2 = await makeRequest('POST', '/api/auth/login', {
    email: 'superadmin',
    password: 'Manager@123',
  }, null);
  return res2.body?.token || null;
}

// ── Test discovery ────────────────────────────────────────────────────────────
function discoverTests() {
  if (!fs.existsSync(TESTS_DIR)) return [];
  const files = fs.readdirSync(TESTS_DIR).filter(f => f.endsWith('.tests.js')).sort();
  const all = [];
  for (const file of files) {
    try {
      const tests = require(path.join(TESTS_DIR, file));
      if (Array.isArray(tests)) all.push(...tests);
    } catch (err) {
      console.error(`[Regression] Failed to load ${file}:`, err.message);
    }
  }
  return all;
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
function getApiCatalog(app) {
  const routes = [];
  if (!app || !app._router) return routes;

  function extractRoutes(stack, prefix) {
    for (const layer of stack) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase());
        for (const method of methods) {
          routes.push({ method, path: prefix + layer.route.path });
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        const match = layer.regexp?.source?.match(/^\\\/([^\\?]+)/);
        const sub = match ? '/' + match[1].replace(/\\\//g, '/') : '';
        extractRoutes(layer.handle.stack, prefix + sub);
      }
    }
  }

  extractRoutes(app._router.stack, '');
  return routes.sort((a, b) => a.path.localeCompare(b.path));
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

module.exports = { runRegressionSuite, getDbHealth, getApiCatalog, discoverTests };
