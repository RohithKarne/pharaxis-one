'use strict';

/**
 * documentTypes.js — Sprint 2 #15 surface.
 *
 * Read endpoints surface the active taxonomy to any signed-in user (used by
 * the attachment tag picker, MI document classifier, PC investigation form).
 * Admin endpoints CRUD the taxonomy per tenant or globally.
 *
 *   GET    /api/document-types                    — flat list of active types
 *   GET    /api/document-types/grouped            — { category: [...types...] }
 *   GET    /api/admin/document-type-categories
 *   POST   /api/admin/document-type-categories
 *   PUT    /api/admin/document-type-categories/:id
 *   DELETE /api/admin/document-type-categories/:id   (soft via is_active=0)
 *   GET    /api/admin/document-types
 *   POST   /api/admin/document-types
 *   PUT    /api/admin/document-types/:id
 *   DELETE /api/admin/document-types/:id              (soft via is_active=0)
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');

const ADMIN = ['admin', 'superadmin'];

// ── Read (any signed-in user) ────────────────────────────────────────────────

router.get('/document-types', authenticate, async (req, res) => {
  try {
    const orgId = req.user.orgId ?? null;
    const [rows] = await pool.execute(
      `SELECT t.id, t.code, t.label, t.description, t.requires_pii_redaction,
              t.retention_days, t.category_id, c.code AS category_code, c.label AS category_label
         FROM document_types t
         JOIN document_type_categories c ON c.id = t.category_id
        WHERE t.is_active = 1 AND c.is_active = 1
          AND (t.org_id IS NULL OR t.org_id = ?)
          AND (c.org_id IS NULL OR c.org_id = ?)
        ORDER BY c.sort_order, c.label, t.sort_order, t.label`,
      [orgId, orgId]
    );
    res.json({ types: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/document-types/grouped', authenticate, async (req, res) => {
  try {
    const orgId = req.user.orgId ?? null;
    const [rows] = await pool.execute(
      `SELECT t.id, t.code, t.label, t.requires_pii_redaction,
              c.id AS category_id, c.code AS category_code, c.label AS category_label, c.sort_order AS cat_sort
         FROM document_types t
         JOIN document_type_categories c ON c.id = t.category_id
        WHERE t.is_active = 1 AND c.is_active = 1
          AND (t.org_id IS NULL OR t.org_id = ?)
          AND (c.org_id IS NULL OR c.org_id = ?)
        ORDER BY c.sort_order, c.label, t.sort_order, t.label`,
      [orgId, orgId]
    );
    const grouped = {};
    for (const r of rows) {
      const key = r.category_code;
      if (!grouped[key]) grouped[key] = {
        category_id: r.category_id, code: r.category_code, label: r.category_label, types: [],
      };
      grouped[key].types.push({
        id: r.id, code: r.code, label: r.label, requires_pii_redaction: !!r.requires_pii_redaction,
      });
    }
    res.json({ groups: Object.values(grouped) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: categories ────────────────────────────────────────────────────────

router.get('/admin/document-type-categories', authenticate, requireRole(...ADMIN), async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT * FROM document_type_categories ORDER BY org_id IS NULL DESC, sort_order, label`
    );
    res.json({ categories: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/document-type-categories', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const { id, org_id = null, code, label, description = null, sort_order = 0, is_active = 1 } = req.body || {};
    if (!code || !label) return res.status(400).json({ error: 'code + label required' });
    if (id) {
      await pool.execute(
        `UPDATE document_type_categories
            SET label = ?, description = ?, sort_order = ?, is_active = ?, updated_at = NOW()
          WHERE id = ?`,
        [label, description, sort_order, is_active ? 1 : 0, id]
      );
    } else {
      await pool.execute(
        `INSERT INTO document_type_categories (org_id, code, label, description, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [org_id, code, label, description, sort_order, is_active ? 1 : 0]
      );
    }
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/admin/document-type-categories/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const { label, description, sort_order, is_active } = req.body || {};
    await pool.execute(
      `UPDATE document_type_categories
          SET label = COALESCE(?, label),
              description = COALESCE(?, description),
              sort_order  = COALESCE(?, sort_order),
              is_active   = COALESCE(?, is_active),
              updated_at  = NOW()
        WHERE id = ?`,
      [label ?? null, description ?? null, sort_order ?? null, is_active ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/admin/document-type-categories/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    // Soft delete — keep historical references readable
    await pool.execute(`UPDATE document_type_categories SET is_active = 0 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin: types ─────────────────────────────────────────────────────────────

router.get('/admin/document-types', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const { category_id } = req.query || {};
    const params = [];
    let where = ' WHERE 1=1 ';
    if (category_id) { where += ' AND category_id = ?'; params.push(category_id); }
    const [rows] = await pool.execute(
      `SELECT * FROM document_types ${where} ORDER BY org_id IS NULL DESC, sort_order, label`, params);
    res.json({ types: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/admin/document-types', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const {
      id, org_id = null, category_id, code, label, description = null,
      retention_days = null, requires_pii_redaction = 0, sort_order = 0, is_active = 1,
    } = req.body || {};
    if (!category_id || !code || !label) return res.status(400).json({ error: 'category_id + code + label required' });
    if (id) {
      await pool.execute(
        `UPDATE document_types
            SET category_id = ?, label = ?, description = ?, retention_days = ?,
                requires_pii_redaction = ?, sort_order = ?, is_active = ?, updated_at = NOW()
          WHERE id = ?`,
        [category_id, label, description, retention_days,
         requires_pii_redaction ? 1 : 0, sort_order, is_active ? 1 : 0, id]
      );
    } else {
      await pool.execute(
        `INSERT INTO document_types
           (org_id, category_id, code, label, description, retention_days, requires_pii_redaction, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [org_id, category_id, code, label, description, retention_days,
         requires_pii_redaction ? 1 : 0, sort_order, is_active ? 1 : 0]
      );
    }
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put('/admin/document-types/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const { label, description, retention_days, requires_pii_redaction, sort_order, is_active } = req.body || {};
    await pool.execute(
      `UPDATE document_types
          SET label = COALESCE(?, label),
              description = COALESCE(?, description),
              retention_days = COALESCE(?, retention_days),
              requires_pii_redaction = COALESCE(?, requires_pii_redaction),
              sort_order = COALESCE(?, sort_order),
              is_active  = COALESCE(?, is_active),
              updated_at = NOW()
        WHERE id = ?`,
      [label ?? null, description ?? null, retention_days ?? null,
       requires_pii_redaction == null ? null : (requires_pii_redaction ? 1 : 0),
       sort_order ?? null, is_active ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/admin/document-types/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    await pool.execute(`UPDATE document_types SET is_active = 0 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
