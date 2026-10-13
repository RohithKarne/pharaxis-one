'use strict';

/**
 * caseFields.js — Case form field configuration (Phase 3).
 *
 *   GET /api/admin/case-fields?case_type=AE   — the org's resolved field list
 *   GET /api/admin/case-fields/usage?case_type=AE — per field, how many cases hold a value (read-only)
 *   PUT /api/admin/case-fields/:id            — update one field's presentation
 *
 * This is the admin surface for the layer wired up in Phase 3: `field_setup`
 * drives every case-form field's label, required flag, visibility and order, and
 * this screen is where an admin changes them. Locked with Rohith 2026-07-28
 * ("fields defined and controlled from the backend, not hardcoded").
 *
 * Two rules matter more than the CRUD:
 *
 * 1. **An org never edits a platform default.** `field_setup` holds rows with
 *    `org_id IS NULL` that every tenant inherits. Writing to one would leak a
 *    relabel into every other org. Editing an inherited field instead CLONES it
 *    into an org-owned row and edits the clone.
 *
 * 2. **Core fields cannot be deleted, only hidden.** Rows carrying a `core_key`
 *    back a control the wizard renders itself (Status, Priority, Date Received…).
 *    Deleting the definition would strip the admin's ability to relabel or
 *    restore it, which is the opposite of what this screen exists for.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
const { usageForFields } = require('../../services/fieldUsageService');
const { e2bTag } = require('../../catalogs/e2bFieldTags');
const { CUT_FIELD_KEYS, cutKey } = require('../../catalogs/caseFormCutList');

const ADMIN = ['admin', 'platform_admin'];
const CASE_TYPES = ['MI', 'AE', 'PC'];

// Only presentation is editable here. Field type, picklist binding and target
// mapping are structural and are not exposed to a tenant admin. display_tab
// (which step an added field shows on) is editable for added fields only.
const EDITABLE = ['custom_label', 'help_text', 'is_required', 'is_hidden', 'sort_order', 'display_tab'];

// The case's own fields, drawn on the Workflow step or the case header.
const WORKFLOW_KEYS = ['status_id', 'case_owner_id', 'priority', 'date_received', 'latest_information_date', 'internal_notes'];
const HEADER_KEYS = ['case_number', 'case_type', 'org_id', 'date_of_intake', 'intake_channel', 'description'];

// Where a field appears on the case form (case form clean-up PR 5, the Step column).
//   1 = Reporter & Patient, 2 = Product & Details, 3 = Response & Workflow.
// Only an added field (no core key, not a contact field) can be moved: the
// rest are drawn by their own screen.
function stepOf(f) {
  if (f.section_name === 'Contact / Requestor') return { step: 1, label: 'Step 1 · Reporter & Patient', movable: false };
  if (f.core_key && HEADER_KEYS.includes(f.core_key)) return { step: 0, label: 'Case header', movable: false };
  if (f.core_key && WORKFLOW_KEYS.includes(f.core_key)) return { step: 3, label: 'Step 3 · Response & Workflow', movable: false };
  if (f.core_key) return { step: 2, label: 'Step 2 · drawn by the panel', movable: false };
  if (f.display_tab === 'info') return { step: 3, label: 'Step 3 · Response & Workflow', movable: true };
  return { step: 2, label: 'Step 2 · Product & Details', movable: true };
}

// A section can be switched off only when every field in it is an added one;
// a panel section's own fields are drawn whatever the switch says.
const PICKLIST_TYPES_SQL = `SELECT DISTINCT COALESCE(pf.name, p.field_type) AS type FROM picklists p
  LEFT JOIN picklist_fields pf ON p.field_id = pf.id WHERE p.org_id = ? AND p.status = 'Active' ORDER BY type`;
const FIELD_TYPES = ['text', 'textarea', 'date', 'number', 'checkbox', 'dropdown'];

function resolveOrgId(req) {
  return hasGlobalAdminScope(req.user)
    ? (Number(req.query.org_id || req.body?.org_id || 0) || req.user.orgId || 1)
    : req.user.orgId;
}

async function audit(req, action, entityId, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
       VALUES (?, ?, ?, 'case_field_setup', ?, ?)`,
      [req.user.userId || null, req.user.name || req.user.email || 'System',
       action, entityId, JSON.stringify(details || {})]
    );
  } catch (_) { /* audit must never block the change */ }
}

