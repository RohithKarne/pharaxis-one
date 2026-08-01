'use strict';

/**
 * caseFields.js — Case form field configuration (Phase 3).
 *
 *   GET /api/admin/case-fields?case_type=AE   — the org's resolved field list
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

const ADMIN = ['admin', 'platform_admin'];
const CASE_TYPES = ['MI', 'AE', 'PC'];

// Only presentation is editable here. Field type, picklist binding and target
// mapping are structural and are not exposed to a tenant admin.
const EDITABLE = ['custom_label', 'help_text', 'is_required', 'is_hidden', 'sort_order'];

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
    }));

    const sections = [...new Set(fields.map(f => f.section_name))].map(name => ({
      section_name: name,
      fields: fields.filter(f => f.section_name === name),
    }));

    res.json({ case_type: caseType, org_id: orgId, sections, total: fields.length });
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
         orgId, row.case_type_scope, row.display_tab, row.core_key ?? null]
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
