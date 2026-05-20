'use strict';

/**
 * admin/productDictionary.js — Product Dictionary API
 * Richer product management: product families and full product CRUD with family info.
 * Does not conflict with existing /api/admin/products routes in config.js.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
const {
  GROUP_TYPES,
  TARGET_TYPES,
  getProductGroup,
  listAssignments,
  listMembers,
  listProductGroups,
  requireGroupType,
  requireMemberType,
  requireTargetType,
  resolveProductGroups,
  summarizeResolvedProductGroups,
} = require('../../services/productGroupService');

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

function hasPlatformAdminScope(req) {
  return hasGlobalAdminScope(req.user);
}

function getScopedOrgId(req, providedOrgId = null) {
  return hasPlatformAdminScope(req) ? (providedOrgId || null) : req.user.orgId;
}

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (_) { return {}; }
  }
  return raw;
}

function memberLabelSource(memberType) {
  switch (memberType) {
    case 'product_family': return 'product family';
    case 'product': return 'product';
    case 'country_authorization': return 'country authorization';
    default: return 'member';
  }
}

// ─── PRODUCT GROUPS ──────────────────────────────────────────────────────────

router.get('/product-group-types', authenticate, requireRole('admin', 'platform_admin'), (_req, res) => {
  res.json({
    group_types: Object.entries(GROUP_TYPES).map(([key, label]) => ({ key, label })),
    target_types: Array.from(TARGET_TYPES).map(key => ({ key })),
  });
});

router.get('/product-groups/resolve', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const groups = await resolveProductGroups({
      orgId: req.user.orgId || null,
      groupType: req.query.group_type,
      targetType: req.query.target_type || null,
      productId: req.query.product_id || null,
      country: req.query.country || null,
    });
    res.json({ groups });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/product-groups', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const groups = await listProductGroups(req.user.orgId || null, req.query);
    res.json({ groups });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/product-groups', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { name, description, is_active } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });
    const groupType = requireGroupType(req.body.group_type);
    const orgId = getScopedOrgId(req, req.body.org_id);
    const [result] = await pool.execute(
      `INSERT INTO product_groups (org_id, name, group_type, description, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [orgId, name.trim(), groupType, description || null, is_active !== undefined ? (is_active ? 1 : 0) : 1, req.user.userId || null, req.user.userId || null]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'product_group', result.insertId, { name, group_type: groupType });
    res.status(201).json({ id: result.insertId, group: await getProductGroup(req.user.orgId || null, result.insertId) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A product group with this name and type already exists.' });
    res.status(400).json({ error: err.message || 'Server error.' });
  }
});

router.put('/product-groups/:id', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const group = await getProductGroup(req.user.orgId || null, req.params.id);
    if (!group) return res.status(404).json({ error: 'Product group not found.' });
    const groupType = req.body.group_type ? requireGroupType(req.body.group_type) : group.group_type;
    await pool.execute(
      `UPDATE product_groups
          SET name = ?, group_type = ?, description = ?, is_active = ?, updated_by = ?, updated_at = NOW()
        WHERE id = ?`,
      [
        req.body.name || group.name,
        groupType,
        req.body.description !== undefined ? req.body.description : group.description,
        req.body.is_active !== undefined ? (req.body.is_active ? 1 : 0) : group.is_active,
        req.user.userId || null,
        req.params.id,
      ]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'product_group', Number(req.params.id), { group_type: groupType });
    res.json({ group: await getProductGroup(req.user.orgId || null, req.params.id) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A product group with this name and type already exists.' });
    res.status(400).json({ error: err.message || 'Server error.' });
  }
});

router.delete('/product-groups/:id', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const group = await getProductGroup(req.user.orgId || null, req.params.id);
    if (!group) return res.status(404).json({ error: 'Product group not found.' });
    await pool.execute('UPDATE product_groups SET is_active = 0, updated_by = ?, updated_at = NOW() WHERE id = ?', [req.user.userId || null, req.params.id]);
    await audit(req.user.userId, req.user.email, 'DEACTIVATE', 'product_group', Number(req.params.id), { name: group.name });
    res.json({ message: 'Product group deactivated.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

router.get('/product-groups/:id/members', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const members = await listMembers(req.user.orgId || null, req.params.id);
    if (!members) return res.status(404).json({ error: 'Product group not found.' });
    res.json({ members });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

router.post('/product-groups/:id/members', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const group = await getProductGroup(req.user.orgId || null, req.params.id);
    if (!group) return res.status(404).json({ error: 'Product group not found.' });
    const memberType = requireMemberType(req.body.member_type);
    const memberId = Number(req.body.member_id || 0);
    if (!memberId) return res.status(400).json({ error: `${memberLabelSource(memberType)} id is required.` });
    const [result] = await pool.execute(
      `INSERT INTO product_group_members (group_id, member_type, member_id, created_by)
       VALUES (?, ?, ?, ?)`,
      [req.params.id, memberType, memberId, req.user.userId || null]
    );
    await audit(req.user.userId, req.user.email, 'ADD_MEMBER', 'product_group', Number(req.params.id), { member_type: memberType, member_id: memberId });
    res.status(201).json({ id: result.insertId, members: await listMembers(req.user.orgId || null, req.params.id) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This member is already in the product group.' });
    res.status(400).json({ error: err.message || 'Server error.' });
  }
});

router.delete('/product-groups/:id/members/:memberId', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const group = await getProductGroup(req.user.orgId || null, req.params.id);
    if (!group) return res.status(404).json({ error: 'Product group not found.' });
    await pool.execute('DELETE FROM product_group_members WHERE group_id = ? AND id = ?', [req.params.id, req.params.memberId]);
    await audit(req.user.userId, req.user.email, 'REMOVE_MEMBER', 'product_group', Number(req.params.id), { member_row_id: req.params.memberId });
    res.json({ members: await listMembers(req.user.orgId || null, req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

router.get('/product-groups/:id/assignments', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const assignments = await listAssignments(req.user.orgId || null, req.params.id);
    if (!assignments) return res.status(404).json({ error: 'Product group not found.' });
    res.json({ assignments });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

router.post('/product-groups/:id/assignments', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const group = await getProductGroup(req.user.orgId || null, req.params.id);
    if (!group) return res.status(404).json({ error: 'Product group not found.' });
    const targetType = requireTargetType(req.body.target_type);
    const targetId = req.body.target_id ? Number(req.body.target_id) : null;
    const [dupes] = await pool.execute(
      'SELECT id FROM product_group_assignments WHERE group_id = ? AND target_type = ? AND target_id <=> ? LIMIT 1',
      [req.params.id, targetType, targetId]
    );
    if (dupes.length) return res.status(409).json({ error: 'This assignment already exists.' });
    const [result] = await pool.execute(
      `INSERT INTO product_group_assignments (group_id, target_type, target_id, metadata, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, targetType, targetId, JSON.stringify(parseMetadata(req.body.metadata)), req.user.userId || null]
    );
    await audit(req.user.userId, req.user.email, 'ADD_ASSIGNMENT', 'product_group', Number(req.params.id), { target_type: targetType, target_id: targetId });
    res.status(201).json({ id: result.insertId, assignments: await listAssignments(req.user.orgId || null, req.params.id) });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Server error.' });
  }
});

router.delete('/product-groups/:id/assignments/:assignmentId', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const group = await getProductGroup(req.user.orgId || null, req.params.id);
    if (!group) return res.status(404).json({ error: 'Product group not found.' });
    await pool.execute('DELETE FROM product_group_assignments WHERE group_id = ? AND id = ?', [req.params.id, req.params.assignmentId]);
    await audit(req.user.userId, req.user.email, 'REMOVE_ASSIGNMENT', 'product_group', Number(req.params.id), { assignment_id: req.params.assignmentId });
    res.json({ assignments: await listAssignments(req.user.orgId || null, req.params.id) });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// ─── PRODUCT FAMILIES ────────────────────────────────────────────────────────

// GET /api/admin/product-families — list families with their products
router.get('/product-families', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const [families] = await pool.execute(
      hasPlatformAdminScope(req)
        ? 'SELECT * FROM product_families ORDER BY name'
        : 'SELECT * FROM product_families WHERE org_id = ? ORDER BY name',
      hasPlatformAdminScope(req) ? [] : [req.user.orgId]
    );

    // Attach products to each family
    const familyIds = families.map(f => f.id);
    let products = [];
    if (familyIds.length > 0) {
      const placeholders = familyIds.map(() => '?').join(',');
      [products] = await pool.execute(
        `SELECT p.*, pf.name AS family_name
         FROM products p
         LEFT JOIN product_families pf ON p.family_id = pf.id
         WHERE p.family_id IN (${placeholders}) ${hasPlatformAdminScope(req) ? '' : 'AND p.org_id = ?'}`,
        hasPlatformAdminScope(req) ? familyIds : [...familyIds, req.user.orgId]
      );
    }

    const parsed = families.map(f => ({
      ...f,
      ingredients: f.ingredients ? (typeof f.ingredients === 'string' ? JSON.parse(f.ingredients) : f.ingredients) : null,
      products: products.filter(p => p.family_id === f.id),
    }));

    res.json({ families: parsed });
  } catch (err) {
    console.error('GET /product-families error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/product-families — create family
router.post('/product-families', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { name, ingredients, is_active } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required.' });
    const orgId = getScopedOrgId(req, req.body.org_id);

    const [result] = await pool.execute(
      'INSERT INTO product_families (name, ingredients, is_active, org_id) VALUES (?, ?, ?, ?)',
      [name.trim(), ingredients ? JSON.stringify(ingredients) : null, is_active !== undefined ? (is_active ? 1 : 0) : 1, orgId]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'product_family', result.insertId, { name });
    const [[created]] = await pool.execute('SELECT * FROM product_families WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Product family created.', id: result.insertId, family: created });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A product family with this name already exists.' });
    }
    console.error('POST /product-families error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/product-families/:id — update family
router.put('/product-families/:id', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.execute(
      hasPlatformAdminScope(req)
        ? 'SELECT id FROM product_families WHERE id = ?'
        : 'SELECT id FROM product_families WHERE id = ? AND org_id = ?',
      hasPlatformAdminScope(req) ? [id] : [id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Product family not found.' });

    const { name, ingredients, is_active } = req.body;
    await pool.execute(
      'UPDATE product_families SET name = ?, ingredients = ?, is_active = ?, updated_at = NOW() WHERE id = ?',
      [name, ingredients ? JSON.stringify(ingredients) : null, is_active ? 1 : 0, id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'product_family', Number(id), { name, is_active });
    res.json({ message: 'Product family updated.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A product family with this name already exists.' });
    }
    console.error('PUT /product-families/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── PRODUCTS (FULL / ENRICHED) ───────────────────────────────────────────────

// GET /api/admin/products-full — list all products with org info joined
router.get('/products-full', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { search, org_id, family_id, is_active } = req.query;

    let query = `
      SELECT p.*, o.name AS org_name, pf.name AS family_name
      FROM products p
      LEFT JOIN organisations o ON p.org_id = o.id
      LEFT JOIN product_families pf ON pf.id = p.family_id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      query += ' AND p.trade_name LIKE ?';
      params.push(`%${search}%`);
    }
    if (org_id) {
      query += ' AND p.org_id = ?';
      params.push(org_id);
    } else if (!hasPlatformAdminScope(req)) {
      query += ' AND p.org_id = ?';
      params.push(req.user.orgId);
    }
    if (family_id) {
      query += ' AND p.family_id = ?';
      params.push(family_id);
    }
    if (is_active !== undefined) {
      query += ' AND p.is_active = ?';
      params.push(is_active === 'true' || is_active === '1' ? 1 : 0);
    }

    query += ' ORDER BY p.trade_name';
    const [products] = await pool.execute(query, params);
    const enrichedProducts = await Promise.all(products.map(async product => ({
      ...product,
      product_groups: await summarizeResolvedProductGroups({
        orgId: product.org_id || req.user.orgId || null,
        productId: product.id,
        country: product.authorization_country || null,
      }),
    })));
    res.json({ products: enrichedProducts });
  } catch (err) {
    console.error('GET /products-full error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/products/:id/defaults', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const [[product]] = await pool.execute(
      hasPlatformAdminScope(req)
        ? 'SELECT * FROM products WHERE id = ? LIMIT 1'
        : 'SELECT * FROM products WHERE id = ? AND org_id = ? LIMIT 1',
      hasPlatformAdminScope(req) ? [req.params.id] : [req.params.id, req.user.orgId]
    );
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json({
      product_id: product.id,
      defaults: {
        product_name: product.trade_name || product.name || '',
        dose_unit: product.dosage ? String(product.dosage).split(' ').slice(-1)[0] : '',
        route_of_admin: product.route_of_admin || '',
        indication: product.common_indications || product.indication || '',
        authorization_country: product.authorization_country || '',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// POST /api/admin/products-full — create product with enriched fields
router.post('/products-full', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { trade_name, family_id, mah, dosage, atc_code, authorization_country, is_active } = req.body;
    if (!trade_name) return res.status(400).json({ error: 'trade_name is required.' });
    const orgId = getScopedOrgId(req, req.body.org_id);

    // Check if products table has extra columns; if not, fall back to base columns only
    // The base products table has: id, trade_name, org_id, is_active, created_at
    // We attempt an INSERT with the extra fields, ignoring unknown columns gracefully
    // by checking schema first. For simplicity we try and catch column-not-found errors.
    let result;
    try {
      [result] = await pool.execute(
        'INSERT INTO products (trade_name, mah, org_id, family_id, dosage, atc_code, authorization_country, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [trade_name.trim(), mah || null, orgId, family_id || null, dosage || null, atc_code || null, authorization_country || null, is_active !== undefined ? (is_active ? 1 : 0) : 1]
      );
    } catch (colErr) {
      if (colErr.code === 'ER_BAD_FIELD_ERROR') {
        // Columns not yet added to products table — insert base fields only
        [result] = await pool.execute(
          'INSERT INTO products (trade_name, org_id, is_active) VALUES (?, ?, ?)',
          [trade_name.trim(), orgId, is_active !== undefined ? (is_active ? 1 : 0) : 1]
        );
      } else {
        throw colErr;
      }
    }

    await audit(req.user.userId, req.user.email, 'CREATE', 'product', result.insertId, { trade_name, org_id: orgId, family_id, mah, authorization_country });
    const [[created]] = await pool.execute(
      `SELECT p.*, o.name AS org_name, pf.name AS family_name
       FROM products p
       LEFT JOIN organisations o ON p.org_id = o.id
       LEFT JOIN product_families pf ON pf.id = p.family_id
       WHERE p.id = ?`,
      [result.insertId]
    );
    res.status(201).json({ message: 'Product created.', id: result.insertId, product: created });
  } catch (err) {
    console.error('POST /products-full error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/products-full/:id — update product
router.put('/products-full/:id', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.execute(
      hasPlatformAdminScope(req)
        ? 'SELECT id FROM products WHERE id = ?'
        : 'SELECT id FROM products WHERE id = ? AND org_id = ?',
      hasPlatformAdminScope(req) ? [id] : [id, req.user.orgId]
    );
    if (!existing) return res.status(404).json({ error: 'Product not found.' });

    const { trade_name, family_id, mah, dosage, atc_code, authorization_country, is_active } = req.body;
    const orgId = getScopedOrgId(req, req.body.org_id);

    try {
      await pool.execute(
        'UPDATE products SET trade_name = ?, mah = ?, org_id = ?, family_id = ?, dosage = ?, atc_code = ?, authorization_country = ?, is_active = ? WHERE id = ?',
        [trade_name, mah || null, orgId, family_id || null, dosage || null, atc_code || null, authorization_country || null, is_active ? 1 : 0, id]
      );
    } catch (colErr) {
      if (colErr.code === 'ER_BAD_FIELD_ERROR') {
        await pool.execute(
          'UPDATE products SET trade_name = ?, org_id = ?, is_active = ? WHERE id = ?',
          [trade_name, orgId, is_active ? 1 : 0, id]
        );
      } else {
        throw colErr;
      }
    }

    await audit(req.user.userId, req.user.email, 'UPDATE', 'product', Number(id), { trade_name, org_id: orgId, family_id, mah, authorization_country, is_active });
    res.json({ message: 'Product updated.' });
  } catch (err) {
    console.error('PUT /products-full/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/products-full/:id — soft delete
router.delete('/products-full/:id', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.execute('SELECT id, trade_name FROM products WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Product not found.' });

    await pool.execute('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
    await audit(req.user.userId, req.user.email, 'DELETE', 'product', Number(id), { trade_name: existing.trade_name });
    res.json({ message: 'Product deactivated.' });
  } catch (err) {
    console.error('DELETE /products-full/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/products/:id/clone — Clone a product
router.post('/products/:id/clone', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const [rows] = await pool.execute(`SELECT * FROM products WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    const src = rows[0];
    const newName = `${src.trade_name} (Copy)`;
    const orgId = getScopedOrgId(req, src.org_id);
    let result;
    try {
      [result] = await pool.execute(
        `INSERT INTO products (trade_name, mah, org_id, family_id, dosage, atc_code, authorization_country, is_active, created_at) VALUES (?,?,?,?,?,?,?,1,NOW())`,
        [newName, src.mah || null, orgId, src.family_id || null, src.dosage || null, src.atc_code || null, src.authorization_country || null]
      );
    } catch (colErr) {
      if (colErr.code === 'ER_BAD_FIELD_ERROR') {
        [result] = await pool.execute(
          `INSERT INTO products (trade_name, org_id, is_active, created_at) VALUES (?,?,1,NOW())`,
          [newName, orgId]
        );
      } else {
        throw colErr;
      }
    }
    await audit(req.user.userId, req.user.email, 'CLONE', 'product', result.insertId, { source_id: src.id, trade_name: newName });
    res.json({ success: true, id: result.insertId, trade_name: newName });
  } catch (err) {
    console.error('POST /products/:id/clone error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/products/bulk-deactivate — Bulk deactivate
router.patch('/products/bulk-deactivate', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
    const placeholders = ids.map(() => '?').join(',');
    const scopeClause = hasPlatformAdminScope(req) ? '' : ` AND org_id = ?`;
    const params = hasPlatformAdminScope(req) ? [...ids] : [...ids, req.user.orgId];
    await pool.execute(`UPDATE products SET is_active = 0 WHERE id IN (${placeholders})${scopeClause}`, params);
    await audit(req.user.userId, req.user.email, 'BULK_DEACTIVATE', 'product', null, { ids, count: ids.length });
    res.json({ success: true, deactivated: ids.length });
  } catch (err) {
    console.error('PATCH /products/bulk-deactivate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── PRODUCT APPROVALS (F-07) ─────────────────────────────────────────────────

// GET /api/admin/products/:id/approvals
router.get('/products/:id/approvals', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const [approvals] = await pool.execute(
      'SELECT * FROM product_approvals WHERE product_id = ? ORDER BY approval_date DESC',
      [req.params.id]
    );
    res.json({ approvals });
  } catch (err) {
    console.error('GET /products/:id/approvals error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/products/:id/approvals
router.post('/products/:id/approvals', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { approval_number, regulatory_body, approval_date, expiry_date, status } = req.body;
    if (!approval_number) return res.status(400).json({ error: 'approval_number is required.' });

    const [result] = await pool.execute(
      `INSERT INTO product_approvals (product_id, approval_number, regulatory_body, approval_date, expiry_date, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.id, approval_number.trim(), regulatory_body || null,
       approval_date || null, expiry_date || null, status || 'Active']
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'product_approval', result.insertId, { approval_number, product_id: req.params.id });
    const [[created]] = await pool.execute('SELECT * FROM product_approvals WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Approval created.', approval: created });
  } catch (err) {
    console.error('POST /products/:id/approvals error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/products/approvals/:approvalId
router.put('/products/approvals/:approvalId', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { approvalId } = req.params;
    const [[existing]] = await pool.execute('SELECT id FROM product_approvals WHERE id = ?', [approvalId]);
    if (!existing) return res.status(404).json({ error: 'Approval not found.' });

    const { approval_number, regulatory_body, approval_date, expiry_date, status } = req.body;
    if (!approval_number) return res.status(400).json({ error: 'approval_number is required.' });

    await pool.execute(
      `UPDATE product_approvals SET approval_number = ?, regulatory_body = ?, approval_date = ?,
         expiry_date = ?, status = ?, updated_at = NOW() WHERE id = ?`,
      [approval_number.trim(), regulatory_body || null, approval_date || null, expiry_date || null, status || 'Active', approvalId]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'product_approval', Number(approvalId), { approval_number });
    res.json({ message: 'Approval updated.' });
  } catch (err) {
    console.error('PUT /products/approvals/:approvalId error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/products/approvals/:approvalId
router.delete('/products/approvals/:approvalId', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { approvalId } = req.params;
    const [[existing]] = await pool.execute('SELECT id FROM product_approvals WHERE id = ?', [approvalId]);
    if (!existing) return res.status(404).json({ error: 'Approval not found.' });

    await pool.execute('DELETE FROM product_approvals WHERE id = ?', [approvalId]);
    await audit(req.user.userId, req.user.email, 'DELETE', 'product_approval', Number(approvalId), {});
    res.json({ message: 'Approval deleted.' });
  } catch (err) {
    console.error('DELETE /products/approvals/:approvalId error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── PRODUCT COUNTRY AUTHORIZATIONS (F-07) ────────────────────────────────────

// GET /api/admin/products/:id/country-authorizations
router.get('/products/:id/country-authorizations', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const [auths] = await pool.execute(
      'SELECT * FROM product_country_authorizations WHERE product_id = ? ORDER BY country',
      [req.params.id]
    );
    res.json({ authorizations: auths });
  } catch (err) {
    console.error('GET /products/:id/country-authorizations error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/products/:id/country-authorizations
router.post('/products/:id/country-authorizations', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { country, auth_number, auth_date, status } = req.body;
    if (!country) return res.status(400).json({ error: 'country is required.' });

    const [result] = await pool.execute(
      `INSERT INTO product_country_authorizations (product_id, country, auth_number, auth_date, status)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, country.trim(), auth_number || null, auth_date || null, status || 'Active']
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'product_country_auth', result.insertId, { country, product_id: req.params.id });
    const [[created]] = await pool.execute('SELECT * FROM product_country_authorizations WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Country authorization created.', authorization: created });
  } catch (err) {
    console.error('POST /products/:id/country-authorizations error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/products/country-authorizations/:authId
router.put('/products/country-authorizations/:authId', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { authId } = req.params;
    const [[existing]] = await pool.execute('SELECT id FROM product_country_authorizations WHERE id = ?', [authId]);
    if (!existing) return res.status(404).json({ error: 'Authorization not found.' });

    const { country, auth_number, auth_date, status } = req.body;
    if (!country) return res.status(400).json({ error: 'country is required.' });

    await pool.execute(
      `UPDATE product_country_authorizations SET country = ?, auth_number = ?, auth_date = ?,
         status = ?, updated_at = NOW() WHERE id = ?`,
      [country.trim(), auth_number || null, auth_date || null, status || 'Active', authId]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'product_country_auth', Number(authId), { country });
    res.json({ message: 'Authorization updated.' });
  } catch (err) {
    console.error('PUT /products/country-authorizations/:authId error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/products/country-authorizations/:authId
router.delete('/products/country-authorizations/:authId', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { authId } = req.params;
    const [[existing]] = await pool.execute('SELECT id FROM product_country_authorizations WHERE id = ?', [authId]);
    if (!existing) return res.status(404).json({ error: 'Authorization not found.' });

    await pool.execute('DELETE FROM product_country_authorizations WHERE id = ?', [authId]);
    await audit(req.user.userId, req.user.email, 'DELETE', 'product_country_auth', Number(authId), {});
    res.json({ message: 'Authorization deleted.' });
  } catch (err) {
    console.error('DELETE /products/country-authorizations/:authId error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
