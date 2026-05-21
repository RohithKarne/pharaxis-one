'use strict';

/**
 * admin/divisionParameters.js — System > Division Parameters API (P1 Backbone)
 *
 * Division == tenant/org. Replaces the thin Organizations create surface.
 * P1 endpoints: list + create(draft), General tab save, Users tab assignment
 * (via user_org_access), activate, and the universal country list.
 *
 * Guarding:
 *   - list / create / activate  → platform_admin (superadmin) only
 *   - get / general / users      → admin or platform_admin; tenant admins are
 *                                  scoped to their own org_id.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');
const { hasGlobalAdminScope } = require('../../utils/adminScope');

// Universal, system-provided country list (ISO 3166-1 alpha-2). Canonical source
// for every division country dropdown. Trimmed to active pharma markets for P1;
// extend freely — code is the stored value.
const COUNTRIES = [
  ['US', 'United States'], ['CA', 'Canada'], ['MX', 'Mexico'], ['BR', 'Brazil'],
  ['AR', 'Argentina'], ['GB', 'United Kingdom'], ['IE', 'Ireland'], ['FR', 'France'],
  ['DE', 'Germany'], ['ES', 'Spain'], ['IT', 'Italy'], ['PT', 'Portugal'],
  ['NL', 'Netherlands'], ['BE', 'Belgium'], ['CH', 'Switzerland'], ['AT', 'Austria'],
  ['SE', 'Sweden'], ['NO', 'Norway'], ['DK', 'Denmark'], ['FI', 'Finland'],
  ['PL', 'Poland'], ['CZ', 'Czechia'], ['HU', 'Hungary'], ['GR', 'Greece'],
  ['RO', 'Romania'], ['RU', 'Russia'], ['TR', 'Turkey'], ['IL', 'Israel'],
  ['SA', 'Saudi Arabia'], ['AE', 'United Arab Emirates'], ['ZA', 'South Africa'],
  ['EG', 'Egypt'], ['NG', 'Nigeria'], ['IN', 'India'], ['PK', 'Pakistan'],
  ['BD', 'Bangladesh'], ['CN', 'China'], ['HK', 'Hong Kong'], ['TW', 'Taiwan'],
  ['JP', 'Japan'], ['KR', 'South Korea'], ['SG', 'Singapore'], ['MY', 'Malaysia'],
  ['TH', 'Thailand'], ['ID', 'Indonesia'], ['PH', 'Philippines'], ['VN', 'Vietnam'],
  ['AU', 'Australia'], ['NZ', 'New Zealand'],
].map(([code, name]) => ({ code, name }));

// Whitelisted columns per wizard section that may be written via PUT /:orgId/save/:section.
const SECTION_COLUMNS = {
  general: [
    'division_code', 'description', 'address', 'city', 'state_region', 'postal_code',
    'country', 'email', 'division_group',
    'country_default', 'personal_info_visibility', 'date_format', 'default_case_priority',
    'cc_reason_delete_record', 'cc_reason_change_case', 'cc_reason_refer_case',
    'cc_password_close_case', 'cc_reason_reopen_case', 'cc_password_close_ae',
    'cc_password_close_pc', 'cc_reason_change_letter', 'cc_reason_reopen_letter',
    'cc_reason_reopen_pc', 'cc_reason_reopen_ae', 'cc_reason_change_ae',
    'cc_reason_delete_ae', 'cc_reason_change_pc', 'cc_reason_change_date_received',
    'cc_reason_change_first_response', 'cc_reason_escalation',
  ],
  'case-entry': [
    'ce_lookup_city_zip', 'ce_lookup_rep_zip', 'ce_lookup_msl', 'ce_suppress_ae',
    'ce_suppress_pc', 'ce_lock_entered_date', 'ce_sort_product_by_status',
    'ce_allow_new_qa_case', 'ce_allow_field_translation', 'ce_max_contacts', 'ce_max_questions',
    'num_case_number', 'num_ae_mode', 'num_pc_mode',
    'resp_allow_letters', 'resp_custom_letters_mode', 'resp_store_secured_pdf', 'resp_allow_email',
  ],
  email: [
    'email_attachment_format', 'fax_server_domain', 'fax_out_address_mask',
    'fax_out_subject', 'fax_out_success_phrase',
  ],
  ae: [
    'ae_auto_snapshot_on_referral', 'ae_country_of_occurrence', 'ae_delete_cancel_mode',
    'ae_med_types', 'ae_require_death_date', 'ae_contact_type_to_occupation',
    'ae_default_report_type', 'ae_force_commit_cancel', 'ae_product_mode', 'ae_seriousness',
    'ae_include_attachments', 'ae_integration_method',
  ],
  pc: [
    'pc_auto_snapshot_on_referral', 'pc_delete_cancel_mode', 'pc_force_commit_cancel',
    'pc_validate_case_entry',
  ],
  completion: [
    'comp_notif_active', 'comp_notif_require_ae', 'comp_notif_include_letter',
    'comp_notif_email_template', 'comp_notif_email_to', 'comp_notif_require_pc',
    'comp_notif_include_snapshot', 'comp_notif_save_attachment',
    'comp_rep_active', 'comp_rep_email_template', 'comp_rep_trigger', 'comp_rep_types',
    'comp_msl_active', 'comp_msl_email_template', 'comp_msl_trigger',
  ],
};

// Boolean (TINYINT) columns — coerce truthy/falsey to 1/0 on write.
const BOOL_COLUMNS = new Set([
  ...SECTION_COLUMNS.general.filter(c => c.startsWith('cc_')),
  'ce_lookup_city_zip', 'ce_lookup_rep_zip', 'ce_lookup_msl', 'ce_suppress_ae',
  'ce_suppress_pc', 'ce_lock_entered_date', 'ce_sort_product_by_status',
  'ce_allow_new_qa_case', 'ce_allow_field_translation',
  'resp_allow_letters', 'resp_store_secured_pdf', 'resp_allow_email',
  'comp_notif_active', 'comp_notif_require_ae', 'comp_notif_include_letter',
  'comp_notif_require_pc', 'comp_notif_include_snapshot', 'comp_notif_save_attachment',
  'comp_rep_active', 'comp_msl_active',
]);

// Reserved field_setup section names for the up-to-10 custom client fields per type.
const CLIENT_FIELD_SECTIONS = {
  case: 'Case Client Fields',
  ae:   'AE Client Fields',
  pc:   'PC Client Fields',
};
const CLIENT_FIELD_MAX = 10;
const CLIENT_FIELD_TYPES = new Set(['text', 'numeric', 'date', 'yes_no']);

// Resolve org access: platform_admin sees all; tenant admin only their own org.
function assertOrgAccess(req, orgId) {
  if (hasGlobalAdminScope(req.user)) return true;
  return Number(req.user.orgId) === Number(orgId);
}

async function ensureRow(orgId) {
  await pool.execute(
    `INSERT IGNORE INTO division_parameters (org_id, config_status) VALUES (?, 'draft')`,
    [orgId]
  );
}

// ── GET /division-parameters — list divisions (scoped like the orgs tab) ─────
// Superadmin sees all divisions; a tenant admin sees only their own org.
router.get('/division-parameters', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const isSA = hasGlobalAdminScope(req.user);
    const [rows] = await pool.execute(`
      SELECT o.id AS org_id, o.name, o.is_active,
             dp.division_code, dp.config_status, dp.needs_review,
             (SELECT COUNT(*) FROM user_org_access uoa WHERE uoa.org_id = o.id AND uoa.is_active = 1) AS user_count
        FROM organisations o
        LEFT JOIN division_parameters dp ON dp.org_id = o.id
       ${isSA ? '' : 'WHERE o.id = ?'}
       ORDER BY o.name
    `, isSA ? [] : [req.user.orgId]);
    res.json({ divisions: rows });
  } catch (err) {
    console.error('GET /division-parameters error:', err);
    res.status(500).json({ error: 'Failed to load divisions' });
  }
});

// ── GET /division-parameters/countries — universal country list ─────────────
router.get('/division-parameters/countries', authenticate, requireRole('admin', 'platform_admin'), (_req, res) => {
  res.json({ countries: COUNTRIES });
});

// ── GET /division-parameters/users — dual-list source for a division ────────
router.get('/division-parameters/users', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const orgId = Number(req.query.org_id);
  if (!orgId) return res.status(400).json({ error: 'org_id required' });
  if (!assertOrgAccess(req, orgId)) return res.status(403).json({ error: 'Forbidden' });
  try {
    const [rows] = await pool.execute(`
      SELECT u.id AS user_id, u.name, u.email, u.role,
             CASE WHEN uoa.id IS NOT NULL AND uoa.is_active = 1 THEN 1 ELSE 0 END AS assigned
        FROM users u
        LEFT JOIN user_org_access uoa ON uoa.user_id = u.id AND uoa.org_id = ?
       WHERE u.role <> 'platform_admin'
       ORDER BY u.name
    `, [orgId]);
    res.json({
      assigned:  rows.filter(r => r.assigned),
      available: rows.filter(r => !r.assigned),
    });
  } catch (err) {
    console.error('GET /division-parameters/users error:', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// ── GET /division-parameters/:orgId — one division's parameters ─────────────
router.get('/division-parameters/:orgId', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const orgId = Number(req.params.orgId);
  if (!assertOrgAccess(req, orgId)) return res.status(403).json({ error: 'Forbidden' });
  try {
    await ensureRow(orgId);
    const [[org]] = await pool.execute('SELECT id, name, is_active FROM organisations WHERE id = ?', [orgId]);
    if (!org) return res.status(404).json({ error: 'Division not found' });
    const [[params]] = await pool.execute('SELECT * FROM division_parameters WHERE org_id = ?', [orgId]);
    res.json({ org, params });
  } catch (err) {
    console.error('GET /division-parameters/:orgId error:', err);
    res.status(500).json({ error: 'Failed to load division' });
  }
});

// ── POST /division-parameters — create a new division (draft) ───────────────
router.post('/division-parameters', authenticate, requireRole('platform_admin'), async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const divisionCode = String(req.body?.division_code || '').trim() || null;
  if (!name) return res.status(400).json({ error: 'Division name is required' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [exists] = await conn.execute('SELECT id FROM organisations WHERE name = ?', [name]);
    if (exists.length) { await conn.rollback(); return res.status(409).json({ error: 'A division with this name already exists' }); }
    if (divisionCode) {
      const [codeExists] = await conn.execute('SELECT org_id FROM division_parameters WHERE division_code = ?', [divisionCode]);
      if (codeExists.length) { await conn.rollback(); return res.status(409).json({ error: 'Division code already in use' }); }
    }
    const [ins] = await conn.execute('INSERT INTO organisations (name, is_active) VALUES (?, 1)', [name]);
    const orgId = ins.insertId;
    await conn.execute(
      `INSERT INTO division_parameters (org_id, config_status, division_code) VALUES (?, 'draft', ?)`,
      [orgId, divisionCode]
    );
    await conn.commit();
    res.status(201).json({ org_id: orgId, name, config_status: 'draft' });
  } catch (err) {
    await conn.rollback();
    console.error('POST /division-parameters error:', err);
    res.status(500).json({ error: 'Failed to create division' });
  } finally {
    conn.release();
  }
});

// ── PUT /division-parameters/:orgId/save/:section — save any wizard section ──
router.put('/division-parameters/:orgId/save/:section', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const orgId = Number(req.params.orgId);
  const section = String(req.params.section);
  if (!assertOrgAccess(req, orgId)) return res.status(403).json({ error: 'Forbidden' });
  const allowed = SECTION_COLUMNS[section];
  if (!allowed) return res.status(400).json({ error: 'Unknown section' });
  const body = req.body || {};
  try {
    await ensureRow(orgId);

    // General tab also writes org-level fields: Inactive toggle, name, session timeout.
    if (section === 'general') {
      const orgSets = [], orgVals = [];
      if (typeof body.is_active === 'boolean') { orgSets.push('is_active = ?'); orgVals.push(body.is_active ? 1 : 0); }
      if (typeof body.name === 'string' && body.name.trim()) { orgSets.push('name = ?'); orgVals.push(body.name.trim()); }
      if (body.session_timeout_minutes != null && body.session_timeout_minutes !== '') {
        orgSets.push('session_timeout_minutes = ?'); orgVals.push(Number(body.session_timeout_minutes));
      }
      if (orgSets.length) { orgVals.push(orgId); await pool.execute(`UPDATE organisations SET ${orgSets.join(', ')} WHERE id = ?`, orgVals); }
    }

    const sets = [], vals = [];
    for (const col of allowed) {
      if (!(col in body)) continue;
      let v = body[col];
      if (BOOL_COLUMNS.has(col)) v = v ? 1 : 0;
      sets.push(`${col} = ?`);
      vals.push(v === '' ? null : v);
    }
    if (sets.length) {
      vals.push(orgId);
      await pool.execute(`UPDATE division_parameters SET ${sets.join(', ')} WHERE org_id = ?`, vals);
    }
    const [[params]] = await pool.execute('SELECT * FROM division_parameters WHERE org_id = ?', [orgId]);
    const [[org]] = await pool.execute('SELECT id, name, is_active, session_timeout_minutes FROM organisations WHERE id = ?', [orgId]);
    res.json({ ok: true, params, org });
  } catch (err) {
    console.error('PUT /division-parameters/:orgId/save/:section error:', err);
    res.status(500).json({ error: `Failed to save ${section}` });
  }
});

// ── Custom client fields (Case / AE / PC) — ride field_setup, capped at 10 ──
router.get('/division-parameters/:orgId/client-fields/:kind', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const orgId = Number(req.params.orgId);
  if (!assertOrgAccess(req, orgId)) return res.status(403).json({ error: 'Forbidden' });
  const section = CLIENT_FIELD_SECTIONS[req.params.kind];
  if (!section) return res.status(400).json({ error: 'Unknown field kind' });
  try {
    const [rows] = await pool.execute(
      `SELECT id, field_name, field_type, default_value, sort_order
         FROM field_setup WHERE section_name = ? AND org_id = ? ORDER BY sort_order`,
      [section, orgId]
    );
    res.json({ fields: rows, max: CLIENT_FIELD_MAX });
  } catch (err) {
    console.error('GET client-fields error:', err);
    res.status(500).json({ error: 'Failed to load client fields' });
  }
});

router.put('/division-parameters/:orgId/client-fields/:kind', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const orgId = Number(req.params.orgId);
  if (!assertOrgAccess(req, orgId)) return res.status(403).json({ error: 'Forbidden' });
  const section = CLIENT_FIELD_SECTIONS[req.params.kind];
  if (!section) return res.status(400).json({ error: 'Unknown field kind' });
  const fields = Array.isArray(req.body?.fields) ? req.body.fields.slice(0, CLIENT_FIELD_MAX) : [];
  for (const f of fields) {
    if (!f.field_name || !String(f.field_name).trim()) return res.status(400).json({ error: 'Each field needs a name' });
    if (!CLIENT_FIELD_TYPES.has(f.field_type)) return res.status(400).json({ error: `Invalid field type: ${f.field_type}` });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Replace-all strategy: clear this org's rows for the section, then re-insert.
    await conn.execute('DELETE FROM field_setup WHERE section_name = ? AND org_id = ?', [section, orgId]);
    let i = 0;
    for (const f of fields) {
      await conn.execute(
        `INSERT INTO field_setup (section_name, field_name, field_type, default_value, org_id, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [section, String(f.field_name).trim(), f.field_type, f.default_value || null, orgId, i++]
      );
    }
    await conn.commit();
    res.json({ ok: true, count: fields.length });
  } catch (err) {
    await conn.rollback();
    console.error('PUT client-fields error:', err);
    res.status(500).json({ error: 'Failed to save client fields' });
  } finally {
    conn.release();
  }
});

// ── PUT /division-parameters/:orgId/users — set assigned users ──────────────
router.put('/division-parameters/:orgId/users', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const orgId = Number(req.params.orgId);
  if (!assertOrgAccess(req, orgId)) return res.status(403).json({ error: 'Forbidden' });
  const userIds = Array.isArray(req.body?.user_ids) ? req.body.user_ids.map(Number).filter(Boolean) : [];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Deactivate everyone currently assigned but not in the new set.
    await conn.execute(
      `UPDATE user_org_access SET is_active = 0
        WHERE org_id = ? AND is_active = 1 ${userIds.length ? `AND user_id NOT IN (${userIds.map(() => '?').join(',')})` : ''}`,
      userIds.length ? [orgId, ...userIds] : [orgId]
    );
    // Upsert each selected user as active.
    for (const uid of userIds) {
      await conn.execute(
        `INSERT INTO user_org_access (user_id, org_id, is_active) VALUES (?, ?, 1)
           ON DUPLICATE KEY UPDATE is_active = 1`,
        [uid, orgId]
      );
    }
    await conn.commit();
    res.json({ ok: true, assigned_count: userIds.length });
  } catch (err) {
    await conn.rollback();
    console.error('PUT /division-parameters/:orgId/users error:', err);
    res.status(500).json({ error: 'Failed to save user assignments' });
  } finally {
    conn.release();
  }
});

// ── POST /division-parameters/:orgId/activate ───────────────────────────────
router.post('/division-parameters/:orgId/activate', authenticate, requireRole('platform_admin'), async (req, res) => {
  const orgId = Number(req.params.orgId);
  try {
    await ensureRow(orgId);
    const [[{ cnt }]] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM user_org_access WHERE org_id = ? AND is_active = 1', [orgId]
    );
    if (cnt === 0) return res.status(422).json({ error: 'Cannot activate a division with no assigned users' });
    await pool.execute(
      `UPDATE division_parameters SET config_status = 'active', needs_review = 0 WHERE org_id = ?`, [orgId]
    );
    res.json({ ok: true, config_status: 'active' });
  } catch (err) {
    console.error('POST /division-parameters/:orgId/activate error:', err);
    res.status(500).json({ error: 'Failed to activate division' });
  }
});

module.exports = router;
