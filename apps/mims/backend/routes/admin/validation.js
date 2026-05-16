'use strict';

/**
 * validation.js — Theme 3 surface.
 *
 * Wave 1. Endpoints:
 *   GET  /api/validation/schema?section=…       — UI-side rule mirror
 *   POST /api/validation/check                   — server-side validation
 *   GET  /api/validation/duplicates?...          — quick duplicate probe
 *
 *   GET  /api/admin/phase-required               — list (admin)
 *   POST /api/admin/phase-required               — upsert (admin)
 *   DELETE /api/admin/phase-required/:id         — remove (admin)
 *
 * The feature-flag is checked on every request that exposes new behavior;
 * legacy code paths keep working with strict_mode=1.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const flags   = require('../../services/featureFlagsService');
const engine  = require('../../services/validationEngine');

const FLAG = 'cf.theme3_inline_validation';
const ADMIN = ['admin', 'superadmin'];

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

// ── Admin: phase-required CRUD ───────────────────────────────────────────────

router.get('/admin/phase-required', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const { section, field } = req.query || {};
    const params = [];
    let where = ' WHERE 1=1 ';
    if (section) { where += ' AND section_name = ? '; params.push(section); }
    if (field)   { where += ' AND field_name = ? ';   params.push(field); }
    const [rows] = await pool.execute(
      `SELECT id, org_id, section_name, field_name, phase, is_required, message,
              created_at, updated_at
         FROM field_phase_required ${where}
         ORDER BY section_name, field_name, phase`, params);
    res.json({ rules: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/phase-required', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const { org_id = null, section_name, field_name, phase, is_required = 1, message = null } = req.body || {};
    if (!section_name || !field_name || !phase) {
      return res.status(400).json({ error: 'section_name, field_name, phase required' });
    }
    await pool.execute(`
      INSERT INTO field_phase_required (org_id, section_name, field_name, phase, is_required, message)
      VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        is_required = VALUES(is_required),
        message     = VALUES(message),
        updated_at  = NOW()
    `, [org_id, section_name, field_name, phase, is_required ? 1 : 0, message]);
    engine.invalidate(org_id, section_name);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/admin/phase-required/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const [[row]] = await pool.execute(
      'SELECT org_id, section_name FROM field_phase_required WHERE id = ?', [req.params.id]
    );
    await pool.execute('DELETE FROM field_phase_required WHERE id = ?', [req.params.id]);
    if (row) engine.invalidate(row.org_id, row.section_name);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
