'use strict';

/**
 * admin/caseFormDefinition.js — Case Form Definition API (F-02)
 * Per-org, per-case-type section/field visibility configuration.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

// All sections available per case type — the master list
const CASE_TYPE_SECTIONS = {
  MI: [
    'Contact / Requestor',
    'Case Information',
    'MI — Category & Product',
    'MI — Question Details',
    'MI — Response',
  ],
  AE: [
    'Contact / Requestor',
    'Case Information',
    'AE — General',
    'AE — Events & Seriousness',
    'AE — Patient Information',
    'AE — Lab Results',
    'AE — Lab Notes',
    'AE — Medical History',
    'AE — Medical Notes',
    'AE — Product Information',
  ],
  PC: [
    'Contact / Requestor',
    'Case Information',
    'PC — General',
    'PC — Patient Information',
    'PC — Product Information',
    'PC — Return & Retrieval',
    'PC — Replacement',
    'PC — Refund & Credit',
  ],
};

// GET /api/admin/case-form-definition — get config for org + case_type
router.get('/case-form-definition', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { org_id = null, case_type, product_group_id } = req.query;
    if (!case_type) return res.status(400).json({ error: 'case_type is required.' });

    const masterSections = CASE_TYPE_SECTIONS[case_type] || [];

    // Load saved overrides
    const params = [org_id || null, case_type];
    let assignmentFilter = '';
    if (product_group_id) {
      assignmentFilter = ` AND EXISTS (
        SELECT 1
          FROM product_group_assignments pga
         WHERE pga.target_type = 'case_form_definition'
           AND pga.target_id = case_form_definition.id
           AND pga.group_id = ?
      )`;
      params.push(Number(product_group_id));
    }
    const [rows] = await pool.execute(
      `SELECT * FROM case_form_definition WHERE org_id <=> ? AND case_type = ?${assignmentFilter}`,
      params
    );
    const savedMap = {};
    rows.forEach(r => { savedMap[r.section_name] = r; });

    // Merge master list with saved overrides
    const sections = masterSections.map(sectionName => {
      const saved = savedMap[sectionName];
      return {
        section_name:    sectionName,
        is_visible:      saved ? saved.is_visible : 1,
        field_overrides: saved ? (saved.field_overrides || {}) : {},
      };
    });

    res.json({ case_type, sections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/case-form-definition/sections — return all available sections per case type
router.get('/case-form-definition/sections', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  res.json({ sections: CASE_TYPE_SECTIONS });
});

// POST /api/admin/case-form-definition — save full definition for an org + case_type
router.post('/case-form-definition', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { org_id = null, case_type, sections } = req.body;
    if (!case_type || !Array.isArray(sections)) {
      return res.status(400).json({ error: 'case_type and sections array are required.' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const s of sections) {
        await conn.execute(`
          INSERT INTO case_form_definition (org_id, case_type, section_name, is_visible, field_overrides)
          VALUES (?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            is_visible      = VALUES(is_visible),
            field_overrides = VALUES(field_overrides),
            updated_at      = NOW()
        `, [org_id || null, case_type, s.section_name, s.is_visible ? 1 : 0, JSON.stringify(s.field_overrides || {})]);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    await audit(req.user.id, req.user.name, 'SAVE', 'case_form_definition', null, { case_type, org_id, sectionCount: sections.length });
    res.json({ ok: true, saved: sections.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
