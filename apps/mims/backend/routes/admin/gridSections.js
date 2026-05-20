'use strict';

/**
 * gridSections.js — Theme 7 surface (Wave 2).
 *
 * Endpoints:
 *   GET    /api/cases/:caseId/grid/:section                  — list rows
 *   PUT    /api/cases/:caseId/grid/:section                  — replace rows
 *   POST   /api/cases/:caseId/grid/:section/paste            — preview paste
 *   POST   /api/cases/:caseId/grid/:section/apply-template   — fill from a saved template
 *
 *   GET    /api/admin/grid-templates                         — list templates
 *   POST   /api/admin/grid-templates                         — create/update
 *   DELETE /api/admin/grid-templates/:id                     — delete
 *
 * Gated by cf.theme7_multirow_grids. Off → empty payloads; UI falls back
 * to legacy single-row mode.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const flags   = require('../../services/featureFlagsService');
const grid    = require('../../services/gridSectionService');

const FLAG  = 'cf.theme7_multirow_grids';
const ADMIN = ['admin', 'platform_admin'];

router.get('/cases/:caseId/grid/:section', authenticate, async (req, res) => {
  try {
    const enabled = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!enabled) return res.json({ enabled: false, rows: [] });
    const rows = await grid.listRows({
      orgId: req.user.orgId,
      caseId: Number(req.params.caseId),
      section: req.params.section,
      includeArchived: req.query.archived === '1',
    });
    res.json({ enabled: true, rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/cases/:caseId/grid/:section', authenticate, async (req, res) => {
  try {
    const enabled = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!enabled) return res.status(403).json({ error: 'Multi-row grids not enabled for this tenant.' });
    const ids = await grid.replaceRows({
      orgId:   req.user.orgId,
      caseId:  Number(req.params.caseId),
      section: req.params.section,
      rows:    req.body?.rows || [],
      userId:  req.user.userId,
    });
    res.json({ ok: true, saved: ids });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:caseId/grid/:section/paste', authenticate, async (req, res) => {
  try {
    const enabled = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!enabled) return res.json({ enabled: false, headers: [], rows: [] });
    const { text, headers } = req.body || {};
    const preview = grid.pastePreview({ headers, text: text || '' });
    res.json({ enabled: true, ...preview });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cases/:caseId/grid/:section/apply-template', authenticate, async (req, res) => {
  try {
    const enabled = await flags.isEnabledForOrg(FLAG, req.user.orgId);
    if (!enabled) return res.json({ enabled: false, rows: [] });
    const { template_id } = req.body || {};
    if (!template_id) return res.status(400).json({ error: 'template_id required' });
    const rows = await grid.applyTemplate({ orgId: req.user.orgId, templateId: template_id });
    res.json({ enabled: true, rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Templates CRUD (admin) ───────────────────────────────────────────────────

router.get('/admin/grid-templates', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const { section } = req.query || {};
    const params = []; let where = ' WHERE 1=1 ';
    if (section) { where += ' AND section_name = ?'; params.push(section); }
    const [rows] = await pool.execute(
      `SELECT id, org_id, section_name, name, description, rows_json,
              created_by, created_at, updated_at
         FROM grid_section_templates ${where}
         ORDER BY section_name, name`, params);
    res.json({ templates: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/grid-templates', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const { id, org_id = null, section_name, name, description = null, rows_json = [] } = req.body || {};
    if (!section_name || !name) {
      return res.status(400).json({ error: 'section_name and name required' });
    }
    const json = typeof rows_json === 'string' ? rows_json : JSON.stringify(rows_json);
    if (id) {
      await pool.execute(
        `UPDATE grid_section_templates
            SET name = ?, description = ?, rows_json = ?, updated_at = NOW()
          WHERE id = ?`,
        [name, description, json, id]
      );
    } else {
      await pool.execute(
        `INSERT INTO grid_section_templates
           (org_id, section_name, name, description, rows_json, created_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           description = VALUES(description),
           rows_json   = VALUES(rows_json),
           updated_at  = NOW()`,
        [org_id, section_name, name, description, json, req.user.userId]
      );
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/admin/grid-templates/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    await pool.execute('DELETE FROM grid_section_templates WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
