'use strict';

/**
 * admin/picklists.js — Picklist Management API
 * Hierarchy model: Category -> Field -> Values
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

function normalizeStr(v, fallback = '') {
  const s = String(v ?? '').trim();
  return s || fallback;
}

function resolveOrgScope(req, requestedOrgId) {
  if (req.user.role === 'superadmin') {
    return Number(requestedOrgId || 0);
  }
  return Number(req.user.orgId || 0);
}

async function ensureCategoryAndField({ orgId, categoryName, fieldName, userId }) {
  const normalizedCategory = normalizeStr(categoryName, 'General');
  const normalizedField = normalizeStr(fieldName, 'General');

  let categoryId;
  const [[existingCategory]] = await pool.execute(
    'SELECT id FROM picklist_categories WHERE org_id = ? AND name = ? LIMIT 1',
    [orgId, normalizedCategory]
  );
  if (existingCategory) {
    categoryId = existingCategory.id;
  } else {
    const [createdCategory] = await pool.execute(
      'INSERT INTO picklist_categories (org_id, name, is_active, sort_order, created_by) VALUES (?, ?, 1, 0, ?)',
      [orgId, normalizedCategory, userId || null]
    );
    categoryId = createdCategory.insertId;
  }

  let fieldId;
  const [[existingField]] = await pool.execute(
    'SELECT id FROM picklist_fields WHERE org_id = ? AND category_id = ? AND name = ? LIMIT 1',
    [orgId, categoryId, normalizedField]
  );
  if (existingField) {
    fieldId = existingField.id;
  } else {
    const [createdField] = await pool.execute(
      'INSERT INTO picklist_fields (org_id, category_id, name, legacy_field_type, is_active, sort_order, created_by) VALUES (?, ?, ?, ?, 1, 0, ?)',
      [orgId, categoryId, normalizedField, normalizedField, userId || null]
    );
    fieldId = createdField.insertId;
  }

  return { categoryId, fieldId, categoryName: normalizedCategory, fieldName: normalizedField };
}

async function resolveFieldContext(req, body = {}) {
  const orgId = resolveOrgScope(req, body.org_id);

  if (body.field_id) {
    const [rows] = await pool.execute(
      `SELECT f.id AS field_id, f.name AS field_name, c.id AS category_id, c.name AS category_name
       FROM picklist_fields f
       INNER JOIN picklist_categories c ON c.id = f.category_id
       WHERE f.id = ? ${req.user.role === 'superadmin' ? '' : 'AND f.org_id = ?'}
       LIMIT 1`,
      req.user.role === 'superadmin' ? [Number(body.field_id)] : [Number(body.field_id), orgId]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      orgId,
      categoryId: row.category_id,
      categoryName: row.category_name,
      fieldId: row.field_id,
      fieldName: row.field_name,
    };
  }

  const categoryName = normalizeStr(body.category, 'General');
  const fieldName = normalizeStr(body.field_type, body.field_name || 'General');
  const ensured = await ensureCategoryAndField({ orgId, categoryName, fieldName, userId: req.user.userId });
  return {
    orgId,
    categoryId: ensured.categoryId,
    categoryName: ensured.categoryName,
    fieldId: ensured.fieldId,
    fieldName: ensured.fieldName,
  };
}

// GET /api/admin/picklists/categories — list categories (optionally with fields)
router.get('/picklists/categories', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const { include_inactive = '0', include_fields = '1', org_id } = req.query;
    const includeInactive = String(include_inactive) === '1';

    const where = [];
    const params = [];

    if (req.user.role !== 'superadmin') {
      where.push('c.org_id = ?');
      params.push(req.user.orgId);
    } else if (org_id !== undefined) {
      where.push('c.org_id = ?');
      params.push(Number(org_id || 0));
    }

    if (!includeInactive) {
      where.push('c.is_active = 1');
    }

    const categorySql = `
      SELECT c.id, c.org_id, c.name, c.is_active, c.sort_order, c.updated_at
      FROM picklist_categories c
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY c.sort_order ASC, c.name ASC
    `;
    const [categories] = await pool.execute(categorySql, params);

    if (String(include_fields) !== '1') {
      return res.json({ categories });
    }

    const fWhere = [];
    const fParams = [];
    if (req.user.role !== 'superadmin') {
      fWhere.push('f.org_id = ?');
      fParams.push(req.user.orgId);
    } else if (org_id !== undefined) {
      fWhere.push('f.org_id = ?');
      fParams.push(Number(org_id || 0));
    }
    if (!includeInactive) {
      fWhere.push('f.is_active = 1');
    }

    const [fields] = await pool.execute(
      `SELECT f.id, f.org_id, f.category_id, f.name, f.legacy_field_type, f.is_active, f.sort_order, f.updated_at
       FROM picklist_fields f
       ${fWhere.length ? `WHERE ${fWhere.join(' AND ')}` : ''}
       ORDER BY f.sort_order ASC, f.name ASC`,
      fParams
    );

    const fieldsByCategory = new Map();
    for (const field of fields) {
      if (!fieldsByCategory.has(field.category_id)) fieldsByCategory.set(field.category_id, []);
      fieldsByCategory.get(field.category_id).push(field);
    }

    const payload = categories.map((cat) => ({ ...cat, fields: fieldsByCategory.get(cat.id) || [] }));
    res.json({ categories: payload });
  } catch (err) {
    console.error('GET /picklists/categories error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/picklists/categories — create category
router.post('/picklists/categories', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const orgId = resolveOrgScope(req, req.body.org_id);
    const name = normalizeStr(req.body.name);
    const sortOrder = Number(req.body.sort_order || 0);
    if (!name) return res.status(400).json({ error: 'Category name is required.' });

    const [result] = await pool.execute(
      'INSERT INTO picklist_categories (org_id, name, is_active, sort_order, created_by) VALUES (?, ?, 1, ?, ?)',
      [orgId, name, sortOrder, req.user.userId || null]
    );

    await audit(req.user.userId, req.user.email, 'CREATE', 'picklist_category', result.insertId, { org_id: orgId, name });
    res.status(201).json({ message: 'Category created.', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Category already exists.' });
    console.error('POST /picklists/categories error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/picklists/categories/:id — update category
router.put('/picklists/categories/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[existing]] = await pool.execute(
      `SELECT id, org_id, name, is_active, sort_order FROM picklist_categories WHERE id = ? ${req.user.role === 'superadmin' ? '' : 'AND org_id = ?'} LIMIT 1`,
      req.user.role === 'superadmin' ? [id] : [id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Category not found.' });

    const name = normalizeStr(req.body.name, existing.name);
    const isActive = req.body.is_active === undefined ? existing.is_active : (req.body.is_active ? 1 : 0);
    const sortOrder = req.body.sort_order === undefined ? existing.sort_order : Number(req.body.sort_order || 0);

    await pool.execute(
      'UPDATE picklist_categories SET name = ?, is_active = ?, sort_order = ? WHERE id = ?',
      [name, isActive, sortOrder, id]
    );

    await audit(req.user.userId, req.user.email, 'UPDATE', 'picklist_category', id, { name, is_active: isActive, sort_order: sortOrder });
    res.json({ message: 'Category updated.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Category with this name already exists.' });
    console.error('PUT /picklists/categories/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/picklists/fields — list fields
router.get('/picklists/fields', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const { category_id, include_inactive = '0', org_id } = req.query;
    const includeInactive = String(include_inactive) === '1';

    const where = [];
    const params = [];

    if (req.user.role !== 'superadmin') {
      where.push('f.org_id = ?');
      params.push(req.user.orgId);
    } else if (org_id !== undefined) {
      where.push('f.org_id = ?');
      params.push(Number(org_id || 0));
    }

    if (category_id) {
      where.push('f.category_id = ?');
      params.push(Number(category_id));
    }

    if (!includeInactive) {
      where.push('f.is_active = 1');
    }

    const [fields] = await pool.execute(
      `SELECT f.id, f.org_id, f.category_id, f.name, f.legacy_field_type, f.is_active, f.sort_order,
              c.name AS category_name
       FROM picklist_fields f
       INNER JOIN picklist_categories c ON c.id = f.category_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY c.sort_order ASC, c.name ASC, f.sort_order ASC, f.name ASC`,
      params
    );

    res.json({ fields });
  } catch (err) {
    console.error('GET /picklists/fields error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/picklists/fields — create field
router.post('/picklists/fields', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const orgId = resolveOrgScope(req, req.body.org_id);
    const categoryId = Number(req.body.category_id || 0);
    const name = normalizeStr(req.body.name || req.body.field_type);
    const sortOrder = Number(req.body.sort_order || 0);
    if (!categoryId || !name) {
      return res.status(400).json({ error: 'category_id and field name are required.' });
    }

    const [[category]] = await pool.execute(
      `SELECT id, org_id FROM picklist_categories WHERE id = ? ${req.user.role === 'superadmin' ? '' : 'AND org_id = ?'} LIMIT 1`,
      req.user.role === 'superadmin' ? [categoryId] : [categoryId, req.user.orgId]
    );
    if (!category) return res.status(404).json({ error: 'Category not found.' });

    const [result] = await pool.execute(
      'INSERT INTO picklist_fields (org_id, category_id, name, legacy_field_type, is_active, sort_order, created_by) VALUES (?, ?, ?, ?, 1, ?, ?)',
      [orgId, categoryId, name, normalizeStr(req.body.legacy_field_type, name), sortOrder, req.user.userId || null]
    );

    await audit(req.user.userId, req.user.email, 'CREATE', 'picklist_field', result.insertId, { org_id: orgId, category_id: categoryId, name });
    res.status(201).json({ message: 'Field created.', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Field already exists in this category.' });
    console.error('POST /picklists/fields error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/picklists/fields/:id — update field
router.put('/picklists/fields/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[existing]] = await pool.execute(
      `SELECT id, org_id, category_id, name, legacy_field_type, is_active, sort_order
       FROM picklist_fields WHERE id = ? ${req.user.role === 'superadmin' ? '' : 'AND org_id = ?'} LIMIT 1`,
      req.user.role === 'superadmin' ? [id] : [id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Field not found.' });

    const categoryId = req.body.category_id ? Number(req.body.category_id) : existing.category_id;
    const name = normalizeStr(req.body.name, existing.name);
    const legacyFieldType = normalizeStr(req.body.legacy_field_type, existing.legacy_field_type || name);
    const isActive = req.body.is_active === undefined ? existing.is_active : (req.body.is_active ? 1 : 0);
    const sortOrder = req.body.sort_order === undefined ? existing.sort_order : Number(req.body.sort_order || 0);

    await pool.execute(
      'UPDATE picklist_fields SET category_id = ?, name = ?, legacy_field_type = ?, is_active = ?, sort_order = ? WHERE id = ?',
      [categoryId, name, legacyFieldType, isActive, sortOrder, id]
    );

    const [[categoryRow]] = await pool.execute('SELECT name FROM picklist_categories WHERE id = ? LIMIT 1', [categoryId]);
    await pool.execute('UPDATE picklists SET category = ?, field_type = ? WHERE field_id = ?', [
      categoryRow?.name || 'General',
      name,
      id,
    ]);

    await audit(req.user.userId, req.user.email, 'UPDATE', 'picklist_field', id, {
      category_id: categoryId,
      name,
      legacy_field_type: legacyFieldType,
      is_active: isActive,
      sort_order: sortOrder,
    });

    res.json({ message: 'Field updated.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Field already exists in this category.' });
    console.error('PUT /picklists/fields/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/picklists — list with filters and pagination
router.get('/picklists', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const {
      status,
      field_type,
      category,
      field_id,
      search,
      page = 1,
      limit = 50,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 50);
    const offset = (pageNum - 1) * limitNum;

    const where = ['1=1'];
    const params = [];

    if (req.user.role !== 'superadmin') {
      where.push('p.org_id = ?');
      params.push(req.user.orgId);
    }

    if (status && status !== 'All') {
      where.push('p.status = ?');
      params.push(status);
    }

    if (field_id) {
      where.push('p.field_id = ?');
      params.push(Number(field_id));
    } else {
      if (field_type) {
        where.push('(f.name = ? OR p.field_type = ?)');
        params.push(field_type, field_type);
      }
      if (category) {
        where.push('(c.name = ? OR p.category = ?)');
        params.push(category, category);
      }
    }

    if (search) {
      where.push('(p.name LIKE ? OR p.value LIKE ? OR f.name LIKE ? OR c.name LIKE ? OR p.field_type LIKE ? OR p.category LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like, like, like, like);
    }

    const baseFrom = `
      FROM picklists p
      LEFT JOIN picklist_fields f ON f.id = p.field_id
      LEFT JOIN picklist_categories c ON c.id = f.category_id
      WHERE ${where.join(' AND ')}
    `;

    const [[countRow]] = await pool.execute(`SELECT COUNT(*) AS total ${baseFrom}`, params);
    const total = Number(countRow.total || 0);

    const [picklists] = await pool.execute(
      `SELECT p.id, p.name, p.value, p.description, p.status, p.created_at, p.updated_at, p.org_id,
              p.field_id,
              COALESCE(c.name, p.category, 'General') AS category,
              COALESCE(f.name, p.field_type, 'General') AS field_type
       ${baseFrom}
       ORDER BY COALESCE(c.name, p.category, 'General'), COALESCE(f.name, p.field_type, 'General'), p.value
       LIMIT ${limitNum} OFFSET ${offset}`,
      params
    );

    res.json({
      picklists,
      total,
      page: pageNum,
      limit: limitNum,
      total_pages: Math.max(1, Math.ceil(total / limitNum)),
    });
  } catch (err) {
    console.error('GET /picklists error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/picklists/export — returns full list as JSON for Excel export
router.get('/picklists/export', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const where = [];
    const params = [];
    if (req.user.role !== 'superadmin') {
      where.push('p.org_id = ?');
      params.push(req.user.orgId);
    }

    const [picklists] = await pool.execute(
      `SELECT p.id,
              COALESCE(c.name, p.category, 'General') AS category,
              COALESCE(f.name, p.field_type, 'General') AS field_type,
              p.name,
              p.value,
              p.description,
              p.status,
              p.created_at,
              p.updated_at
       FROM picklists p
       LEFT JOIN picklist_fields f ON f.id = p.field_id
       LEFT JOIN picklist_categories c ON c.id = f.category_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY category, field_type, value`,
      params
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
    const { name, value, description, status } = req.body;
    if (!value) {
      return res.status(400).json({ error: 'value is required.' });
    }

    const context = await resolveFieldContext(req, req.body);
    if (!context) return res.status(400).json({ error: 'Invalid field_id.' });

    const displayName = normalizeStr(name, value);

    const [result] = await pool.execute(
      `INSERT INTO picklists (name, category, field_type, field_id, value, description, status, created_by, org_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        displayName,
        context.categoryName,
        context.fieldName,
        context.fieldId,
        normalizeStr(value),
        description || null,
        status || 'Active',
        req.user.userId,
        context.orgId,
      ]
    );

    await audit(req.user.userId, req.user.email, 'CREATE', 'picklist', result.insertId, {
      category: context.categoryName,
      field_type: context.fieldName,
      value,
    });

    const [[created]] = await pool.execute(
      `SELECT p.id, p.name, p.value, p.description, p.status, p.created_at, p.updated_at, p.field_id,
              COALESCE(c.name, p.category, 'General') AS category,
              COALESCE(f.name, p.field_type, 'General') AS field_type
       FROM picklists p
       LEFT JOIN picklist_fields f ON f.id = p.field_id
       LEFT JOIN picklist_categories c ON c.id = f.category_id
       WHERE p.id = ?`,
      [result.insertId]
    );

    res.status(201).json({ message: 'Picklist value created.', id: result.insertId, picklist: created });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A picklist value with this field/value already exists.' });
    }
    console.error('POST /picklists error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/picklists/:id — update picklist value
router.put('/picklists/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[existing]] = await pool.execute(
      `SELECT p.id, p.org_id, p.name, p.value, p.description, p.status, p.field_id, p.category, p.field_type
       FROM picklists p
       WHERE p.id = ? ${req.user.role === 'superadmin' ? '' : 'AND p.org_id = ?'}
       LIMIT 1`,
      req.user.role === 'superadmin' ? [id] : [id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Picklist value not found.' });

    const context = await resolveFieldContext(req, {
      ...req.body,
      field_id: req.body.field_id || existing.field_id,
      category: req.body.category || existing.category,
      field_type: req.body.field_type || existing.field_type,
      org_id: existing.org_id,
    });
    if (!context) return res.status(400).json({ error: 'Invalid field context.' });

    const payload = {
      name: normalizeStr(req.body.name, existing.name || req.body.value || existing.value),
      value: normalizeStr(req.body.value, existing.value),
      description: req.body.description === undefined ? existing.description : req.body.description,
      status: req.body.status || existing.status || 'Active',
    };

    await pool.execute(
      `UPDATE picklists
       SET name = ?, category = ?, field_type = ?, field_id = ?, value = ?, description = ?, status = ?
       WHERE id = ?`,
      [
        payload.name,
        context.categoryName,
        context.fieldName,
        context.fieldId,
        payload.value,
        payload.description || null,
        payload.status,
        id,
      ]
    );

    await audit(req.user.userId, req.user.email, 'UPDATE', 'picklist', id, {
      category: context.categoryName,
      field_type: context.fieldName,
      value: payload.value,
      status: payload.status,
    });

    res.json({ message: 'Picklist value updated.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A picklist value with this field/value already exists.' });
    }
    console.error('PUT /picklists/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/picklists/:id — soft delete (set status=Inactive)
router.delete('/picklists/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[existing]] = await pool.execute(
      `SELECT id, name, field_type, value FROM picklists WHERE id = ? ${req.user.role === 'superadmin' ? '' : 'AND org_id = ?'} LIMIT 1`,
      req.user.role === 'superadmin' ? [id] : [id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Picklist value not found.' });

    await pool.execute('UPDATE picklists SET status = ? WHERE id = ?', ['Inactive', id]);
    await audit(req.user.userId, req.user.email, 'DELETE', 'picklist', id, { name: existing.name, field_type: existing.field_type, value: existing.value });
    res.json({ message: 'Picklist value deactivated.' });
  } catch (err) {
    console.error('DELETE /picklists/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/picklists/bulk-status — activate/inactivate selected rows
router.post('/picklists/bulk-status', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map((n) => Number(n)).filter(Boolean) : [];
    const status = normalizeStr(req.body.status);
    const fieldId = req.body.field_id ? Number(req.body.field_id) : null;

    if (!ids.length) return res.status(400).json({ error: 'ids must be a non-empty array.' });
    if (!['Active', 'Inactive'].includes(status)) return res.status(400).json({ error: 'status must be Active or Inactive.' });

    const placeholders = ids.map(() => '?').join(',');
    const where = [`id IN (${placeholders})`];
    const params = [...ids];

    if (req.user.role !== 'superadmin') {
      where.push('org_id = ?');
      params.push(req.user.orgId);
    }
    if (fieldId) {
      where.push('field_id = ?');
      params.push(fieldId);
    }

    const [result] = await pool.execute(
      `UPDATE picklists SET status = ? WHERE ${where.join(' AND ')}`,
      [status, ...params]
    );

    await audit(req.user.userId, req.user.email, 'BULK_UPDATE', 'picklist', null, {
      status,
      count: result.affectedRows,
      field_id: fieldId,
      ids,
    });

    res.json({ message: 'Bulk status updated.', affected: result.affectedRows });
  } catch (err) {
    console.error('POST /picklists/bulk-status error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/picklists/bulk — bulk import from JSON array (validate + upsert)
router.post('/picklists/bulk', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const raw = Array.isArray(req.body) ? req.body : req.body.items;
    if (!Array.isArray(raw) || raw.length === 0) {
      return res.status(400).json({ error: 'items must be a non-empty array.' });
    }

    const errors = [];
    let imported = 0;

    for (let i = 0; i < raw.length; i++) {
      const item = raw[i] || {};
      const category = normalizeStr(item.category || item.Category, 'General');
      const fieldType = normalizeStr(item.field_type || item.fieldType || item['Field Type'] || item.field_name || item.Field, 'General');
      const value = normalizeStr(item.value || item.Value);
      const name = normalizeStr(item.name || item.Name, value);
      const status = normalizeStr(item.status || item.Status, 'Active');
      const description = item.description ?? item.Description ?? null;
      const orgId = resolveOrgScope(req, item.org_id || item.orgId || 0);

      if (!value) {
        errors.push({ index: i, error: 'value is required.', item });
        continue;
      }

      try {
        const ensured = await ensureCategoryAndField({
          orgId,
          categoryName: category,
          fieldName: fieldType,
          userId: req.user.userId,
        });

        await pool.execute(
          `INSERT INTO picklists (name, category, field_type, field_id, value, description, status, created_by, org_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             name = VALUES(name),
             category = VALUES(category),
             field_type = VALUES(field_type),
             field_id = VALUES(field_id),
             description = VALUES(description),
             status = VALUES(status)`,
          [name, ensured.categoryName, ensured.fieldName, ensured.fieldId, value, description, status, req.user.userId, orgId]
        );

        imported += 1;
      } catch (err) {
        errors.push({ index: i, error: err.message, item });
      }
    }

    await audit(req.user.userId, req.user.email, 'BULK_IMPORT', 'picklist', null, {
      imported,
      errors: errors.length,
    });

    res.json({ message: 'Bulk import complete.', imported, errors });
  } catch (err) {
    console.error('POST /picklists/bulk error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
