'use strict';
/**
 * admin/regression.js — Regression Testing Suite API
 *
 * Routes:
 *   POST /api/admin/regression/run         — run the full test suite
 *   GET  /api/admin/regression/history     — past run summaries
 *   GET  /api/admin/regression/history/:id — single run full results
 *   GET  /api/admin/regression/db-health   — live DB table health
 *   GET  /api/admin/regression/api-catalog — registered API routes
 *   GET  /api/admin/regression/coverage    — uncovered routes vs tests
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { runRegressionSuite, getDbHealth, getApiCatalog, discoverTests } = require('../../services/regressionRunner');

// Rate limit: track last run time per user in memory
const lastRunAt = {};
const RATE_LIMIT_MS = 5 * 60 * 1000; // 5 minutes

// ── POST /api/admin/regression/run ────────────────────────────────────────────
router.post('/regression/run', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const now = Date.now();
    if (lastRunAt[userId] && (now - lastRunAt[userId]) < RATE_LIMIT_MS) {
      const waitSecs = Math.ceil((RATE_LIMIT_MS - (now - lastRunAt[userId])) / 1000);
      return res.status(429).json({ error: `Rate limited. Wait ${waitSecs}s before running again.` });
    }
    lastRunAt[userId] = now;

    // Get app reference from req.app for API catalog
    const report = await runRegressionSuite({ runByUserId: userId, app: req.app });
    res.json(report);
  } catch (err) {
    console.error('[Regression] Run error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/regression/history ─────────────────────────────────────────
router.get('/regression/history', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT r.id, r.started_at, r.completed_at, r.total_tests, r.passed, r.failed, r.skipped,
              r.health_score, u.name AS run_by_name
       FROM regression_runs r
       LEFT JOIN users u ON u.id = r.run_by
       ORDER BY r.started_at DESC LIMIT 50`
    );
    res.json({ runs: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/regression/history/:id ─────────────────────────────────────
router.get('/regression/history/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const [[run]] = await pool.execute('SELECT * FROM regression_runs WHERE id = ?', [req.params.id]);
    if (!run) return res.status(404).json({ error: 'Run not found.' });
    const results = typeof run.results === 'string' ? JSON.parse(run.results) : run.results;
    res.json({ run: { ...run, results } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/regression/db-health ───────────────────────────────────────
router.get('/regression/db-health', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const health = await getDbHealth();
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/regression/api-catalog ─────────────────────────────────────
router.get('/regression/api-catalog', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const routes = getApiCatalog(req.app);
    res.json({ routes, total: routes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/regression/coverage ────────────────────────────────────────
router.get('/regression/coverage', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const routes = getApiCatalog(req.app);
    const tests = discoverTests();

    // Build set of paths that have at least one test referencing them
    // We check test names and module names heuristically
    const coveredModules = new Set(tests.map(t => t.module));
    const totalRoutes = routes.length;
    const totalTests = tests.length;

    res.json({
      total_routes: totalRoutes,
      total_tests: totalTests,
      covered_modules: [...coveredModules],
      routes,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
