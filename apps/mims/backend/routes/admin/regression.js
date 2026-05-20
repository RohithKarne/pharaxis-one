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
const { runRegressionSuite, getDbHealth, getApiCatalog, getRegressionCoverage, discoverTests } = require('../../services/regressionRunner');

const REGRESSION_RUN_LOCK_NAME = 'mims:regression:run:lock';
const REGRESSION_RUN_LOCK_TIMEOUT_SECONDS = 0;

// ── POST /api/admin/regression/run ────────────────────────────────────────────
router.post('/regression/run', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  let lockConn = null;
  let lockAcquired = false;
  try {
    lockConn = await pool.getConnection();
    const [[lockRow]] = await lockConn.query(
      'SELECT GET_LOCK(?, ?) AS acquired',
      [REGRESSION_RUN_LOCK_NAME, REGRESSION_RUN_LOCK_TIMEOUT_SECONDS]
    );
    lockAcquired = Number(lockRow?.acquired || 0) === 1;
    if (!lockAcquired) {
      return res.status(409).json({ error: 'Regression suite is already running. Try again shortly.' });
    }

    // Get app reference from req.app for API catalog
    const report = await runRegressionSuite({ runByUserId: req.user.userId, app: req.app });
    res.json(report);
  } catch (err) {
    console.error('[Regression] Run error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (lockConn) {
      if (lockAcquired) {
        await lockConn.query('DO RELEASE_LOCK(?)', [REGRESSION_RUN_LOCK_NAME]).catch(() => {});
      }
      lockConn.release();
    }
  }
});

// ── GET /api/admin/regression/history ─────────────────────────────────────────
router.get('/regression/history', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
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
router.get('/regression/history/:id', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const [[run]] = await pool.execute('SELECT * FROM regression_runs WHERE id = ?', [req.params.id]);
    if (!run) return res.status(404).json({ error: 'Run not found.' });
    // Spread parsed report fields into run — so detail.results is the test array,
    // detail.modules is the modules array, detail.healthScore etc. all resolve correctly
    const parsedReport = typeof run.results === 'string' ? JSON.parse(run.results) : (run.results || {});
    res.json({ run: { ...run, ...parsedReport } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/regression/db-health ───────────────────────────────────────
router.get('/regression/db-health', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const health = await getDbHealth();
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/regression/api-catalog ─────────────────────────────────────
router.get('/regression/api-catalog', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const routes = getApiCatalog(req.app);
    const coverage = getRegressionCoverage();
    res.json({
      routes,
      total: routes.length,
      covered_routes: coverage.covered_routes,
      uncovered_routes: coverage.uncovered_routes,
      total_tests: coverage.total_tests,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/regression/coverage ────────────────────────────────────────
router.get('/regression/coverage', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const coverage = getRegressionCoverage();
    const tests = discoverTests();
    res.json({
      ...coverage,
      covered_modules: [...new Set(tests.map(t => t.module).filter(Boolean))],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
