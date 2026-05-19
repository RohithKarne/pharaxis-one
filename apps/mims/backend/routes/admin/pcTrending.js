'use strict';

/**
 * pcTrending.js — Sprint 2 #29 read surface for PC trending + signal detection.
 *
 *   GET /api/pc-trending?window_days=30&product_id=
 *   GET /api/pc-signals?min_cases=5&baseline_max=2
 *   GET /api/lot-master/:id/history    (already partially covered by complaintCodes.js
 *                                       but here we use the richer lotHistory service)
 */

const express = require('express');
const router  = express.Router();
const { authenticate } = require('../../middleware/auth');
const trending = require('../../services/pcTrendingService');

router.get('/pc-trending', authenticate, async (req, res) => {
  try {
    const window_days   = Number(req.query.window_days)   || trending.DEFAULT_WINDOW_DAYS;
    const baseline_days = Number(req.query.baseline_days) || trending.DEFAULT_BASELINE_DAYS;
    const productId     = req.query.product_id ? Number(req.query.product_id) : null;
    const rows = await trending.trends({
      orgId: req.user.orgId,
      windowDays: window_days,
      baselineDays: baseline_days,
      productId,
    });
    res.json({ trends: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/pc-signals', authenticate, async (req, res) => {
  try {
    const minCases    = Number(req.query.min_cases)    || trending.DEFAULT_MIN_CASES;
    const baselineMax = Number(req.query.baseline_max) || trending.DEFAULT_BASELINE_MAX;
    const signals = await trending.detectSignals({
      orgId: req.user.orgId,
      threshold: { minCases, baselineMax },
    });
    res.json({ signals });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/lot-master/:id/history', authenticate, async (req, res) => {
  try {
    const out = await trending.lotHistory({ orgId: req.user.orgId, lotId: Number(req.params.id) });
    if (!out) return res.status(404).json({ error: 'Lot not found' });
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
