'use strict';

/**
 * validation.js — Theme 3 surface.
 *
 * Wave 1. Endpoints:
 *   GET  /api/validation/schema?section=…       — UI-side rule mirror
 *   POST /api/validation/check                   — server-side validation
 *   GET  /api/validation/duplicates?...          — quick duplicate probe
 *
 *   The admin phase-required endpoints went with the Validation Rules screen
 *   (case form clean-up, 13 Oct 2026): nothing reads those rules any more, and
 *   they read and wrote every organisation's rules. The table is kept.
 *
 * The feature-flag is checked on every request that exposes new behavior;
 * legacy code paths keep working with strict_mode=1.
 */

const express = require('express');
const router  = express.Router();
const { authenticate } = require('../../middleware/auth');
const flags   = require('../../services/featureFlagsService');
const engine  = require('../../services/validationEngine');

const FLAG = 'cf.theme3_inline_validation';

// ── GET /api/validation/schema?section= ──────────────────────────────────────
router.get('/validation/schema', authenticate, async (req, res) => {
  try {
    const section = String(req.query.section || '');
    if (!section) return res.status(400).json({ error: 'section required' });
    const enabled = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!enabled) return res.json({ flag: FLAG, enabled: false, fields: [] });
    const rules  = await engine.loadRules(req.user.orgId, section);
    const schema = engine.buildClientSchema(rules);
    res.json({ flag: FLAG, enabled: true, ...schema });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/validation/check ───────────────────────────────────────────────
router.post('/validation/check', authenticate, async (req, res) => {
  try {
    const { section, payload, phase, entity_id, entity_type } = req.body || {};
    if (!section) return res.status(400).json({ error: 'section required' });
    const enabled = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!enabled) return res.json({ ok: true, errors: {}, warnings: {}, enabled: false });
    const out = await engine.validatePayload({
      orgId:      req.user.orgId,
      section,
      payload:    payload || {},
      phase:      phase || null,
      entityId:   entity_id ? Number(entity_id) : null,
      entityType: entity_type || 'case',
    });
    res.json({ ...out, enabled: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/validation/duplicates ───────────────────────────────────────────
// Quick probe — used as a debounced lookup on blur.
router.get('/validation/duplicates', authenticate, async (req, res) => {
  try {
    const { section, field, value, entity_id, entity_type } = req.query || {};
    if (!section || !field || value == null) {
      return res.status(400).json({ error: 'section, field, value required' });
    }
    const enabled = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!enabled) return res.json({ matches: [], enabled: false });
    const out = await engine.validatePayload({
      orgId:      req.user.orgId,
      section,
      payload:    { [field]: value },
      phase:      null,
      entityId:   entity_id ? Number(entity_id) : null,
      entityType: entity_type || 'case',
    });
    res.json({
      matches: out.errors[field] || out.warnings[field] ? [{ field, message: out.errors[field] || out.warnings[field] }] : [],
      enabled: true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
