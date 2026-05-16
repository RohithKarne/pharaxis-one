'use strict';

/**
 * geocoder.js — thin HTTP wrapper over services/geocoderService.
 *
 * Wave 0 piece #7 surface. Backend stays the only holder of API keys.
 *
 * GET  /api/geocode?text=…&country=GB   → forward geocode
 * GET  /api/geocode/reverse?lat=..&lng=..→ reverse geocode
 * GET  /api/geocode/status              → { provider, enabled }
 */

const express = require('express');
const router  = express.Router();
const { authenticate } = require('../../middleware/auth');
const geo = require('../../services/geocoderService');

router.get('/geocode/status', authenticate, (_req, res) => {
  res.json({ provider: geo.PROVIDER, enabled: geo.isEnabled() });
});

router.get('/geocode', authenticate, async (req, res) => {
  const { text, country } = req.query || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  res.json({ result: await geo.forward({ text, country }) });
});

router.get('/geocode/reverse', authenticate, async (req, res) => {
  const lat = Number(req.query.lat); const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng required' });
  }
  res.json({ result: await geo.reverse({ lat, lng }) });
});

module.exports = router;
