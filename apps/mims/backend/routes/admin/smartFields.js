'use strict';

/**
 * smartFields.js — Theme 2 surface (Wave 2).
 *
 * Endpoints:
 *   GET    /api/smart-fields/schema?section=                — rules summary for the UI
 *   POST   /api/smart-fields/defaults                       — { section, payload }  → patch
 *   POST   /api/smart-fields/recalc                         — { section, payload }  → patch
 *   GET    /api/typeahead?source=&q=&filter=                — autocomplete data
 *
 *   GET    /api/admin/smart-fields                          — list rules (admin)
 *   POST   /api/admin/smart-fields                          — upsert rule (admin)
 *   DELETE /api/admin/smart-fields/:id                      — delete rule (admin)
 *
 * Gated by cf.theme2_smart_behaviors. When the flag is off, all endpoints
 * still respond but return empty patches / matches — so the UI degrades to
 * legacy behavior cleanly.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const flags   = require('../../services/featureFlagsService');
const smart   = require('../../services/smartFieldsService');

const FLAG = 'cf.theme2_smart_behaviors';
const ADMIN = ['admin', 'platform_admin'];

router.get('/smart-fields/schema', authenticate, async (req, res) => {
  try {
    const section = String(req.query.section || '');
    if (!section) return res.status(400).json({ error: 'section required' });
    const enabled = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!enabled) return res.json({ enabled: false, rules: [] });
    const rules = await smart.loadRules(req.user.orgId, section);
    res.json({ enabled: true, rules: rules.map(r => ({
      field_name: r.field_name,
      rule_type:  r.rule_type,
      depends_on: r.depends_on || null,
      trigger_on: r.trigger_on,
      lookup_source: r.lookup_source,
      lookup_filter: r.lookup_filter,
    })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/smart-fields/defaults', authenticate, async (req, res) => {
  try {
    const { section, payload } = req.body || {};
    if (!section) return res.status(400).json({ error: 'section required' });
    const enabled = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!enabled) return res.json({ patch: {} });
    const patch = await smart.resolveSmartDefaults({
      orgId: req.user.orgId, section, payload: payload || {},
      userCtx: { user: { id: req.user.userId, name: req.user.name, orgId: req.user.orgId } },
    });
    res.json({ patch });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/smart-fields/recalc', authenticate, async (req, res) => {
  try {
    const { section, payload } = req.body || {};
    if (!section) return res.status(400).json({ error: 'section required' });
    const enabled = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!enabled) return res.json({ patch: {} });
    const patch = await smart.applyAutoCalc({
      orgId: req.user.orgId, section, payload: payload || {},
      userCtx: { user: { id: req.user.userId, orgId: req.user.orgId } },
    });
    res.json({ patch });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/typeahead', authenticate, async (req, res) => {
  try {
    const { source, q, filter } = req.query || {};
    if (!source) return res.status(400).json({ error: 'source required' });
    const enabled = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!enabled) return res.json({ matches: [] });
    const matches = await smart.lookup({
      source, q: q || '', orgId: req.user.orgId, filter: filter || null,
    });
    res.json({ matches });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin CRUD ───────────────────────────────────────────────────────────────

router.get('/admin/smart-fields', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const { section, field } = req.query || {};
    const params = []; let where = ' WHERE 1=1 ';
    if (section) { where += ' AND section_name = ?'; params.push(section); }
    if (field)   { where += ' AND field_name = ?';   params.push(field); }
    const [rows] = await pool.execute(
      `SELECT * FROM smart_field_rules ${where}
       ORDER BY section_name, field_name, rule_type, priority DESC`, params);
    res.json({ rules: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/smart-fields', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const {
      id, org_id = null, section_name, field_name, rule_type,
      formula = null, lookup_source = null, lookup_filter = null,
      depends_on = null, trigger_on = 'change',
      enabled = 1, priority = 0,
    } = req.body || {};
    if (!section_name || !field_name || !rule_type) {
      return res.status(400).json({ error: 'section_name, field_name, rule_type required' });
    }
    if (id) {
      await pool.execute(
        `UPDATE smart_field_rules
            SET formula=?, lookup_source=?, lookup_filter=?, depends_on=?,
                trigger_on=?, enabled=?, priority=?, updated_at=NOW()
          WHERE id=?`,
        [formula, lookup_source, lookup_filter, depends_on,
         trigger_on, enabled ? 1 : 0, priority, id]
      );
    } else {
      await pool.execute(
        `INSERT INTO smart_field_rules
           (org_id, section_name, field_name, rule_type, formula,
            lookup_source, lookup_filter, depends_on, trigger_on, enabled, priority)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           formula=VALUES(formula), lookup_source=VALUES(lookup_source),
           lookup_filter=VALUES(lookup_filter), depends_on=VALUES(depends_on),
           trigger_on=VALUES(trigger_on), enabled=VALUES(enabled),
           priority=VALUES(priority), updated_at=NOW()`,
        [org_id, section_name, field_name, rule_type, formula,
         lookup_source, lookup_filter, depends_on, trigger_on, enabled ? 1 : 0, priority]
      );
    }
    smart.invalidate(org_id, section_name);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/admin/smart-fields/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const [[row]] = await pool.execute(
      'SELECT org_id, section_name FROM smart_field_rules WHERE id = ?', [req.params.id]
    );
    await pool.execute('DELETE FROM smart_field_rules WHERE id = ?', [req.params.id]);
    if (row) smart.invalidate(row.org_id, row.section_name);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
