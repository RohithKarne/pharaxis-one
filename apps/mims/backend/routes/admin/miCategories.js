'use strict';

/**
 * admin/miCategories.js — MI Categories management
 * Org-specific categories used to classify CM documents.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate } = require('../../middleware/auth');
const { hasGlobalAdminScope } = require('../../utils/adminScope');

function hasPlatformAdminScope(req) { return hasGlobalAdminScope(req.user); }

// GET /api/admin/mi-categories
router.get('/mi-categories', authenticate, async (req, res) => {
  try {
    const orgId = hasPlatformAdminScope(req) ? req.query.org_id : req.user.orgId;
    if (!orgId) return res.status(400).json({ error: 'org_id required.' });
    const [rows] = await pool.execute(
      `SELECT * FROM mi_categories WHERE org_id = ? ORDER BY sort_order ASC, name ASC`,
      [orgId]
    );
    res.json({ categories: rows });
  } catch (err) {
    console.error('GET /admin/mi-categories error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/mi-categories
router.post('/mi-categories', authenticate, async (req, res) => {
  try {
    const { name, description, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });
    const orgId = hasPlatformAdminScope(req) ? req.body.org_id : req.user.orgId;
    if (!orgId) return res.status(400).json({ error: 'org_id required.' });
    const [result] = await pool.execute(
      `INSERT INTO mi_categories (org_id, name, description, sort_order, created_by) VALUES (?, ?, ?, ?, ?)`,
      [orgId, name.trim(), description || null, sort_order || 0, req.user.userId]
    );
    const [[created]] = await pool.execute('SELECT * FROM mi_categories WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'MI Category created.', category: created });
  } catch (err) {
    console.error('POST /admin/mi-categories error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/mi-categories/:id
router.put('/mi-categories/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, sort_order, is_active } = req.body;
    const orgId = hasPlatformAdminScope(req) ? req.body.org_id : req.user.orgId;
    const [[existing]] = await pool.execute(
      `SELECT id FROM mi_categories WHERE id = ? AND org_id = ?`,
      [id, orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Category not found.' });
    await pool.execute(
      `UPDATE mi_categories SET name = ?, description = ?, sort_order = ?, is_active = ?, updated_at = NOW() WHERE id = ?`,
      [name, description || null, sort_order ?? 0, is_active ?? 1, id]
    );
    res.json({ message: 'MI Category updated.' });
  } catch (err) {
    console.error('PUT /admin/mi-categories/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/mi-categories/:id
router.delete('/mi-categories/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = hasPlatformAdminScope(req) ? req.query.org_id : req.user.orgId;
    const [[existing]] = await pool.execute(
      `SELECT id FROM mi_categories WHERE id = ? AND org_id = ?`,
      [id, orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Category not found.' });
    await pool.execute('DELETE FROM mi_categories WHERE id = ?', [id]);
    res.json({ message: 'MI Category deleted.' });
  } catch (err) {
    console.error('DELETE /admin/mi-categories/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
