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
router.get('/customize-forms/categories', authenticate, requireRole('admin', 'platform_admin'), (req, res) => {
  res.json({ categories: CATEGORIES_LIST });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/customize-forms/catalog/:category — full item list (static)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/customize-forms/catalog/:category', authenticate, requireRole('admin', 'platform_admin'), (req, res) => {
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
router.get('/customize-forms/:orgId/:category', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
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
          `SELECT section_name, field_name, field_type, is_required, is_disabled, sort_order,
                  custom_label, help_text, max_length, default_value, picklist_type, lookup_target,
                  is_sensitive, masking_pattern,
                  case_type_scope, display_tab
             FROM field_setup
            WHERE org_id = ? AND section_name IN (${placeholders})`,
          [orgId, ...sectionNames]
        );
        for (const r of rows) fieldStates[`${r.section_name}|${r.field_name}`] = {
          is_required:    !!r.is_required,
          is_disabled:    !!r.is_disabled,
          sort_order:     r.sort_order ?? 0,
          custom_label:   r.custom_label || '',
          field_type:     r.field_type || 'text',
          help_text:      r.help_text || '',
          max_length:     r.max_length ?? null,
          default_value:  r.default_value || '',
          picklist_type:  r.picklist_type || '',
          lookup_target:  r.lookup_target || '',
          is_sensitive:   !!r.is_sensitive,
          masking_pattern: r.masking_pattern || 'partial',
          case_type_scope: r.case_type_scope || 'shared',
          display_tab:     r.display_tab || null,
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
      let st = {
        is_required: false, is_disabled: false, sort_order: 0, custom_label: '',
        field_type: 'text', help_text: '', max_length: null, default_value: '',
        picklist_type: '', lookup_target: '', is_sensitive: false, masking_pattern: 'partial',
        case_type_scope: 'shared', display_tab: null,
      };
      if (f.is_placeholder) {
        st = { ...st, ...(phStates[f.key] || {}) };
      } else if (f.db_section && f.db_field) {
        st = { ...st, ...(fieldStates[`${f.db_section}|${f.db_field}`] || {}) };
      }
      return {
        ...f,
        is_required:    st.is_required,
        is_disabled:    st.is_disabled,
        sort_order:     st.sort_order || 0,
        custom_label:   st.custom_label || '',
        field_type:     st.field_type || 'text',
        help_text:      st.help_text || '',
        max_length:     st.max_length ?? null,
        default_value:  st.default_value || '',
        picklist_type:  st.picklist_type || '',
        lookup_target:  st.lookup_target || '',
        is_sensitive:   !!st.is_sensitive,
        masking_pattern: st.masking_pattern || 'partial',
        case_type_scope: st.case_type_scope || 'shared',
        display_tab:     st.display_tab || null,
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
router.put('/customize-forms/:orgId/:category', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
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
        // Real field → write to field_setup with all advanced properties.
        const sortOrder    = Number.isFinite(parseInt(it.sort_order, 10)) ? parseInt(it.sort_order, 10) : 0;
        const customLabel  = typeof it.custom_label === 'string' ? it.custom_label.trim() || null : null;
        const fieldType    = typeof it.field_type === 'string' && it.field_type.trim() ? it.field_type.trim() : 'text';
        const helpText     = typeof it.help_text === 'string' ? it.help_text.trim() || null : null;
        const maxLength    = Number.isFinite(parseInt(it.max_length, 10)) ? parseInt(it.max_length, 10) : null;
        const defaultValue = typeof it.default_value === 'string' ? it.default_value.trim() || null : null;
        const picklistType = typeof it.picklist_type === 'string' ? it.picklist_type.trim() || null : null;
        const lookupTarget = typeof it.lookup_target === 'string' ? it.lookup_target.trim() || null : null;
        const isSensitive  = it.is_sensitive ? 1 : 0;
        const maskingPattern = typeof it.masking_pattern === 'string' && it.masking_pattern.trim()
          ? it.masking_pattern.trim() : 'partial';
        // Theme 3 validation knobs
        const formatHint   = typeof it.format_hint === 'string' ? it.format_hint.trim() || null : null;
        const valRegex     = typeof it.validation_regex === 'string' ? it.validation_regex.trim() || null : null;
        const valMessage   = typeof it.validation_message === 'string' ? it.validation_message.trim() || null : null;
        const minValue     = Number.isFinite(parseFloat(it.min_value)) ? parseFloat(it.min_value) : null;
        const maxValue     = Number.isFinite(parseFloat(it.max_value)) ? parseFloat(it.max_value) : null;
        const minLength    = Number.isFinite(parseInt(it.min_length, 10)) ? parseInt(it.min_length, 10) : null;
        const dupCheck     = it.duplicate_check ? 1 : 0;
        const dupScope     = typeof it.duplicate_scope === 'string' && it.duplicate_scope.trim()
          ? it.duplicate_scope.trim() : 'org';
        const dupMatch     = typeof it.duplicate_match === 'string' && it.duplicate_match.trim()
          ? it.duplicate_match.trim() : 'exact';
        // B1 — case-type routing knobs
        const caseTypeScope = ['shared','ae','mi','pc'].includes(String(it.case_type_scope || '').toLowerCase())
          ? String(it.case_type_scope).toLowerCase() : 'shared';
        const displayTab    = typeof it.display_tab === 'string' && it.display_tab.trim()
          ? it.display_tab.trim() : null;
        await conn.execute(
          `INSERT INTO field_setup
             (section_name, field_name, field_type, is_required, is_disabled, org_id, sort_order,
              custom_label, help_text, max_length, default_value, picklist_type, lookup_target,
              is_sensitive, masking_pattern,
              format_hint, validation_regex, validation_message,
              min_value, max_value, min_length,
              duplicate_check, duplicate_scope, duplicate_match,
              case_type_scope, display_tab)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             field_type      = VALUES(field_type),
             is_required     = VALUES(is_required),
             is_disabled     = VALUES(is_disabled),
             sort_order      = VALUES(sort_order),
             custom_label    = VALUES(custom_label),
             help_text       = VALUES(help_text),
             max_length      = VALUES(max_length),
             default_value   = VALUES(default_value),
             picklist_type   = VALUES(picklist_type),
             lookup_target   = VALUES(lookup_target),
             is_sensitive    = VALUES(is_sensitive),
             masking_pattern = VALUES(masking_pattern),
             format_hint        = VALUES(format_hint),
             validation_regex   = VALUES(validation_regex),
             validation_message = VALUES(validation_message),
             min_value          = VALUES(min_value),
             max_value          = VALUES(max_value),
             min_length         = VALUES(min_length),
             duplicate_check    = VALUES(duplicate_check),
             duplicate_scope    = VALUES(duplicate_scope),
             duplicate_match    = VALUES(duplicate_match),
             case_type_scope    = VALUES(case_type_scope),
             display_tab        = VALUES(display_tab)`,
          [def.db_section, def.db_field, fieldType, isRequired, isDisabled, orgId, sortOrder,
           customLabel, helpText, maxLength, defaultValue, picklistType, lookupTarget,
           isSensitive, maskingPattern,
           formatHint, valRegex, valMessage,
           minValue, maxValue, minLength,
           dupCheck, dupScope, dupMatch,
           caseTypeScope, displayTab]
        );
        // Bust the validation rule cache so the next request picks up new rules
        try { require('../../services/validationEngine').invalidate(orgId, def.db_section); } catch (_) {}
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

// ─────────────────────────────────────────────────────────────────────────────
// FLEX FIELDS — admin can add brand-new fields to a section for a tenant
// (folded in from the legacy Field Setup screen)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/admin/customize-forms/:orgId/flex-field
// Body: { section_name, field_name, field_type, help_text?, max_length?, default_value?, picklist_type? }
router.post('/customize-forms/:orgId/flex-field', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  if (!Number.isFinite(orgId)) return res.status(400).json({ error: 'Invalid orgId.' });
  const { section_name, field_name, field_type = 'text', help_text, max_length, default_value, picklist_type, lookup_target } = req.body || {};
  if (!section_name?.trim() || !field_name?.trim()) {
    return res.status(400).json({ error: 'section_name and field_name are required.' });
  }
  try {
    const [r] = await pool.execute(
      `INSERT INTO field_setup
         (section_name, field_name, field_type, is_required, is_hidden, is_disabled,
          org_id, sort_order, help_text, max_length, default_value, picklist_type, lookup_target)
       VALUES (?, ?, ?, 0, 0, 0, ?, 999, ?, ?, ?, ?, ?)`,
      [
        section_name.trim(), field_name.trim(), field_type.trim(), orgId,
        help_text?.trim() || null,
        Number.isFinite(parseInt(max_length, 10)) ? parseInt(max_length, 10) : null,
        default_value?.trim() || null,
        picklist_type?.trim() || null,
        lookup_target?.trim() || null,
      ]
    );
    await pool.execute(
      `INSERT INTO audit_logs (user_id, entity, entity_id, action, details)
       VALUES (?, 'flex_field', ?, 'CREATE_FLEX_FIELD', ?)`,
      [req.user.userId, r.insertId, JSON.stringify({ orgId, section_name, field_name, field_type })]
    );
    res.status(201).json({ ok: true, id: r.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A field with this name already exists in this section for this tenant.' });
    }
    console.error('POST /customize-forms/:orgId/flex-field error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/customize-forms/:orgId/flex-field/:id
router.delete('/customize-forms/:orgId/flex-field/:id', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  if (!Number.isFinite(orgId)) return res.status(400).json({ error: 'Invalid orgId.' });
  try {
    const [[row]] = await pool.execute(
      'SELECT id, section_name, field_name FROM field_setup WHERE id = ? AND org_id = ? LIMIT 1',
      [req.params.id, orgId]
    );
    if (!row) return res.status(404).json({ error: 'Flex field not found.' });
    await pool.execute('DELETE FROM field_setup WHERE id = ?', [req.params.id]);
    await pool.execute(
      `INSERT INTO audit_logs (user_id, entity, entity_id, action, details)
       VALUES (?, 'flex_field', ?, 'DELETE_FLEX_FIELD', ?)`,
      [req.user.userId, req.params.id, JSON.stringify({ orgId, section_name: row.section_name, field_name: row.field_name })]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /customize-forms/:orgId/flex-field/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/customize-forms/:orgId/case-form-def
// Body: { case_type, section_name, field_overrides } — writes the rare advanced JSON
router.put('/customize-forms/:orgId/case-form-def', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const orgId = parseInt(req.params.orgId, 10);
  const { case_type, section_name, field_overrides } = req.body || {};
  if (!Number.isFinite(orgId) || !case_type || !section_name) {
    return res.status(400).json({ error: 'orgId, case_type, and section_name are required.' });
  }
  try {
    await pool.execute(
      `INSERT INTO case_form_definition (org_id, case_type, section_name, is_visible, field_overrides)
       VALUES (?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE field_overrides = VALUES(field_overrides)`,
      [orgId, case_type, section_name, field_overrides ? JSON.stringify(field_overrides) : null]
    );
    await pool.execute(
      `INSERT INTO audit_logs (user_id, entity, entity_id, action, details)
       VALUES (?, 'case_form_def', NULL, 'UPDATE_FIELD_OVERRIDES', ?)`,
      [req.user.userId, JSON.stringify({ orgId, case_type, section_name })]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /customize-forms/:orgId/case-form-def error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
