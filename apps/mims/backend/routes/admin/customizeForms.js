'use strict';

/**
 * admin/customizeForms.js — MIMS Admin > System > Setup > Customize Forms
 *
 * Read/write API for the Customize Forms screen.
 * Drives `field_setup` (is_required, is_disabled per field) and
 * `case_form_definition` (is_visible per section) per tenant.
 *
 * Placeholder items live in field_setup under section '__customize_placeholder__'.
 *
 * All routes: admin + superadmin. No requireOrg — admin is global.
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { CATALOG, CATEGORIES_LIST, PLACEHOLDER_SECTION, getCategory } = require('../../catalogs/customizeFormsCatalog');

// ── Helpers ──────────────────────────────────────────────────────────────────
async function audit(userId, action, orgId, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, entity, entity_id, action, details)
       VALUES (?, 'customize_forms', ?, ?, ?)`,
      [userId, orgId, action, JSON.stringify(details)]
    );
  } catch (_) {}
}

function flattenCatalog(cat) {
  return [...cat.sections, ...cat.fields];
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/customize-forms/categories — list of left-pane categories
// ─────────────────────────────────────────────────────────────────────────────
router.get('/customize-forms/categories', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  res.json({ categories: CATEGORIES_LIST });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/customize-forms/catalog/:category — full item list (static)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/customize-forms/catalog/:category', authenticate, requireRole('admin', 'superadmin'), (req, res) => {
  const cat = getCategory(req.params.category);
  if (!cat) return res.status(404).json({ error: 'Unknown category.' });
  res.json({
    category:  cat.category,
    label:     cat.label,
    sections:  cat.sections,
    fields:    cat.fields,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/customize-forms/:orgId/:category — saved state for tenant
// Returns per-item { key, is_required, is_disabled } merged with catalog.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/customize-forms/:orgId/:category', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const cat = getCategory(req.params.category);
  if (!cat) return res.status(404).json({ error: 'Unknown category.' });
  const orgId = parseInt(req.params.orgId, 10);
  if (!Number.isFinite(orgId)) return res.status(400).json({ error: 'Invalid orgId.' });

  try {
    // Real sections — read is_visible from case_form_definition
    const realSectionItems = cat.sections.filter(s => !s.is_placeholder);
    const sectionStates = {};
    if (realSectionItems.length) {
      const caseTypes = [...new Set(realSectionItems.map(s => s.case_type))];
      for (const ct of caseTypes) {
        const [rows] = await pool.execute(
          `SELECT section_name, is_visible
             FROM case_form_definition
            WHERE org_id = ? AND case_type = ?`,
          [orgId, ct]
        );
        for (const r of rows) sectionStates[`${ct}|${r.section_name}`] = r.is_visible;
      }
    }

    // Real fields — read is_required, is_disabled, sort_order, custom_label from field_setup
    const realFieldItems = cat.fields.filter(f => !f.is_placeholder);
    const fieldStates = {};
    if (realFieldItems.length) {
      const sectionNames = [...new Set(realFieldItems.map(f => f.db_section).filter(Boolean))];
      if (sectionNames.length) {
        const placeholders = sectionNames.map(() => '?').join(',');
        const [rows] = await pool.execute(
          `SELECT section_name, field_name, is_required, is_disabled, sort_order, custom_label
             FROM field_setup
            WHERE org_id = ? AND section_name IN (${placeholders})`,
          [orgId, ...sectionNames]
        );
        for (const r of rows) fieldStates[`${r.section_name}|${r.field_name}`] = {
          is_required:  !!r.is_required,
          is_disabled:  !!r.is_disabled,
          sort_order:   r.sort_order ?? 0,
          custom_label: r.custom_label || '',
        };
      }
    }

    // Placeholder items — read from field_setup with section_name = '__customize_placeholder__'
    const [phRows] = await pool.execute(
      `SELECT field_name, is_required, is_disabled
         FROM field_setup
        WHERE org_id = ? AND section_name = ?`,
      [orgId, PLACEHOLDER_SECTION]
    );
    const phStates = {};
    for (const r of phRows) phStates[r.field_name] = { is_required: !!r.is_required, is_disabled: !!r.is_disabled };

    // Build response items
    const sections = cat.sections.map(s => {
      let is_disabled = false;
      if (s.is_placeholder) {
        is_disabled = phStates[s.key]?.is_disabled || false;
      } else {
        const vis = sectionStates[`${s.case_type}|${s.db_section}`];
        // Default visible if no row exists
        is_disabled = vis === 0;
      }
      return { ...s, is_required: false, is_disabled };
    });

    const fields = cat.fields.map(f => {
      let st = { is_required: false, is_disabled: false, sort_order: 0, custom_label: '' };
      if (f.is_placeholder) {
        st = { ...st, ...(phStates[f.key] || {}) };
      } else if (f.db_section && f.db_field) {
        st = { ...st, ...(fieldStates[`${f.db_section}|${f.db_field}`] || {}) };
      }
      return {
        ...f,
        is_required:  st.is_required,
        is_disabled:  st.is_disabled,
        sort_order:   st.sort_order || 0,
        custom_label: st.custom_label || '',
      };
    });
    // Stable sort by saved sort_order (ascending), preserve catalog order for ties
    fields.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    res.json({ category: cat.category, label: cat.label, sections, fields });
  } catch (err) {
    console.error('GET /customize-forms/:orgId/:category error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/admin/customize-forms/:orgId/:category — bulk save
// Body: { items: [{ key, is_required, is_disabled, sort_order?, custom_label? }] }
// sort_order + custom_label apply only to real fields (db_section + db_field).
// ─────────────────────────────────────────────────────────────────────────────
router.put('/customize-forms/:orgId/:category', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  const cat = getCategory(req.params.category);
  if (!cat) return res.status(404).json({ error: 'Unknown category.' });
  const orgId = parseInt(req.params.orgId, 10);
  if (!Number.isFinite(orgId)) return res.status(400).json({ error: 'Invalid orgId.' });

  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return res.status(400).json({ error: 'No items to save.' });

  // Build key lookup
  const catalogMap = {};
  for (const item of flattenCatalog(cat)) catalogMap[item.key] = item;

  // Validate
  for (const it of items) {
    const def = catalogMap[it.key];
    if (!def) return res.status(400).json({ error: `Unknown item key: ${it.key}` });
    if (it.is_required && it.is_disabled) {
      return res.status(400).json({ error: `Item "${def.label}": Required and Disabled cannot both be set.` });
    }
    if (it.is_required && !def.supports_required) {
      return res.status(400).json({ error: `Item "${def.label}" does not support Required.` });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const it of items) {
      const def = catalogMap[it.key];
      const isRequired = it.is_required ? 1 : 0;
      const isDisabled = it.is_disabled ? 1 : 0;

      if (def.is_placeholder) {
        // All placeholders persisted under the placeholder section, field_name = catalog key
        await conn.execute(
          `INSERT INTO field_setup
             (section_name, field_name, field_type, is_required, is_disabled, org_id, sort_order)
           VALUES (?, ?, 'placeholder', ?, ?, ?, 0)
           ON DUPLICATE KEY UPDATE is_required = VALUES(is_required), is_disabled = VALUES(is_disabled)`,
          [PLACEHOLDER_SECTION, def.key, isRequired, isDisabled, orgId]
        );
      } else if (def.type === 'section') {
        // Real section → write to case_form_definition.is_visible (inverted from disabled)
        const isVisible = isDisabled ? 0 : 1;
        const caseTypes = def.case_type === 'ALL' ? ['AE', 'MI', 'PC'] : [def.case_type];
        for (const ct of caseTypes) {
          await conn.execute(
            `INSERT INTO case_form_definition
               (org_id, case_type, section_name, is_visible)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE is_visible = VALUES(is_visible)`,
            [orgId, ct, def.db_section, isVisible]
          );
        }
      } else if (def.type === 'field' && def.db_section && def.db_field) {
        // Real field → write to field_setup (with optional sort_order + custom_label)
        const sortOrder   = Number.isFinite(parseInt(it.sort_order, 10)) ? parseInt(it.sort_order, 10) : 0;
        const customLabel = typeof it.custom_label === 'string' ? it.custom_label.trim() || null : null;
        await conn.execute(
          `INSERT INTO field_setup
             (section_name, field_name, field_type, is_required, is_disabled, org_id, sort_order, custom_label)
           VALUES (?, ?, 'text', ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             is_required  = VALUES(is_required),
             is_disabled  = VALUES(is_disabled),
             sort_order   = VALUES(sort_order),
             custom_label = VALUES(custom_label)`,
          [def.db_section, def.db_field, isRequired, isDisabled, orgId, sortOrder, customLabel]
        );
      }
    }

    await conn.commit();
    await audit(req.user.userId, 'SAVE_CUSTOMIZE_FORMS', orgId, { category: cat.category, item_count: items.length });
    res.json({ ok: true, saved: items.length });
  } catch (err) {
    await conn.rollback();
    console.error('PUT /customize-forms/:orgId/:category error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
