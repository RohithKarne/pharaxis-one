'use strict';

/**
 * admin/copyDivision.js — Copy Division
 * Superadmin-only: copies all selected org configuration from one tenant to another.
 * Supports overwrite (delete + re-insert) or skip-existing mode.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');

// ── Category definitions ──────────────────────────────────────────────────────
// Each entry: { label, tables: [{ name, orgField }], remap? }
// remap = function(conn, idMap, sourceOrgId, targetOrgId, overwrite) for FK-remapped tables

const CATEGORIES = {
  picklists: {
    label: 'Picklists',
    description: 'Picklist categories and field values',
    special: true, // handled with FK remapping
  },
  case_form: {
    label: 'Case Form Definition',
    description: 'Case form layout, sections and field visibility',
    tables: ['case_form_definition'],
  },
  workflow: {
    label: 'Workflow Activities',
    description: 'Workflow rules, triggers and activity configurations',
    tables: ['workflow_activities'],
  },
  integrations: {
    label: 'Integrations',
    description: 'External system integrations (API keys, webhook endpoints)',
    tables: ['org_integrations'],
  },
  sites: {
    label: 'Site Configuration',
    description: 'Division/site records and routing rules',
    tables: ['sites', 'inbox_routing_rules'],
  },
  case_numbering: {
    label: 'Case Numbering',
    description: 'Case number format and sequence configuration',
    tables: ['case_number_config'],
  },
  products: {
    label: 'Products',
    description: 'Product dictionary entries',
    tables: ['products'],
  },
  cm_settings: {
    label: 'CM Settings',
    description: 'Content Management organisation settings',
    tables: ['cm_org_settings'],
  },
  exports: {
    label: 'Scheduled Exports',
    description: 'Scheduled export job configurations',
    tables: ['scheduled_export_configs'],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getColumns(conn, tableName) {
  const [cols] = await conn.execute(`DESCRIBE \`${tableName}\``);
  return cols.map(c => c.Field);
}

async function copySimpleTable(conn, tableName, sourceOrgId, targetOrgId, overwrite) {
  if (overwrite) {
    await conn.execute(`DELETE FROM \`${tableName}\` WHERE org_id = ?`, [targetOrgId]);
  }
  const allCols  = await getColumns(conn, tableName);
  const copyCols = allCols.filter(c => c !== 'id');
  const selectList = copyCols.map(c => c === 'org_id' ? `${parseInt(targetOrgId, 10)} AS org_id` : `\`${c}\``).join(', ');
  const insertList = copyCols.map(c => `\`${c}\``).join(', ');
  const [result] = await conn.execute(
    `INSERT IGNORE INTO \`${tableName}\` (${insertList}) SELECT ${selectList} FROM \`${tableName}\` WHERE org_id = ?`,
    [sourceOrgId]
  );
  return result.affectedRows;
}

async function copyPicklists(conn, sourceOrgId, targetOrgId, overwrite) {
  let copied = 0;

  // Step 1: copy picklist_categories, build id map
  if (overwrite) {
    await conn.execute('DELETE FROM picklist_categories WHERE org_id = ?', [targetOrgId]);
  }
  const [cats] = await conn.execute(
    'SELECT * FROM picklist_categories WHERE org_id = ?', [sourceOrgId]
  );
  const catIdMap = {};
  for (const cat of cats) {
    const cols    = Object.keys(cat).filter(k => k !== 'id');
    const values  = cols.map(k => k === 'org_id' ? targetOrgId : cat[k]);
    const [res]   = await conn.execute(
      `INSERT IGNORE INTO picklist_categories (${cols.map(c => `\`${c}\``).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      values
    );
    if (res.insertId) {
      catIdMap[cat.id] = res.insertId;
      copied++;
    } else {
      // Row already existed — look up the existing id
      const [[existing]] = await conn.execute(
        'SELECT id FROM picklist_categories WHERE org_id = ? AND name = ?',
        [targetOrgId, cat.name]
      );
      if (existing) catIdMap[cat.id] = existing.id;
    }
  }

  // Step 2: copy picklist_fields, remapping category_id
  if (overwrite) {
    await conn.execute('DELETE FROM picklist_fields WHERE org_id = ?', [targetOrgId]);
  }
  const [fields] = await conn.execute(
    'SELECT * FROM picklist_fields WHERE org_id = ?', [sourceOrgId]
  );
  for (const field of fields) {
    const newCatId = catIdMap[field.category_id] || field.category_id;
    const cols     = Object.keys(field).filter(k => k !== 'id');
    const values   = cols.map(k => {
      if (k === 'org_id')      return targetOrgId;
      if (k === 'category_id') return newCatId;
      return field[k];
    });
    const [res] = await conn.execute(
      `INSERT IGNORE INTO picklist_fields (${cols.map(c => `\`${c}\``).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      values
    );
    if (res.insertId) copied++;
  }

  return copied;
}

async function previewCategory(key, sourceOrgId) {
  const cat = CATEGORIES[key];
  const counts = {};
  if (cat.special) {
    const [[c1]] = await pool.execute('SELECT COUNT(*) AS n FROM picklist_categories WHERE org_id = ?', [sourceOrgId]);
    const [[c2]] = await pool.execute('SELECT COUNT(*) AS n FROM picklist_fields WHERE org_id = ?', [sourceOrgId]);
    counts['picklist_categories'] = c1.n;
    counts['picklist_fields']     = c2.n;
  } else {
    for (const tbl of cat.tables) {
      try {
        const [[row]] = await pool.execute(`SELECT COUNT(*) AS n FROM \`${tbl}\` WHERE org_id = ?`, [sourceOrgId]);
        counts[tbl] = row.n;
      } catch (_) { counts[tbl] = 0; }
    }
  }
  return counts;
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/admin/copy-division/orgs — list all orgs for source/target selection
router.get('/copy-division/orgs', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const [orgs] = await pool.execute(
      'SELECT id, name FROM organisations ORDER BY name ASC'
    );
    res.json({ orgs });
  } catch (err) {
    console.error('GET /copy-division/orgs error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/copy-division/categories — return category metadata
router.get('/copy-division/categories', authenticate, requireRole('superadmin'), (req, res) => {
  const list = Object.entries(CATEGORIES).map(([key, v]) => ({
    key,
    label: v.label,
    description: v.description,
  }));
  res.json({ categories: list });
});

// POST /api/admin/copy-division/preview — count rows that would be copied
router.post('/copy-division/preview', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { source_org_id, categories } = req.body;
    if (!source_org_id || !Array.isArray(categories) || categories.length === 0) {
      return res.status(400).json({ error: 'source_org_id and categories[] are required.' });
    }
    const preview = {};
    for (const key of categories) {
      if (!CATEGORIES[key]) continue;
      preview[key] = await previewCategory(key, source_org_id);
    }
    res.json({ preview });
  } catch (err) {
    console.error('POST /copy-division/preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/copy-division/execute — run the copy
router.post('/copy-division/execute', authenticate, requireRole('superadmin'), async (req, res) => {
  const { source_org_id, target_org_id, categories, overwrite = false } = req.body;

  if (!source_org_id || !target_org_id) {
    return res.status(400).json({ error: 'source_org_id and target_org_id are required.' });
  }
  if (source_org_id === target_org_id) {
    return res.status(400).json({ error: 'Source and target organisations must be different.' });
  }
  if (!Array.isArray(categories) || categories.length === 0) {
    return res.status(400).json({ error: 'At least one category must be selected.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const results = {};
    for (const key of categories) {
      const cat = CATEGORIES[key];
      if (!cat) continue;
      let copied = 0;
      if (cat.special) {
        copied = await copyPicklists(conn, source_org_id, target_org_id, overwrite);
      } else {
        for (const tbl of cat.tables) {
          try {
            copied += await copySimpleTable(conn, tbl, source_org_id, target_org_id, overwrite);
          } catch (tblErr) {
            console.error(`copySimpleTable ${tbl} error:`, tblErr.message);
          }
        }
      }
      results[key] = copied;
    }

    await conn.commit();

    // Audit log
    try {
      await pool.execute(
        `INSERT INTO audit_logs (user_id, entity, entity_id, action, details)
         VALUES (?, 'org_config_copy', ?, 'COPY_DIVISION', ?)`,
        [req.user.userId, target_org_id,
         JSON.stringify({ source_org_id, target_org_id, categories, overwrite, results })]
      );
    } catch (_) {}

    res.json({ ok: true, results });
  } catch (err) {
    await conn.rollback();
    console.error('POST /copy-division/execute error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
