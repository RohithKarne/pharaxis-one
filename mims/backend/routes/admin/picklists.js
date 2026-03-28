'use strict';

/**
 * admin/picklists.js — Picklist Management API
 * Full CRUD for picklist dropdown values + bulk import/export.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

// GET /api/admin/picklists — list with filters and pagination
router.get('/picklists', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const { status, field_type, category, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    let query = 'SELECT * FROM picklists WHERE 1=1';
    const params = [];

    // Org isolation — superadmin sees all
    if (req.user.role !== 'superadmin') {
      query += ' AND org_id = ?';
      params.push(req.user.orgId);
    }

    if (status && status !== 'All') {
      query += ' AND status = ?';
      params.push(status);
    }
    if (field_type) {
      query += ' AND field_type = ?';
      params.push(field_type);
    }
    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }
    if (search) {
      query += ' AND (name LIKE ? OR value LIKE ? OR field_type LIKE ? OR category LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) AS total');
    const [[{ total }]] = await pool.execute(countQuery, params);

    query += ` ORDER BY category, field_type, value LIMIT ${parseInt(limit, 10)} OFFSET ${offset}`;

    const [picklists] = await pool.execute(query, params);
    res.json({ picklists, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) {
    console.error('GET /picklists error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/picklists/export — returns full list as JSON for Excel export
router.get('/picklists/export', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const isSA = req.user.role === 'superadmin';
    const [picklists] = await pool.execute(
      `SELECT id, name, field_type, value, description, status, created_at FROM picklists
       ${isSA ? '' : 'WHERE org_id = ?'} ORDER BY field_type, value`,
      isSA ? [] : [req.user.orgId]
    );
    res.json({ picklists });
  } catch (err) {
    console.error('GET /picklists/export error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/picklists — create new picklist value
router.post('/picklists', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const { name, category, field_type, value, description, status } = req.body;
    if (!name || !field_type || !value) {
      return res.status(400).json({ error: 'name, field_type, and value are required.' });
    }
    const orgId = req.user.role === 'superadmin' ? (req.body.org_id || null) : req.user.orgId;
    const [result] = await pool.execute(
      'INSERT INTO picklists (name, category, field_type, value, description, status, created_by, org_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name.trim(), category || 'General', field_type.trim(), value.trim(), description || null, status || 'Active', req.user.userId, orgId]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'picklist', result.insertId, { name, category, field_type, value });
    const [[created]] = await pool.execute('SELECT * FROM picklists WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Picklist value created.', id: result.insertId, picklist: created });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A picklist value with this field_type and value already exists.' });
    }
    console.error('POST /picklists error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/picklists/:id — update picklist value
router.put('/picklists/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, field_type, value, description, status } = req.body;
    const [[existing]] = await pool.execute('SELECT id FROM picklists WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Picklist value not found.' });

    await pool.execute(
      'UPDATE picklists SET name = ?, category = ?, field_type = ?, value = ?, description = ?, status = ? WHERE id = ?',
      [name, category || 'General', field_type, value, description || null, status || 'Active', id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'picklist', Number(id), { name, category, field_type, value, status });
    res.json({ message: 'Picklist value updated.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A picklist value with this field_type and value already exists.' });
    }
    console.error('PUT /picklists/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/picklists/:id — soft delete (set status=Inactive)
router.delete('/picklists/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.execute('SELECT id, name, field_type, value FROM picklists WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Picklist value not found.' });

    await pool.execute('UPDATE picklists SET status = ? WHERE id = ?', ['Inactive', id]);
    await audit(req.user.userId, req.user.email, 'DELETE', 'picklist', Number(id), { name: existing.name, field_type: existing.field_type, value: existing.value });
    res.json({ message: 'Picklist value deactivated.' });
  } catch (err) {
    console.error('DELETE /picklists/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/picklists/bulk — bulk import from JSON array (validate + upsert)
router.post('/picklists/bulk', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items must be a non-empty array.' });
    }

    const errors = [];
    const imported = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.name || !item.field_type || !item.value) {
        errors.push({ index: i, error: 'name, field_type, and value are required.', item });
        continue;
      }
      try {
        await pool.execute(
          `INSERT INTO picklists (name, field_type, value, description, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), status = VALUES(status)`,
          [item.name.trim(), item.field_type.trim(), item.value.trim(), item.description || null, item.status || 'Active', req.user.userId]
        );
        imported.push(item.value);
      } catch (err) {
        errors.push({ index: i, error: err.message, item });
      }
    }

    await audit(req.user.userId, req.user.email, 'BULK_IMPORT', 'picklist', null, { imported: imported.length, errors: errors.length });
    res.json({ message: 'Bulk import complete.', imported: imported.length, errors });
  } catch (err) {
    console.error('POST /picklists/bulk error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
