'use strict';

/**
 * cm/picklists.js — Dedicated Content Management Picklists API
 *
 * Separate from admin picklists — these are CM-specific field value lists
 * (document_category, language_options, content_type, etc.)
 *
 * Routes:
 *   GET    /api/cm/picklists              — list by field_type (or all)
 *   POST   /api/cm/picklists              — create a new picklist value
 *   PUT    /api/picklists/:id          — update a picklist value
 *   DELETE /api/picklists/:id          — delete a picklist value
 *   GET    /api/picklists/field-types  — list distinct field_type keys for this org
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');

function orgId(req) {
  return Number(req.user?.orgId || 0);
}

// ── GET /api/picklists/field-types ─────────────────────────────────────────
// Must be before /:id route to avoid conflict
router.get('/picklists/field-types', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT field_type FROM cm_picklists WHERE org_id = ? ORDER BY field_type ASC`,
      [orgId(req)]
    );
    res.json({ field_types: rows.map(r => r.field_type) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/cm/picklists ─────────────────────────────────────────────────────
router.get('/picklists', authenticate, async (req, res) => {
  try {
    const { field_type, active_only } = req.query;
    let sql = `SELECT * FROM cm_picklists WHERE org_id = ?`;
    const params = [orgId(req)];

    if (field_type) {
      sql += ` AND field_type = ?`;
      params.push(field_type);
    }
    if (active_only === '1' || active_only === 'true') {
      sql += ` AND is_active = 1`;
    }
    sql += ` ORDER BY field_type ASC, sort_order ASC, label ASC`;

    const [rows] = await pool.execute(sql, params);
    res.json({ picklists: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/cm/picklists ────────────────────────────────────────────────────
router.post('/picklists', authenticate, async (req, res) => {
  try {
    const { field_type, value, label, sort_order = 0 } = req.body;
    if (!field_type?.trim()) return res.status(400).json({ error: 'field_type is required.' });
    if (!value?.trim()) return res.status(400).json({ error: 'value is required.' });

    const finalLabel = (label?.trim()) || value.trim();
    const org = orgId(req);

    const [result] = await pool.execute(
      `INSERT INTO cm_picklists (org_id, field_type, value, label, sort_order, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [org, field_type.trim(), value.trim(), finalLabel, Number(sort_order), req.user?.userId || null] /* WP5: was req.user.id (undefined) — actor id is req.user.userId */
    );
    const [[created]] = await pool.execute('SELECT * FROM cm_picklists WHERE id = ?', [result.insertId]);
    res.status(201).json({ picklist: created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/picklists/:id ─────────────────────────────────────────────────
router.put('/picklists/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { field_type, value, label, sort_order, is_active } = req.body;
    const org = orgId(req);

    const [[existing]] = await pool.execute(
      'SELECT id FROM cm_picklists WHERE id = ? AND org_id = ?',
      [id, org]
    );
    if (!existing) return res.status(404).json({ error: 'Picklist value not found.' });

    if (!value?.trim()) return res.status(400).json({ error: 'value is required.' });

    const finalLabel = (label?.trim()) || value.trim();

    await pool.execute(
      `UPDATE cm_picklists SET field_type = ?, value = ?, label = ?, sort_order = ?, is_active = ?, updated_at = NOW()
       WHERE id = ? AND org_id = ?`,
      [
        field_type?.trim() || existing.field_type,
        value.trim(),
        finalLabel,
        Number(sort_order ?? 0),
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
        id,
        org,
      ]
    );
    const [[updated]] = await pool.execute('SELECT * FROM cm_picklists WHERE id = ?', [id]);
    res.json({ picklist: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/picklists/:id ──────────────────────────────────────────────
router.delete('/picklists/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const org = orgId(req);

    const [[existing]] = await pool.execute(
      'SELECT id FROM cm_picklists WHERE id = ? AND org_id = ?',
      [id, org]
    );
    if (!existing) return res.status(404).json({ error: 'Picklist value not found.' });

    await pool.execute('DELETE FROM cm_picklists WHERE id = ? AND org_id = ?', [id, org]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
