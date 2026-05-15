'use strict';

/**
 * admin/picklistsTable.js — MIMS Admin > Tables > General (Picklists)
 *
 * Cross-tenant picklist value management. Admin sees all values across
 * all tenants, filtered by Category, Tenant, and Department dropdowns.
 *
 * Data model:
 *   `picklists` rows have (id, category, field_type, value, status, org_id, department, ...)
 *   - category    = high-level grouping (Case, Reporter, AE, Patient, Product, PC, MedDRA, Medical Inquiry)
 *   - field_type  = specific picklist field key (case_status, priority, ae_status, ...)
 *   - value       = the visible value (Critical, Email, ...)
 *   - org_id      = tenant the value belongs to
 *   - department  = optional department tag (new, migration 029)
 *
 * Wired to case form via `field_setup.picklist_type = picklists.field_type`.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');

const ROLE = ['admin', 'superadmin'];

async function audit(userId, action, entityId, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, entity, entity_id, action, details)
       VALUES (?, 'picklist_value', ?, ?, ?)`,
      [userId, entityId, action, JSON.stringify(details)]
    );
  } catch (_) {}
}

function parseJsonField(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

async function writeVersion(connOrPool, picklistId, row, changedBy, changeType) {
  try {
    await connOrPool.execute(
      `INSERT INTO picklist_value_versions
        (picklist_id, value, status, department, description, external_codes, translations, changed_by, change_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        picklistId,
        row?.value || null,
        row?.status || null,
        row?.department || null,
        row?.description || null,
        row?.external_codes ? JSON.stringify(parseJsonField(row.external_codes, row.external_codes)) : null,
        row?.translations ? JSON.stringify(parseJsonField(row.translations, row.translations)) : null,
        changedBy || null,
        changeType,
      ]
    );
  } catch (_) {}
}

function normalizeValueRow(row) {
  return {
    ...row,
    external_codes: parseJsonField(row.external_codes, {}),
    translations: parseJsonField(row.translations, {}),
  };
}

async function getWhereUsed(valueRow) {
  const fieldType = String(valueRow.field_type || '').trim();
  const value = String(valueRow.value || '');
  if (!fieldType || !value) return { total: 0, samples: [] };
  const candidateNames = new Set([
    fieldType,
    fieldType.toLowerCase(),
    fieldType.replace(/\s+/g, '_').toLowerCase(),
    fieldType.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase(),
  ]);
  const [cols] = await pool.execute(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND data_type IN ('varchar','char','text','mediumtext','longtext','enum')
        AND table_name NOT IN ('picklists','picklist_value_versions')
      ORDER BY table_name, ordinal_position`
  );
  const matches = cols.filter((col) => candidateNames.has(String(col.column_name).toLowerCase()));
  let total = 0;
  const samples = [];
  for (const col of matches) {
    const table = col.table_name;
    const column = col.column_name;
    const idColumn = table.startsWith('case_') && table !== 'cases' ? 'case_id' : 'id';
    try {
      const [[countRow]] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM \`${table}\` WHERE \`${column}\` = ?`,
        [value]
      );
      const cnt = Number(countRow?.cnt || 0);
      total += cnt;
      if (cnt > 0 && samples.length < 5) {
        const sampleLimit = Math.max(1, 5 - samples.length);
        const [rows] = await pool.execute(
          `SELECT \`${idColumn}\` AS case_id FROM \`${table}\` WHERE \`${column}\` = ? LIMIT ${sampleLimit}`,
          [value]
        );
        rows.forEach((r) => samples.push({ table, column, case_id: r.case_id }));
      }
    } catch (_) {}
  }
  return { total, samples };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/picklists-table/categories
// Returns the 8 distinct categories (with row counts).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/picklists-table/categories', authenticate, requireRole(...ROLE), async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT category, COUNT(*) AS value_count
         FROM picklists
        WHERE category IS NOT NULL AND category != ''
        GROUP BY category
        ORDER BY category ASC`
    );
    res.json({ categories: rows });
  } catch (err) {
    console.error('GET /picklists-table/categories error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/picklists-table/fields
// Returns distinct field_type values, optionally filtered by category.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/picklists-table/fields', authenticate, requireRole(...ROLE), async (req, res) => {
  const { category } = req.query;
  try {
    const sql = category
      ? `SELECT DISTINCT category, field_type, COUNT(*) AS value_count
           FROM picklists WHERE category = ?
           GROUP BY category, field_type ORDER BY field_type ASC`
      : `SELECT DISTINCT category, field_type, COUNT(*) AS value_count
           FROM picklists
           GROUP BY category, field_type ORDER BY category, field_type ASC`;
    const params = category ? [category] : [];
    const [rows] = await pool.execute(sql, params);
    res.json({ fields: rows });
  } catch (err) {
    console.error('GET /picklists-table/fields error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/picklists-table/departments
// Returns distinct non-null departments for the filter dropdown.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/picklists-table/departments', authenticate, requireRole(...ROLE), async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT department
         FROM picklists
        WHERE department IS NOT NULL AND department != ''
        ORDER BY department ASC`
    );
    res.json({ departments: rows.map(r => r.department) });
  } catch (err) {
    console.error('GET /picklists-table/departments error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/picklists-table/tenants
// Returns the org list for the Tenant filter dropdown.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/picklists-table/tenants', authenticate, requireRole(...ROLE), async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, name FROM organisations WHERE is_active = 1 ORDER BY name ASC`
    );
    res.json({ tenants: rows });
  } catch (err) {
    console.error('GET /picklists-table/tenants error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/picklists-table/values
// Returns picklist values with optional filters: category, field_type, tenant_id, department, search.
// Pagination: limit/offset.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/picklists-table/values', authenticate, requireRole(...ROLE), async (req, res) => {
  const { category, field_type, tenant_id, department, search, limit = 100, offset = 0 } = req.query;

  const where = [];
  const params = [];
  if (category)   { where.push('p.category = ?');    params.push(category); }
  if (field_type) { where.push('p.field_type = ?');  params.push(field_type); }
  if (tenant_id)  { where.push('p.org_id = ?');      params.push(parseInt(tenant_id, 10)); }
  if (department) { where.push('p.department = ?');  params.push(department); }
  if (search)     { where.push('p.value LIKE ?');    params.push(`%${search}%`); }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const [rows] = await pool.execute(
      `SELECT p.id, p.category, p.field_type, p.value, p.status, p.org_id,
              p.department, p.description, p.sort_order, p.external_codes,
              p.translations, p.parent_value_id, pp.value AS parent_value,
              o.name AS tenant_name,
              p.created_at, p.updated_at
         FROM picklists p
    LEFT JOIN picklists pp ON pp.id = p.parent_value_id
    LEFT JOIN organisations o ON o.id = p.org_id
         ${whereSql}
         ORDER BY p.category, p.field_type, p.sort_order ASC, p.value ASC, o.name
         LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}`,
      params
    );
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total FROM picklists p ${whereSql}`,
      params
    );
    res.json({ values: rows.map(normalizeValueRow), total });
  } catch (err) {
    console.error('GET /picklists-table/values error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/picklists-table/values
// Create a new picklist value.
// Body: { category, field_type, value, org_id|'all', department?, status? }
// If org_id === 'all', creates one row per active tenant.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/picklists-table/values', authenticate, requireRole(...ROLE), async (req, res) => {
  const { category, field_type, value, org_id, department, status = 'Active', description, external_codes, translations, parent_value_id, sort_order = 0 } = req.body;

  if (!category?.trim())   return res.status(400).json({ error: 'Category is required.' });
  if (!field_type?.trim()) return res.status(400).json({ error: 'Field type is required.' });
  if (!value?.trim())      return res.status(400).json({ error: 'Value is required.' });
  if (org_id == null)      return res.status(400).json({ error: 'Tenant is required (use "all" to apply to every tenant).' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let targetOrgIds = [];
    if (org_id === 'all' || org_id === '*') {
      const [orgs] = await conn.execute('SELECT id FROM organisations WHERE is_active = 1');
      targetOrgIds = orgs.map(o => o.id);
    } else {
      targetOrgIds = [parseInt(org_id, 10)];
    }

    const createdIds = [];
    for (const oid of targetOrgIds) {
      // De-dup: skip if (category, field_type, value, org_id) already exists
      const [[dup]] = await conn.execute(
        `SELECT id FROM picklists
          WHERE category = ? AND field_type = ? AND value = ? AND org_id = ?
          LIMIT 1`,
        [category.trim(), field_type.trim(), value.trim(), oid]
      );
      if (dup) continue;

      const [result] = await conn.execute(
        `INSERT INTO picklists
          (name, category, field_type, value, status, org_id, department, description, external_codes, translations, parent_value_id, sort_order, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [value.trim(), category.trim(), field_type.trim(), value.trim(),
         status, oid, department?.trim() || null, description?.trim() || null,
         external_codes ? JSON.stringify(external_codes) : null,
         translations ? JSON.stringify(translations) : null,
         parent_value_id ? Number(parent_value_id) : null,
         Number(sort_order || 0),
         req.user.userId]
      );
      createdIds.push(result.insertId);
      await writeVersion(conn, result.insertId, {
        value: value.trim(),
        status,
        department: department?.trim() || null,
        description: description?.trim() || null,
        external_codes,
        translations,
      }, req.user.userId, 'created');
    }

    await conn.commit();
    await audit(req.user.userId, 'CREATE_PICKLIST_VALUES', null, {
      category, field_type, value, org_id, created_count: createdIds.length, target_tenants: targetOrgIds.length,
    });
    res.status(201).json({ ok: true, created_ids: createdIds, created_count: createdIds.length });
  } catch (err) {
    await conn.rollback();
    console.error('POST /picklists-table/values error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/picklists-table/values/:id
// Update value name, department, status (active/inactive).
// ─────────────────────────────────────────────────────────────────────────────
router.put('/picklists-table/values/:id(\\d+)', authenticate, requireRole(...ROLE), async (req, res) => {
  const { value, department, status, description, external_codes, translations, parent_value_id, sort_order } = req.body;
  try {
    const [[existing]] = await pool.execute('SELECT * FROM picklists WHERE id = ? LIMIT 1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Picklist value not found.' });

    await pool.execute(
      `UPDATE picklists
          SET value      = COALESCE(?, value),
              name       = COALESCE(?, name),
              department = COALESCE(?, department),
              status     = COALESCE(?, status),
              description = COALESCE(?, description),
              external_codes = COALESCE(?, external_codes),
              translations = COALESCE(?, translations),
              parent_value_id = ?,
              sort_order = COALESCE(?, sort_order),
              updated_at = NOW()
        WHERE id = ?`,
      [
        value !== undefined ? value : null,
        value !== undefined ? value : null,
        department !== undefined ? department : null,
        status !== undefined ? status : null,
        description !== undefined ? description : null,
        external_codes !== undefined ? JSON.stringify(external_codes || {}) : null,
        translations !== undefined ? JSON.stringify(translations || {}) : null,
        parent_value_id === undefined ? existing.parent_value_id : (parent_value_id ? Number(parent_value_id) : null),
        sort_order !== undefined ? Number(sort_order || 0) : null,
        req.params.id,
      ]
    );
    const [[updated]] = await pool.execute('SELECT * FROM picklists WHERE id = ?', [req.params.id]);
    const changeType = status && existing.status !== status
      ? (status === 'Active' ? 'reactivated' : 'deactivated')
      : 'updated';
    await writeVersion(pool, req.params.id, updated, req.user.userId, changeType);
    await audit(req.user.userId, 'UPDATE_PICKLIST_VALUE', req.params.id, { value, department, status, description, external_codes, translations, parent_value_id, sort_order });
    res.json({ ok: true, value: normalizeValueRow(updated) });
  } catch (err) {
    console.error('PUT /picklists-table/values/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/picklists-table/values/reorder', authenticate, requireRole(...ROLE), async (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : (req.body?.items || []);
  if (!rows.length) return res.status(400).json({ error: 'Reorder body is required.' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const row of rows) {
      if (!row?.id) continue;
      await conn.execute('UPDATE picklists SET sort_order = ?, updated_at = NOW() WHERE id = ?', [Number(row.sort_order || 0), row.id]);
    }
    await conn.commit();
    await audit(req.user.userId, 'REORDER_PICKLIST_VALUES', null, { count: rows.length });
    res.json({ ok: true, updated: rows.length });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally { conn.release(); }
});

router.post('/picklists-table/values/bulk-status', authenticate, requireRole(...ROLE), async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  const status = req.body?.status;
  if (!ids.length || !['Active', 'Inactive'].includes(status)) return res.status(400).json({ error: 'ids and valid status are required.' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const placeholders = ids.map(() => '?').join(',');
    const [existingRows] = await conn.execute(`SELECT * FROM picklists WHERE id IN (${placeholders})`, ids);
    await conn.execute(`UPDATE picklists SET status = ?, updated_at = NOW() WHERE id IN (${placeholders})`, [status, ...ids]);
    for (const row of existingRows) await writeVersion(conn, row.id, { ...row, status }, req.user.userId, status === 'Active' ? 'reactivated' : 'deactivated');
    await conn.commit();
    await audit(req.user.userId, 'BULK_STATUS_PICKLIST_VALUES', null, { ids, status });
    res.json({ ok: true, updated: ids.length });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally { conn.release(); }
});

router.get('/picklists-table/values/:id/where-used', authenticate, requireRole(...ROLE), async (req, res) => {
  try {
    const [[row]] = await pool.execute('SELECT * FROM picklists WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Picklist value not found.' });
    res.json(await getWhereUsed(row));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/picklists-table/values/:id/history', authenticate, requireRole(...ROLE), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT v.*, u.name AS changed_by_name
       FROM picklist_value_versions v
       LEFT JOIN users u ON u.id = v.changed_by
       WHERE v.picklist_id = ?
       ORDER BY v.changed_at DESC, v.id DESC`,
      [req.params.id]
    );
    res.json({ history: rows.map(normalizeValueRow) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/picklists-table/values/:id
// Hard-delete a picklist value (use with care — referenced rows in cases stay,
// but the value will no longer appear in dropdowns).
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/picklists-table/values/:id(\\d+)', authenticate, requireRole(...ROLE), async (req, res) => {
  try {
    const [[existing]] = await pool.execute('SELECT id, value, category, field_type, org_id FROM picklists WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Picklist value not found.' });

    const usage = await getWhereUsed(existing);
    if (usage.total > 0 && req.query.force !== '1') {
      return res.status(409).json({ error: 'Picklist value is in use.', where_used: usage });
    }
    await writeVersion(pool, req.params.id, existing, req.user.userId, 'deleted');
    await pool.execute('DELETE FROM picklists WHERE id = ?', [req.params.id]);
    await audit(req.user.userId, 'DELETE_PICKLIST_VALUE', req.params.id, existing);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /picklists-table/values/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── CSV helpers ──────────────────────────────────────────────────────────────
function csvEscape(field) {
  if (field == null) return '';
  const s = String(field);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsvRow(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cur += ch; }
    } else {
      if (ch === ',') { out.push(cur); cur = ''; }
      else if (ch === '"' && cur === '') { inQ = true; }
      else { cur += ch; }
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function parseCsv(text) {
  // Split on newlines but respect quoted multilines (simple heuristic).
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim().length);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseCsvRow(lines[0]).map(h => h.toLowerCase());
  const rows = lines.slice(1).map(l => {
    const cells = parseCsvRow(l);
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
  return { headers, rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/picklists-table/export
// Returns picklist values as a CSV download. Honors the same filters as the list.
// Columns: Category, Field, Value, Tenant, Department, Status
// ─────────────────────────────────────────────────────────────────────────────
router.get('/picklists-table/export', authenticate, requireRole(...ROLE), async (req, res) => {
  const { category, field_type, tenant_id, department, search } = req.query;

  const where = [];
  const params = [];
  if (category)   { where.push('p.category = ?');    params.push(category); }
  if (field_type) { where.push('p.field_type = ?');  params.push(field_type); }
  if (tenant_id)  { where.push('p.org_id = ?');      params.push(parseInt(tenant_id, 10)); }
  if (department) { where.push('p.department = ?');  params.push(department); }
  if (search)     { where.push('p.value LIKE ?');    params.push(`%${search}%`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const [rows] = await pool.execute(
      `SELECT p.category, p.field_type, p.value, p.status, p.department,
              COALESCE(o.name, '') AS tenant_name
         FROM picklists p
    LEFT JOIN organisations o ON o.id = p.org_id
         ${whereSql}
         ORDER BY p.category, p.field_type, o.name, p.value`,
      params
    );

    const header = ['Category', 'Field', 'Value', 'Tenant', 'Department', 'Status'].join(',');
    const body = rows.map(r => [
      csvEscape(r.category),
      csvEscape(r.field_type),
      csvEscape(r.value),
      csvEscape(r.tenant_name),
      csvEscape(r.department || ''),
      csvEscape(r.status || 'Active'),
    ].join(',')).join('\n');

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="picklists-export-${stamp}.csv"`);
    res.send(`${header}\n${body}\n`);
  } catch (err) {
    console.error('GET /picklists-table/export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/picklists-table/import
// Accepts CSV in body (`csv` string). Modes:
//   - mode = 'preview' → returns parsed rows + per-row validation status, no writes
//   - mode = 'commit'  → inserts new + updates existing rows, returns summary
// Required columns: Category, Field, Value, Tenant.
// Optional: Department, Status (defaults Active).
// ─────────────────────────────────────────────────────────────────────────────
router.post('/picklists-table/import', authenticate, requireRole(...ROLE), async (req, res) => {
  const { csv = '', mode = 'preview' } = req.body || {};
  if (!csv.trim()) return res.status(400).json({ error: 'CSV body is required.' });

  try {
    const { headers, rows } = parseCsv(csv);
    const required = ['category', 'field', 'value', 'tenant'];
    const missingCols = required.filter(c => !headers.includes(c));
    if (missingCols.length) {
      return res.status(400).json({ error: `Missing required columns: ${missingCols.join(', ')}` });
    }

    // Tenant lookup
    const [orgs] = await pool.execute('SELECT id, name FROM organisations');
    const tenantByName = new Map(orgs.map(o => [o.name.toLowerCase(), o.id]));

    const parsed = rows.map((row, idx) => {
      const tenant = (row.tenant || '').trim();
      const orgId = tenant.toLowerCase() === 'all tenants' || tenant === '*'
        ? 'all'
        : tenantByName.get(tenant.toLowerCase());
      const errors = [];
      if (!row.category?.trim()) errors.push('Category empty');
      if (!row.field?.trim())    errors.push('Field empty');
      if (!row.value?.trim())    errors.push('Value empty');
      if (!tenant)               errors.push('Tenant empty');
      else if (orgId === undefined) errors.push(`Tenant "${tenant}" not found`);

      return {
        row_index: idx + 2, // header is line 1
        category: row.category?.trim(),
        field_type: row.field?.trim(),
        value: row.value?.trim(),
        tenant,
        org_id: orgId,
        department: row.department?.trim() || null,
        status: row.status?.trim() || 'Active',
        valid: errors.length === 0,
        errors,
      };
    });

    if (mode === 'preview') {
      return res.json({
        preview: parsed,
        total: parsed.length,
        valid: parsed.filter(r => r.valid).length,
        invalid: parsed.filter(r => !r.valid).length,
      });
    }

    // commit
    const conn = await pool.getConnection();
    let inserted = 0, updated = 0, skipped = 0;
    const failures = [];
    try {
      await conn.beginTransaction();
      for (const r of parsed) {
        if (!r.valid) { skipped++; continue; }
        const orgIds = r.org_id === 'all'
          ? orgs.map(o => o.id)
          : [r.org_id];

        for (const oid of orgIds) {
          const [[existing]] = await conn.execute(
            `SELECT id FROM picklists WHERE category = ? AND field_type = ? AND value = ? AND org_id = ? LIMIT 1`,
            [r.category, r.field_type, r.value, oid]
          );
          if (existing) {
            await conn.execute(
              `UPDATE picklists SET department = ?, status = ?, updated_at = NOW() WHERE id = ?`,
              [r.department, r.status, existing.id]
            );
            updated++;
          } else {
            await conn.execute(
              `INSERT INTO picklists (name, category, field_type, value, status, org_id, department, created_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [r.value, r.category, r.field_type, r.value, r.status, oid, r.department, req.user.userId]
            );
            inserted++;
          }
        }
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      failures.push(err.message);
    } finally {
      conn.release();
    }

    await audit(req.user.userId, 'IMPORT_PICKLISTS_CSV', null, {
      inserted, updated, skipped, total: parsed.length,
    });
    res.json({ ok: true, inserted, updated, skipped, failures, total: parsed.length });
  } catch (err) {
    console.error('POST /picklists-table/import error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SCHEMA-LEVEL CRUD — picklist categories + fields per tenant
// (folded in from the legacy "Picklist Definitions" screen)
// ═════════════════════════════════════════════════════════════════════════════

// GET /api/admin/picklists-table/schema/categories?tenant_id=
router.get('/picklists-table/schema/categories', authenticate, requireRole(...ROLE), async (req, res) => {
  const tenantId = parseInt(req.query.tenant_id, 10);
  if (!Number.isFinite(tenantId)) return res.status(400).json({ error: 'tenant_id is required.' });
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, is_active, sort_order, created_at, updated_at
         FROM picklist_categories WHERE org_id = ? ORDER BY name ASC`,
      [tenantId]
    );
    res.json({ categories: rows });
  } catch (err) {
    console.error('GET schema/categories error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/picklists-table/schema/categories — body {tenant_id, name}
router.post('/picklists-table/schema/categories', authenticate, requireRole(...ROLE), async (req, res) => {
  const { tenant_id, name } = req.body || {};
  if (!tenant_id || !name?.trim()) return res.status(400).json({ error: 'tenant_id and name are required.' });
  try {
    const [r] = await pool.execute(
      `INSERT INTO picklist_categories (org_id, name, is_active, sort_order, created_by)
       VALUES (?, ?, 1, 0, ?)`,
      [tenant_id, name.trim(), req.user.userId]
    );
    await audit(req.user.userId, 'CREATE_PICKLIST_CATEGORY', r.insertId, { tenant_id, name });
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A category with this name already exists for this tenant.' });
    console.error('POST schema/categories error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/picklists-table/schema/categories/:id — body {name?, is_active?}
router.put('/picklists-table/schema/categories/:id', authenticate, requireRole(...ROLE), async (req, res) => {
  const { name, is_active } = req.body || {};
  try {
    await pool.execute(
      `UPDATE picklist_categories
          SET name      = COALESCE(?, name),
              is_active = COALESCE(?, is_active),
              updated_at = NOW()
        WHERE id = ?`,
      [name?.trim() ?? null, is_active != null ? (is_active ? 1 : 0) : null, req.params.id]
    );
    await audit(req.user.userId, 'UPDATE_PICKLIST_CATEGORY', req.params.id, { name, is_active });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT schema/categories/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/picklists-table/schema/categories/:id — soft delete (is_active = 0)
router.delete('/picklists-table/schema/categories/:id', authenticate, requireRole(...ROLE), async (req, res) => {
  try {
    await pool.execute('UPDATE picklist_categories SET is_active = 0, updated_at = NOW() WHERE id = ?', [req.params.id]);
    await audit(req.user.userId, 'DEACTIVATE_PICKLIST_CATEGORY', req.params.id, {});
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE schema/categories/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/picklists-table/schema/fields?tenant_id=&category_id=
router.get('/picklists-table/schema/fields', authenticate, requireRole(...ROLE), async (req, res) => {
  const tenantId = parseInt(req.query.tenant_id, 10);
  const categoryId = req.query.category_id ? parseInt(req.query.category_id, 10) : null;
  if (!Number.isFinite(tenantId)) return res.status(400).json({ error: 'tenant_id is required.' });
  try {
    const params = [tenantId];
    let where = 'WHERE pf.org_id = ?';
    if (categoryId) { where += ' AND pf.category_id = ?'; params.push(categoryId); }
    const [rows] = await pool.execute(
      `SELECT pf.id, pf.category_id, pf.name, pf.legacy_field_type AS field_type,
              pf.is_active, pf.sort_order, pc.name AS category_name
         FROM picklist_fields pf
    LEFT JOIN picklist_categories pc ON pc.id = pf.category_id
        ${where}
        ORDER BY pc.name, pf.name`,
      params
    );
    res.json({ fields: rows });
  } catch (err) {
    console.error('GET schema/fields error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/picklists-table/schema/fields — body {tenant_id, category_id, name, field_type?}
router.post('/picklists-table/schema/fields', authenticate, requireRole(...ROLE), async (req, res) => {
  const { tenant_id, category_id, name, field_type } = req.body || {};
  if (!tenant_id || !category_id || !name?.trim()) {
    return res.status(400).json({ error: 'tenant_id, category_id, and name are required.' });
  }
  try {
    const [r] = await pool.execute(
      `INSERT INTO picklist_fields (org_id, category_id, name, legacy_field_type, is_active, sort_order, created_by)
       VALUES (?, ?, ?, ?, 1, 0, ?)`,
      [tenant_id, category_id, name.trim(), field_type || name.trim().toLowerCase().replace(/\s+/g, '_'), req.user.userId]
    );
    await audit(req.user.userId, 'CREATE_PICKLIST_FIELD', r.insertId, { tenant_id, category_id, name });
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A field with this name already exists under this category.' });
    console.error('POST schema/fields error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/picklists-table/schema/fields/:id — body {name?, is_active?}
router.put('/picklists-table/schema/fields/:id', authenticate, requireRole(...ROLE), async (req, res) => {
  const { name, is_active } = req.body || {};
  try {
    await pool.execute(
      `UPDATE picklist_fields
          SET name      = COALESCE(?, name),
              is_active = COALESCE(?, is_active),
              updated_at = NOW()
        WHERE id = ?`,
      [name?.trim() ?? null, is_active != null ? (is_active ? 1 : 0) : null, req.params.id]
    );
    await audit(req.user.userId, 'UPDATE_PICKLIST_FIELD', req.params.id, { name, is_active });
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT schema/fields/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/picklists-table/schema/fields/:id — soft delete
router.delete('/picklists-table/schema/fields/:id', authenticate, requireRole(...ROLE), async (req, res) => {
  try {
    await pool.execute('UPDATE picklist_fields SET is_active = 0, updated_at = NOW() WHERE id = ?', [req.params.id]);
    await audit(req.user.userId, 'DEACTIVATE_PICKLIST_FIELD', req.params.id, {});
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE schema/fields/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