router.get('/case-fields', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'org_id required.' });

    const caseType = String(req.query.case_type || 'MI').toUpperCase();
    if (!CASE_TYPES.includes(caseType)) {
      return res.status(400).json({ error: 'case_type must be MI, AE or PC.' });
    }

    const [rows] = await pool.execute(
      `SELECT id, org_id, section_name, field_name, field_type, custom_label, help_text,
              is_required, is_hidden, is_disabled, sort_order, core_key, case_type_scope, display_tab
         FROM field_setup
        WHERE (org_id = ? OR org_id IS NULL)
          AND section_name != '__customize_placeholder__'
          AND (case_type_scope = 'shared' OR case_type_scope = ?)
        ORDER BY section_name, sort_order, id`,
      [orgId, caseType.toLowerCase()]
    );

    // Same resolution the case form uses: the org's row wins over the platform
    // default, so the admin edits exactly what the user sees. Without this the
    // screen would list every field twice.
    const byKey = new Map();
    for (const row of rows) {
      const key = `${row.section_name}::${String(row.field_name).trim().toLowerCase()}`;
      const existing = byKey.get(key);
      if (!existing || (existing.org_id === null && row.org_id !== null)) byKey.set(key, row);
    }

    const fields = [...byKey.values()].map(r => ({
      ...r,
      is_required: !!r.is_required,
      is_hidden: !!r.is_hidden || !!r.is_disabled,
      is_core: !!r.core_key,
      // Tells the UI this field is still inherited — editing it will create an
      // org-owned override rather than change the shared default.
      is_inherited: r.org_id === null,
      step: stepOf(r),
      e2b: e2bTag(r.section_name, r.field_name),
      removed_in_cleanup: CUT_FIELD_KEYS.has(cutKey(r.section_name, r.field_name)),
    }));

    // Section on / off for this case type (case_form_definition). Switching a
    // section off removes its added fields from the case form; the values stay.
    const [defs] = await pool.execute(
      'SELECT section_name, is_visible FROM case_form_definition WHERE org_id = ? AND case_type = ?',
      [orgId, caseType]
    );
    const visibleBySection = new Map(defs.map(d => [d.section_name, !!d.is_visible]));

    const sections = [...new Set(fields.map(f => f.section_name))].map(name => {
      const inSection = fields.filter(f => f.section_name === name);
      return {
        section_name: name,
        is_visible: visibleBySection.has(name) ? visibleBySection.get(name) : true,
        can_switch: visibleBySection.has(name) && name !== 'Contact / Requestor' && inSection.every(f => !f.is_core),
        fields: inSection,
      };
    });

    res.json({ case_type: caseType, org_id: orgId, sections, total: fields.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Day 0 of the case form clean-up (Rohith, 2026-10-13): the count behind every
// "hide" decision, shown on the screen so nobody has to run a script. Read-only.
router.get('/case-fields/usage', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'org_id required.' });
    const caseType = String(req.query.case_type || 'MI').toUpperCase();
    if (!CASE_TYPES.includes(caseType)) {
      return res.status(400).json({ error: 'case_type must be MI, AE or PC.' });
    }
    const [rows] = await pool.execute(
      `SELECT id, org_id, section_name, field_name, core_key
         FROM field_setup
        WHERE (org_id = ? OR org_id IS NULL)
          AND section_name != '__customize_placeholder__'
          AND (case_type_scope = 'shared' OR case_type_scope = ?)`,
      [orgId, caseType.toLowerCase()]
    );
    const byKey = new Map();
    for (const row of rows) {
      const key = `${row.section_name}::${String(row.field_name).trim().toLowerCase()}`;
      const existing = byKey.get(key);
      if (!existing || (existing.org_id === null && row.org_id !== null)) byKey.set(key, row);
    }
    const [[c]] = await pool.execute(
      'SELECT COUNT(*) AS n FROM cases WHERE is_deleted = 0 AND org_id = ?', [orgId]);
    const usage = await usageForFields(orgId, [...byKey.values()]);
    res.json({ case_type: caseType, org_id: orgId, cases_total: c.n, usage });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Picklists an added dropdown can use.
router.get('/case-fields/picklist-types', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'org_id required.' });
    const [rows] = await pool.execute(PICKLIST_TYPES_SQL, [orgId]);
    res.json({ types: rows.map(r => r.type).filter(Boolean) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Switch a section on or off for one case type (case form clean-up PR 5).
router.put('/case-fields/sections', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'org_id required.' });
    const caseType = String(req.body?.case_type || '').toUpperCase();
    const sectionName = String(req.body?.section_name || '');
    if (!CASE_TYPES.includes(caseType)) return res.status(400).json({ error: 'case_type must be MI, AE or PC.' });
    const [[def]] = await pool.execute(
      'SELECT id, is_visible FROM case_form_definition WHERE org_id = ? AND case_type = ? AND section_name = ? LIMIT 1',
      [orgId, caseType, sectionName]
    );
    if (!def) return res.status(404).json({ error: 'Section not found for this case type.' });
    const [[core]] = await pool.execute(
      `SELECT COUNT(*) AS n FROM field_setup WHERE section_name = ? AND core_key IS NOT NULL AND (org_id = ? OR org_id IS NULL)`,
      [sectionName, orgId]
    );
    if (sectionName === 'Contact / Requestor' || core.n > 0) {
      return res.status(400).json({ error: 'This section is drawn by its own screen and cannot be switched off. Hide its fields one by one.' });
    }
    const visible = req.body?.is_visible ? 1 : 0;
    await pool.execute('UPDATE case_form_definition SET is_visible = ? WHERE id = ?', [visible, def.id]);
    await audit(req, visible ? 'SECTION_ON' : 'SECTION_OFF', def.id, { case_type: caseType, section_name: sectionName });
    res.json({ case_type: caseType, section_name: sectionName, is_visible: !!visible });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a field to a section (case form clean-up PR 5). It is an organisation
// field: stored in the configured store, shown on the step chosen.
router.post('/case-fields', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'org_id required.' });
    const b = req.body || {};
    const caseType = String(b.case_type || '').toUpperCase();
    if (!CASE_TYPES.includes(caseType)) return res.status(400).json({ error: 'case_type must be MI, AE or PC.' });
    const sectionName = String(b.section_name || '').trim();
    const fieldName = String(b.field_name || '').trim();
    const fieldType = String(b.field_type || '');
    if (!fieldName || fieldName.length > 100) return res.status(400).json({ error: 'A field name of 1 to 100 characters is required.' });
    if (!FIELD_TYPES.includes(fieldType)) return res.status(400).json({ error: `Type must be one of: ${FIELD_TYPES.join(', ')}.` });
    if (sectionName === 'Contact / Requestor') {
      return res.status(400).json({ error: 'The contact form draws a fixed set of fields; a field added here would never show.' });
    }
    const [[def]] = await pool.execute(
      'SELECT id FROM case_form_definition WHERE org_id = ? AND case_type = ? AND section_name = ? LIMIT 1',
      [orgId, caseType, sectionName]
    );
    if (!def) return res.status(400).json({ error: 'Choose a section of this case type.' });
    let picklistType = null;
    if (fieldType === 'dropdown') {
      const [types] = await pool.execute(PICKLIST_TYPES_SQL, [orgId]);
      picklistType = String(b.picklist_type || '');
      if (!types.some(t => t.type === picklistType)) return res.status(400).json({ error: 'Choose the picklist this dropdown offers.' });
    }
    const [[dupe]] = await pool.execute(
      'SELECT id FROM field_setup WHERE section_name = ? AND LOWER(TRIM(field_name)) = LOWER(?) AND (org_id = ? OR org_id IS NULL) LIMIT 1',
      [sectionName, fieldName, orgId]
    );
    if (dupe) return res.status(409).json({ error: `"${fieldName}" already exists in ${sectionName}. Show it again instead.` });
    // Shared sections (Case Information and the like) are shared across case types.
    const [[scopeRow]] = await pool.execute(
      `SELECT case_type_scope FROM field_setup WHERE section_name = ? AND (org_id = ? OR org_id IS NULL) LIMIT 1`,
      [sectionName, orgId]
    );
    const scope = scopeRow?.case_type_scope === 'shared' ? 'shared' : caseType.toLowerCase();
    const [[ord]] = await pool.execute(
      'SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM field_setup WHERE section_name = ? AND (org_id = ? OR org_id IS NULL)',
      [sectionName, orgId]
    );
    const [ins] = await pool.execute(
      `INSERT INTO field_setup (section_name, field_name, field_type, is_required, is_hidden, is_disabled,
                                picklist_type, sort_order, org_id, case_type_scope, display_tab)
       VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)`,
      [sectionName, fieldName, fieldType, b.is_required ? 1 : 0, picklistType, ord.n, orgId, scope, b.step === 3 ? 'info' : null]
    );
    await audit(req, 'ADD_FIELD', ins.insertId, { case_type: caseType, section_name: sectionName, field_name: fieldName, field_type: fieldType, step: b.step === 3 ? 3 : 2 });
    res.status(201).json({ id: ins.insertId, section_name: sectionName, field_name: fieldName, field_type: fieldType });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/case-fields/:id', authenticate, requireRole(...ADMIN), async (req, res) => {
  try {
    const orgId = resolveOrgId(req);
    if (!orgId) return res.status(400).json({ error: 'org_id required.' });

    const [[row]] = await pool.execute(
      'SELECT * FROM field_setup WHERE id = ? LIMIT 1', [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Field not found.' });
    if (row.org_id !== null && Number(row.org_id) !== Number(orgId)) {
      return res.status(404).json({ error: 'Field not found.' });
    }

    const patch = {};
    for (const key of EDITABLE) {
      if (!(key in req.body)) continue;
      const value = req.body[key];
      if (key === 'is_required' || key === 'is_hidden') {
        patch[key] = value ? 1 : 0;
      } else if (key === 'display_tab') {
        // Step 2 (no tab) or Step 3 ('info'), for an added field only.
        if (row.core_key || row.section_name === 'Contact / Requestor') {
          return res.status(400).json({ error: 'This field is drawn by its own screen; its step cannot change.' });
        }
        if (![null, '', 'info'].includes(value)) return res.status(400).json({ error: 'display_tab must be empty (Step 2) or "info" (Step 3).' });
        patch[key] = value || null;
      } else if (key === 'sort_order') {
        const n = parseInt(value, 10);
        if (Number.isNaN(n) || n < 0 || n > 9999) {
          return res.status(400).json({ error: 'sort_order must be between 0 and 9999.' });
        }
        patch[key] = n;
      } else {
        const str = value === null || value === '' ? null : String(value).trim();
        if (str && str.length > 255) {
          return res.status(400).json({ error: `${key} must be 255 characters or fewer.` });
        }
        patch[key] = str;
      }
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: 'No editable fields supplied.' });
    }

    // A core field must stay reachable: hiding it is fine, but it can never be
    // deleted, and hiding must not also mark it required — an admin would then
    // have a required field nobody can fill in.
    if (patch.is_hidden === 1 && patch.is_required === 1) {
      return res.status(400).json({ error: 'A field cannot be both hidden and required.' });
    }
    if (patch.is_hidden === 1 && row.is_required && patch.is_required === undefined) {
      return res.status(400).json({ error: 'Clear "required" before hiding this field.' });
    }

    let targetId = row.id;

    if (row.org_id === null) {
      // Inherited platform default — clone into an org-owned row instead of
      // mutating the shared definition. Editing the default would change the
      // field for every tenant on the platform.
      //
      // field_setup has a unique key on (section_name, field_name, org_id). The
      // GET only reports a field as inherited when the org has no row of its
      // own, but a stale client or a direct API call can still target the
      // platform id after an override already exists — inserting then fails on
      // the duplicate key and surfaces a raw SQL error. Update the existing
      // override instead.
      const [[existingOverride]] = await pool.execute(
        'SELECT id FROM field_setup WHERE org_id = ? AND section_name = ? AND field_name = ? LIMIT 1',
        [orgId, row.section_name, row.field_name]
      );
      if (existingOverride) {
        const sets = Object.keys(patch).map(k => `${k} = ?`).join(', ');
        await pool.execute(
          `UPDATE field_setup SET ${sets} WHERE id = ? AND org_id = ?`,
          [...Object.values(patch), existingOverride.id, orgId]
        );
        await audit(req, 'UPDATE_EXISTING_OVERRIDE', existingOverride.id,
          { platform_row: row.id, field_name: row.field_name, patch });
        const [[merged]] = await pool.execute(
          `SELECT id, org_id, section_name, field_name, field_type, custom_label, help_text,
                  is_required, is_hidden, sort_order, core_key
             FROM field_setup WHERE id = ? LIMIT 1`,
          [existingOverride.id]
        );
        return res.json({
          ...merged,
          is_required: !!merged.is_required,
          is_hidden: !!merged.is_hidden,
          is_core: !!merged.core_key,
          is_inherited: false,
          cloned_from_platform_default: false,
        });
      }

      const merged = { ...row, ...patch };
      const [ins] = await pool.execute(
        `INSERT INTO field_setup
           (section_name, field_name, field_type, is_required, is_hidden, is_disabled,
            custom_label, help_text, picklist_type, lookup_target, max_length, default_value,
            sort_order, org_id, case_type_scope, display_tab, core_key)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [row.section_name, row.field_name, row.field_type,
         merged.is_required ? 1 : 0, merged.is_hidden ? 1 : 0, row.is_disabled ? 1 : 0,
         merged.custom_label ?? null, merged.help_text ?? null,
         row.picklist_type ?? null, row.lookup_target ?? null,
         row.max_length ?? null, row.default_value ?? null,
         merged.sort_order ?? row.sort_order ?? 0,
         orgId, row.case_type_scope, ('display_tab' in patch ? patch.display_tab : row.display_tab), row.core_key ?? null]
      );
      targetId = ins.insertId;
      await audit(req, 'OVERRIDE_PLATFORM_DEFAULT', targetId,
        { from_platform_row: row.id, field_name: row.field_name, patch });
    } else {
      const sets = Object.keys(patch).map(k => `${k} = ?`).join(', ');
      await pool.execute(
        `UPDATE field_setup SET ${sets} WHERE id = ? AND org_id = ?`,
        [...Object.values(patch), row.id, orgId]
      );
      await audit(req, 'UPDATE', row.id, { field_name: row.field_name, patch });
    }

    const [[updated]] = await pool.execute(
      `SELECT id, org_id, section_name, field_name, field_type, custom_label, help_text,
              is_required, is_hidden, sort_order, core_key
         FROM field_setup WHERE id = ? LIMIT 1`,
      [targetId]
    );

    res.json({
      ...updated,
      is_required: !!updated.is_required,
      is_hidden: !!updated.is_hidden,
      is_core: !!updated.core_key,
      is_inherited: false,
      cloned_from_platform_default: targetId !== row.id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
