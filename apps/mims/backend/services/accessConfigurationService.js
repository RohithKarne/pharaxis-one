'use strict';

const pool = require('../database/db');
const { hasGlobalAdminScope } = require('../utils/adminScope');
const {
  getOrgSsoPolicy,
  normalizeLoginMode,
  saveOrgSsoPolicy,
} = require('./ssoService');

const MODULE_CATALOG = [
  ['mims_core', 'MIMS Core'],
  ['inbox', 'Inbox'],
  ['case_mgmt', 'Case Management'],
  ['case_query', 'Case Query'],
  ['utilities', 'Utilities'],
  ['transmissions', 'Transmissions'],
  ['browse_content', 'Browse Content'],
  ['analytics', 'Analytics'],
  ['user_mgmt', 'User Management'],
  ['admin_console', 'Admin Console'],
  ['content_mgmt', 'Content Management'],
  ['data_visualization', 'Data Visualization'],
  ['reports', 'Reports'],
];

const GROUP_TEMPLATES = [
  {
    key: 'mims_admin',
    name: 'MIMS Administrator',
    role: 'admin',
    description: 'Tenant administrator with access configuration, reports, content, and case oversight.',
    privileges: ['admin.access.manage', 'admin.access.approve', 'case.create', 'case.update', 'case.review', 'case.close', 'case.reopen', 'case.assign', 'case.bulk_action', 'case.export', 'case.unmask', 'transmission.create', 'transmission.approve', 'content.author', 'content.review', 'content.approve', 'content.publish', 'reports.view', 'reports.manage', 'reports.export'],
  },
  {
    key: 'mi_agent',
    name: 'MI Agent',
    role: 'agent',
    description: 'Medical information user for intake, case creation, updates, correspondence, and transmission preparation.',
    privileges: ['case.create', 'case.update', 'case.assign', 'transmission.create', 'reports.view'],
  },
  {
    key: 'reviewer',
    name: 'Reviewer',
    role: 'reviewer',
    description: 'Reviewer with case review, close, controlled exports, and report visibility.',
    privileges: ['case.review', 'case.close', 'case.export', 'transmission.approve', 'content.review', 'reports.view', 'reports.export'],
  },
  {
    key: 'manager',
    name: 'Manager',
    role: 'admin',
    description: 'Operational manager with override, reopen, bulk action, unmask, export, and approval capabilities.',
    privileges: ['case.review', 'case.close', 'case.reopen', 'case.assign', 'case.bulk_action', 'case.export', 'case.unmask', 'transmission.approve', 'reports.view', 'reports.export'],
  },
  {
    key: 'content_manager',
    name: 'Content Manager',
    role: 'content_manager',
    description: 'Content lifecycle user for authoring and review activities.',
    privileges: ['content.author', 'content.review', 'reports.view'],
  },
  {
    key: 'readonly_auditor',
    name: 'Read-only Auditor',
    role: 'reviewer',
    description: 'Read-only inspection support with reports and audit visibility, no mutation privileges.',
    privileges: ['reports.view'],
  },
];

function parseJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function toJson(value, fallback = null) {
  return JSON.stringify(value === undefined ? fallback : value);
}

function normalizeBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback ? 1 : 0;
  return value ? 1 : 0;
}

function normalizeOrgId(req, providedOrgId = null) {
  if (hasGlobalAdminScope(req.user)) return Number(providedOrgId || req.user.orgId || 0) || null;
  return Number(req.user?.orgId || 0) || null;
}

async function auditAccessChange({ userId, userName, action, entity, entityId, details, before = null, after = null, reason = null }) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details, before_value, after_value, change_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        userName || null,
        action,
        entity,
        entityId || null,
        toJson(details || {}, {}),
        before ? toJson(before, {}) : null,
        after ? toJson(after, {}) : null,
        reason || null,
      ]
    );
  } catch (_) {}
}

async function getPrivilegeCatalog(orgId = null) {
  const [rows] = await pool.execute(
    `SELECT * FROM access_activity_privileges
     WHERE is_active = 1 AND (org_id IS NULL OR org_id = ?)
     ORDER BY category ASC, label ASC`,
    [orgId || 0]
  );
  const byKey = new Map();
  for (const row of rows) byKey.set(row.privilege_key, row);
  return Array.from(byKey.values()).map((row) => ({
    ...row,
    is_sensitive: !!row.is_sensitive,
    default_allowed_roles: parseJson(row.default_allowed_roles, []),
  }));
}

async function getRolePermissions() {
  const [rows] = await pool.execute('SELECT role, module, can_access FROM role_permissions ORDER BY role, module');
  return rows.map((row) => ({ ...row, can_access: !!row.can_access }));
}

async function getAccessGroups(orgId, includeInactive = true) {
  const params = orgId ? [orgId] : [];
  const [rows] = await pool.execute(
    `SELECT sg.*, COUNT(sgu.user_id) AS user_count
     FROM security_groups sg
     LEFT JOIN security_group_users sgu ON sgu.group_id = sg.id
     ${orgId ? 'WHERE (sg.org_id = ? OR sg.org_id IS NULL)' : ''}
     ${includeInactive ? '' : (orgId ? 'AND' : 'WHERE') + ' sg.is_active = 1'}
     GROUP BY sg.id
     ORDER BY sg.is_template DESC, sg.name ASC`,
    params
  );

  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(',');
  const [privRows] = await pool.execute(
    `SELECT group_id, privilege_key, is_allowed FROM access_group_privileges WHERE group_id IN (${placeholders})`,
    ids
  );
  const privilegesByGroup = new Map();
  for (const row of privRows) {
    if (!privilegesByGroup.has(row.group_id)) privilegesByGroup.set(row.group_id, []);
    if (row.is_allowed) privilegesByGroup.get(row.group_id).push(row.privilege_key);
  }

  return rows.map((row) => ({
    ...row,
    privileges: parseJson(row.privileges, {}),
    privilege_keys: privilegesByGroup.get(row.id) || [],
    is_active: !!row.is_active,
    is_template: !!row.is_template,
    applies_to_mobile: !!row.applies_to_mobile,
    requires_approval: !!row.requires_approval,
    user_count: Number(row.user_count || 0),
  }));
}

async function getGroupMembers(groupId) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.name, u.email, u.role, u.is_active, sgu.id AS membership_id
     FROM security_group_users sgu
     JOIN users u ON u.id = sgu.user_id
     WHERE sgu.group_id = ?
     ORDER BY u.name ASC`,
    [groupId]
  );
  return rows;
}

async function getGroupPrivileges(groupId, orgId = null, allowGlobal = false) {
  const params = [groupId];
  let orgClause = '';
  if (orgId && !allowGlobal) {
    orgClause = 'AND org_id = ?';
    params.push(orgId);
  } else if (orgId && allowGlobal) {
    orgClause = 'AND (org_id = ? OR org_id IS NULL)';
    params.push(orgId);
  }
  const [[group]] = await pool.execute(`SELECT * FROM security_groups WHERE id = ? ${orgClause} LIMIT 1`, params);
  if (!group) return null;
  const [rows] = await pool.execute(
    'SELECT privilege_key, is_allowed FROM access_group_privileges WHERE group_id = ? ORDER BY privilege_key',
    [groupId]
  );
  return {
    group: { ...group, privileges: parseJson(group.privileges, {}) },
    privilege_keys: rows.filter((row) => row.is_allowed).map((row) => row.privilege_key),
    rows,
  };
}

async function setGroupPrivileges({ groupId, privilegeKeys, userId, orgId = null, allowGlobal = false, reason = null }) {
  const before = await getGroupPrivileges(groupId, orgId, allowGlobal);
  if (!before) throw new Error('Security group not found.');
  const keys = Array.from(new Set((privilegeKeys || []).map((key) => String(key || '').trim()).filter(Boolean)));
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM access_group_privileges WHERE group_id = ?', [groupId]);
    for (const key of keys) {
      await conn.execute(
        `INSERT INTO access_group_privileges (group_id, privilege_key, is_allowed, updated_by)
         VALUES (?, ?, 1, ?)`,
        [groupId, key, userId || null]
      );
    }
    const legacyPrivileges = keys.reduce((acc, key) => { acc[key] = true; return acc; }, {});
    await conn.execute(
      'UPDATE security_groups SET privileges = ?, updated_by = ?, updated_at = NOW() WHERE id = ?',
      [toJson(legacyPrivileges, {}), userId || null, groupId]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  const after = await getGroupPrivileges(groupId, orgId, allowGlobal);
  await auditAccessChange({
    userId,
    action: 'UPDATE_PRIVILEGES',
    entity: 'security_group',
    entityId: groupId,
    details: { privilege_keys: keys },
    before,
    after,
    reason,
  });
  return after;
}

async function seedAccessTemplates(orgId, userId) {
  if (!orgId) throw new Error('org_id is required.');
  const created = [];
  for (const template of GROUP_TEMPLATES) {
    const [[existing]] = await pool.execute(
      'SELECT id FROM security_groups WHERE org_id = ? AND template_key = ? LIMIT 1',
      [orgId, template.key]
    );
    let groupId = existing?.id;
    if (!groupId) {
      const [result] = await pool.execute(
        `INSERT INTO security_groups
           (name, description, privileges, org_id, created_by, group_type, template_key, is_template, requires_approval)
         VALUES (?, ?, ?, ?, ?, 'medinquirer_user', ?, 1, ?)`,
        [`${template.name} - Org ${orgId}`, template.description, toJson({}, {}), orgId, userId || null, template.key, template.privileges.some((key) => key.includes('approve') || key.includes('unmask') || key.includes('manage')) ? 1 : 0]
      );
      groupId = result.insertId;
    }
    await setGroupPrivileges({ groupId, privilegeKeys: template.privileges, userId, orgId, reason: 'Seed enterprise access template' });
    created.push({ group_id: groupId, template_key: template.key, name: template.name });
  }
  return created;
}

async function getAccessUsers(orgId) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.name, u.email, u.role, u.is_active, u.failed_login_attempts, u.locked_until,
            u.password_reset_required, uoa.org_id, uoa.primary_site_id, uoa.role_at_org, uoa.site_permission,
            uoa.site_access_scope, uoa.access_expires_at, uoa.last_accessed_at, s.name AS primary_site_name,
            GROUP_CONCAT(DISTINCT sg.name ORDER BY sg.name SEPARATOR ', ') AS group_names
     FROM users u
     JOIN user_org_access uoa ON uoa.user_id = u.id
     LEFT JOIN sites s ON s.id = uoa.primary_site_id
     LEFT JOIN security_group_users sgu ON sgu.user_id = u.id
     LEFT JOIN security_groups sg ON sg.id = sgu.group_id AND (sg.org_id = uoa.org_id OR sg.org_id IS NULL)
     WHERE uoa.org_id = ?
     GROUP BY u.id, uoa.org_id, uoa.primary_site_id, uoa.role_at_org, uoa.site_permission, uoa.site_access_scope,
              uoa.access_expires_at, uoa.last_accessed_at, s.name
     ORDER BY u.name ASC`,
    [orgId]
  );
  return rows.map((row) => ({
    ...row,
    groups: row.group_names || '',
    is_active: !!row.is_active,
    password_reset_required: !!row.password_reset_required,
  }));
}

async function getAccessSites(orgId) {
  const [rows] = await pool.execute(
    `SELECT s.*, sc.allowed_countries, sc.allowed_product_family_ids, sc.allowed_product_ids,
            sc.default_country_for_case, sc.contact_integration_enabled, sc.dppr_disabled,
            sc.right_to_forget_enabled, sc.right_to_forget_countries,
            COUNT(DISTINCT usa.user_id) AS assigned_user_count
     FROM sites s
     LEFT JOIN site_config sc ON sc.site_id = s.id
     LEFT JOIN user_site_access usa ON usa.site_id = s.id AND usa.is_active = 1
     WHERE s.org_id = ?
     GROUP BY s.id
     ORDER BY s.is_primary DESC, s.name ASC`,
    [orgId]
  );
  return rows.map((row) => ({
    ...row,
    is_primary: !!row.is_primary,
    is_active: !!row.is_active,
    is_finalized: !!row.is_finalized,
    contact_integration_enabled: !!row.contact_integration_enabled,
    dppr_disabled: !!row.dppr_disabled,
    right_to_forget_enabled: !!row.right_to_forget_enabled,
    allowed_countries: parseJson(row.allowed_countries, []),
    allowed_product_family_ids: parseJson(row.allowed_product_family_ids, []),
    allowed_product_ids: parseJson(row.allowed_product_ids, []),
    right_to_forget_countries: parseJson(row.right_to_forget_countries, []),
    assigned_user_count: Number(row.assigned_user_count || 0),
  }));
}

async function getSiteAccess(orgId) {
  const [rows] = await pool.execute(
    `SELECT usa.*, u.name AS user_name, u.email, s.name AS site_name, s.country
     FROM user_site_access usa
     JOIN users u ON u.id = usa.user_id
     JOIN sites s ON s.id = usa.site_id
     WHERE usa.org_id = ?
     ORDER BY u.name ASC, usa.is_primary DESC, s.name ASC`,
    [orgId]
  );
  return rows.map((row) => ({ ...row, is_primary: !!row.is_primary, is_active: !!row.is_active }));
}

async function upsertSiteAccess({ orgId, userId, siteId, accessLevel = 'full', isPrimary = false, isActive = true, actorId = null, reason = null }) {
  if (!orgId || !userId || !siteId) throw new Error('org_id, user_id, and site_id are required.');
  const [[before]] = await pool.execute(
    'SELECT * FROM user_site_access WHERE org_id = ? AND user_id = ? AND site_id = ? LIMIT 1',
    [orgId, userId, siteId]
  );
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (isPrimary) {
      await conn.execute('UPDATE user_site_access SET is_primary = 0 WHERE org_id = ? AND user_id = ?', [orgId, userId]);
      await conn.execute('UPDATE user_org_access SET primary_site_id = ? WHERE org_id = ? AND user_id = ?', [siteId, orgId, userId]);
    }
    await conn.execute(
      `INSERT INTO user_site_access (org_id, user_id, site_id, access_level, is_primary, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE access_level = VALUES(access_level), is_primary = VALUES(is_primary),
         is_active = VALUES(is_active), updated_by = VALUES(updated_by), updated_at = NOW()`,
      [orgId, userId, siteId, accessLevel, normalizeBool(isPrimary), normalizeBool(isActive, true), actorId, actorId]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  const [[after]] = await pool.execute(
    'SELECT * FROM user_site_access WHERE org_id = ? AND user_id = ? AND site_id = ? LIMIT 1',
    [orgId, userId, siteId]
  );
  await auditAccessChange({ userId: actorId, action: before ? 'UPDATE_SITE_ACCESS' : 'CREATE_SITE_ACCESS', entity: 'user_site_access', entityId: after?.id, details: { orgId, userId, siteId }, before, after, reason });
  return after;
}

async function deleteSiteAccess(orgId, accessId, actorId = null, reason = null) {
  const [[before]] = await pool.execute('SELECT * FROM user_site_access WHERE id = ? AND org_id = ? LIMIT 1', [accessId, orgId]);
  if (!before) throw new Error('Site access row not found.');
  await pool.execute('UPDATE user_site_access SET is_active = 0, updated_by = ?, updated_at = NOW() WHERE id = ? AND org_id = ?', [actorId || null, accessId, orgId]);
  await auditAccessChange({ userId: actorId, action: 'DEACTIVATE_SITE_ACCESS', entity: 'user_site_access', entityId: accessId, details: { orgId }, before, after: { ...before, is_active: 0 }, reason });
}

async function getSiteRules(orgId, siteId = null) {
  const params = [orgId];
  let where = 'org_id = ?';
  if (siteId) { where += ' AND site_id = ?'; params.push(Number(siteId)); }
  const [rows] = await pool.execute(
    `SELECT * FROM site_access_rules WHERE ${where} ORDER BY site_id, rule_type, rule_value`,
    params
  );
  return rows.map((row) => ({ ...row, is_active: !!row.is_active, metadata: parseJson(row.metadata, {}) }));
}

async function replaceSiteRules({ orgId, siteId, rules = [], actorId = null, reason = null }) {
  if (!orgId || !siteId) throw new Error('org_id and site_id are required.');
  const before = await getSiteRules(orgId, siteId);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute('DELETE FROM site_access_rules WHERE org_id = ? AND site_id = ?', [orgId, siteId]);
    for (const rule of rules || []) {
      if (!rule.rule_type || !rule.rule_value) continue;
      await conn.execute(
        `INSERT INTO site_access_rules (org_id, site_id, rule_type, rule_value, is_active, metadata, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orgId, siteId, String(rule.rule_type), String(rule.rule_value), normalizeBool(rule.is_active, true), toJson(rule.metadata || {}, {}), actorId]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  const after = await getSiteRules(orgId, siteId);
  await auditAccessChange({ userId: actorId, action: 'REPLACE_SITE_RULES', entity: 'site_access_rules', entityId: siteId, details: { orgId, siteId }, before, after, reason });
  return after;
}

async function getAuthPolicy(orgId) {
  const [[org]] = await pool.execute(
    `SELECT id, name, session_timeout_minutes, two_factor_enabled, two_factor_methods, two_factor_remember_days, login_mode
     FROM organisations WHERE id = ? LIMIT 1`,
    [orgId]
  );
  const ssoPolicy = await getOrgSsoPolicy(orgId);
  const loginMode = normalizeLoginMode(org?.login_mode);
  const providers = Array.isArray(ssoPolicy?.providers) ? ssoPolicy.providers : [];
  return {
    org: org ? {
      ...org,
      login_mode: loginMode,
      local_login_allowed: loginMode !== 'sso_only',
      sso_login_allowed: loginMode !== 'local_only',
    } : null,
    providers,
    sso: {
      login_mode: loginMode,
      local_login_allowed: loginMode !== 'sso_only',
      sso_login_allowed: loginMode !== 'local_only',
      providers,
    },
  };
}

async function saveAuthPolicy(orgId, payload = {}, actorId = null, reason = null) {
  const before = await getAuthPolicy(orgId);
  const timeout = Math.max(15, Math.min(720, Number(payload.session_timeout_minutes || before.org?.session_timeout_minutes || 30)));
  const rememberDays = Math.max(0, Math.min(90, Number(payload.two_factor_remember_days ?? before.org?.two_factor_remember_days ?? 7)));
  const loginMode = normalizeLoginMode(payload.login_mode || before.org?.login_mode);
  await pool.execute(
    `UPDATE organisations
     SET session_timeout_minutes = ?, two_factor_enabled = ?, two_factor_methods = ?, two_factor_remember_days = ?, login_mode = ?, updated_at = NOW()
     WHERE id = ?`,
    [
      timeout,
      normalizeBool(payload.two_factor_enabled, !!before.org?.two_factor_enabled),
      String(payload.two_factor_methods || before.org?.two_factor_methods || 'email,totp'),
      rememberDays,
      loginMode,
      orgId,
    ]
  );
  await saveOrgSsoPolicy(orgId, {
    login_mode: loginMode,
    providers: Array.isArray(payload.providers) ? payload.providers : [],
  }, actorId);
  const after = await getAuthPolicy(orgId);
  await auditAccessChange({ userId: actorId, action: 'UPDATE_AUTH_POLICY', entity: 'access_auth_policy', entityId: orgId, details: { orgId }, before, after, reason });
  return after;
}

async function listAccessRequests(orgId, status = null) {
  const params = [orgId];
  let where = 'acr.org_id = ?';
  if (status) { where += ' AND acr.status = ?'; params.push(status); }
  const [rows] = await pool.execute(
    `SELECT acr.*, requester.name AS requester_name, reviewer.name AS reviewer_name
     FROM access_change_requests acr
     LEFT JOIN users requester ON requester.id = acr.requested_by
     LEFT JOIN users reviewer ON reviewer.id = acr.reviewed_by
     WHERE ${where}
     ORDER BY acr.created_at DESC
     LIMIT 200`,
    params
  );
  return rows.map((row) => ({ ...row, payload: parseJson(row.payload_json, {}), e_signature_required: !!row.e_signature_required }));
}

async function createAccessRequest({ orgId, requestedBy, targetType, targetId = null, action, payload = {}, reason = null, eSignatureRequired = false }) {
  const [result] = await pool.execute(
    `INSERT INTO access_change_requests
       (org_id, requested_by, target_type, target_id, action, payload_json, reason, e_signature_required)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [orgId, requestedBy, targetType, targetId, action, toJson(payload, {}), reason, normalizeBool(eSignatureRequired)]
  );
  return result.insertId;
}

async function reviewAccessRequest({ orgId, requestId, reviewerId, status, note = null }) {
  if (!['approved', 'rejected'].includes(status)) throw new Error('status must be approved or rejected.');
  const [[before]] = await pool.execute('SELECT * FROM access_change_requests WHERE id = ? AND org_id = ? LIMIT 1', [requestId, orgId]);
  if (!before) throw new Error('Access request not found.');
  await pool.execute(
    `UPDATE access_change_requests
     SET status = ?, reviewed_by = ?, reviewed_at = NOW(), review_note = ?, updated_at = NOW()
     WHERE id = ? AND org_id = ?`,
    [status, reviewerId, note || null, requestId, orgId]
  );
  const [[after]] = await pool.execute('SELECT * FROM access_change_requests WHERE id = ? AND org_id = ? LIMIT 1', [requestId, orgId]);
  await auditAccessChange({ userId: reviewerId, action: status === 'approved' ? 'APPROVE_ACCESS_REQUEST' : 'REJECT_ACCESS_REQUEST', entity: 'access_change_request', entityId: requestId, details: { status, note }, before, after, reason: note });
  return after;
}

async function getSodRules(orgId) {
  const [rows] = await pool.execute(
    `SELECT * FROM access_sod_rules
     WHERE org_id IS NULL OR org_id = ?
     ORDER BY severity DESC, rule_key ASC`,
    [orgId]
  );
  return rows.map((row) => ({ ...row, is_active: !!row.is_active }));
}

async function validateAccessConfiguration(orgId) {
  const issues = [];
  const authPolicy = await getAuthPolicy(orgId);
  if (!authPolicy.org?.two_factor_enabled) {
    issues.push({ severity: 'warning', type: 'mfa_not_required', message: 'MFA is not required for this organisation.' });
  }
  const loginMode = normalizeLoginMode(authPolicy.org?.login_mode);
  const activeProviders = (authPolicy.providers || []).filter((provider) => provider.is_active && provider.configured);
  if (loginMode === 'sso_only' && activeProviders.length === 0) {
    issues.push({ severity: 'critical', type: 'sso_only_without_provider', message: 'Organisation is configured for SSO-only login, but no active SSO provider is fully configured.' });
  }
  if (loginMode === 'local_and_sso' && activeProviders.length === 0) {
    issues.push({ severity: 'warning', type: 'hybrid_without_provider', message: 'Organisation allows SSO, but no active Google or Microsoft provider is fully configured yet.' });
  }
  const [usersWithoutPrimarySite] = await pool.execute(
    `SELECT u.id, u.name, u.email FROM users u
     JOIN user_org_access uoa ON uoa.user_id = u.id
     WHERE uoa.org_id = ? AND uoa.is_active = 1 AND uoa.primary_site_id IS NULL`,
    [orgId]
  );
  usersWithoutPrimarySite.forEach((user) => issues.push({ severity: 'warning', type: 'missing_primary_site', message: `${user.email} has no primary site.`, entity_id: user.id }));
  const groups = await getAccessGroups(orgId, false);
  groups.filter((group) => !group.privilege_keys.length).forEach((group) => {
    issues.push({ severity: 'warning', type: 'group_without_privileges', message: `${group.name} has no activity privileges configured.`, entity_id: group.id });
  });
  const sodRules = await getSodRules(orgId);
  for (const group of groups) {
    const keys = new Set(group.privilege_keys || []);
    for (const rule of sodRules.filter((item) => item.is_active)) {
      if (keys.has(rule.first_privilege) && keys.has(rule.conflicting_privilege)) {
        issues.push({ severity: rule.severity || 'warning', type: 'sod_conflict', message: `${group.name} has conflicting privileges: ${rule.first_privilege} and ${rule.conflicting_privilege}.`, entity_id: group.id });
      }
    }
  }
  return { issues, checked_at: new Date().toISOString() };
}

async function createAccessReviewSnapshot(orgId, userId, name = null) {
  const snapshot = {
    created_at: new Date().toISOString(),
    users: await getAccessUsers(orgId),
    sites: await getAccessSites(orgId),
    site_access: await getSiteAccess(orgId),
    groups: await getAccessGroups(orgId, true),
    validation: await validateAccessConfiguration(orgId),
  };
  const snapshotName = name || `Access Review ${new Date().toISOString().slice(0, 10)}`;
  const [result] = await pool.execute(
    'INSERT INTO access_review_snapshots (org_id, snapshot_name, snapshot_json, created_by) VALUES (?, ?, ?, ?)',
    [orgId, snapshotName, toJson(snapshot, {}), userId || null]
  );
  return { id: result.insertId, snapshot_name: snapshotName, snapshot };
}

async function listAccessReviewSnapshots(orgId) {
  const [rows] = await pool.execute(
    `SELECT id, snapshot_name, created_by, created_at FROM access_review_snapshots
     WHERE org_id = ? ORDER BY created_at DESC LIMIT 50`,
    [orgId]
  );
  return rows;
}

async function getOverview(orgId) {
  const [users, sites, siteAccess, groups, privileges, rolePermissions, requests, authPolicy, validation] = await Promise.all([
    getAccessUsers(orgId),
    getAccessSites(orgId),
    getSiteAccess(orgId),
    getAccessGroups(orgId, true),
    getPrivilegeCatalog(orgId),
    getRolePermissions(),
    listAccessRequests(orgId),
    getAuthPolicy(orgId),
    validateAccessConfiguration(orgId),
  ]);
  return {
    summary: {
      users: users.length,
      active_users: users.filter((user) => user.is_active).length,
      sites: sites.length,
      groups: groups.length,
      pending_requests: requests.filter((request) => request.status === 'pending').length,
      validation_issues: validation.issues.length,
    },
    users,
    sites,
    site_access: siteAccess,
    groups,
    privileges,
    role_permissions: rolePermissions,
    requests,
    auth_policy: authPolicy,
    validation,
    modules: MODULE_CATALOG.map(([key, label]) => ({ key, label })),
    templates: GROUP_TEMPLATES,
  };
}

async function resolveEffectivePrivileges(userId, orgId) {
  const [[access]] = await pool.execute(
    `SELECT u.id, u.name, u.email, u.role, uoa.role_at_org
     FROM users u
     JOIN user_org_access uoa ON uoa.user_id = u.id
     WHERE u.id = ? AND uoa.org_id = ? AND uoa.is_active = 1
     LIMIT 1`,
    [userId, orgId]
  );
  if (!access) return null;
  const [moduleRows] = await pool.execute(
    `SELECT DISTINCT rp.module
     FROM role_permissions rp
     WHERE rp.role = ? AND rp.can_access = 1
     UNION
     SELECT ump.module FROM user_module_permissions ump WHERE ump.user_id = ? AND ump.can_access = 1`,
    [access.role_at_org || access.role, userId]
  );
  const [privRows] = await pool.execute(
    `SELECT DISTINCT agp.privilege_key
     FROM security_group_users sgu
     JOIN security_groups sg ON sg.id = sgu.group_id AND sg.is_active = 1
     JOIN access_group_privileges agp ON agp.group_id = sg.id AND agp.is_allowed = 1
     WHERE sgu.user_id = ? AND (sg.org_id = ? OR sg.org_id IS NULL)`,
    [userId, orgId]
  );
  return {
    user: access,
    modules: moduleRows.map((row) => row.module),
    privileges: privRows.map((row) => row.privilege_key),
  };
}

async function userHasActivityPrivilege(user, privilegeKey) {
  if (!user || !privilegeKey) return false;
  if (hasGlobalAdminScope(user)) return true;
  if (user.role === 'admin' && String(privilegeKey).startsWith('admin.')) return true;
  if (!user.orgId) return false;
  const effective = await resolveEffectivePrivileges(user.userId, user.orgId);
  if (effective?.privileges?.includes(privilegeKey)) return true;
  const catalog = await getPrivilegeCatalog(user.orgId);
  const privilege = catalog.find((item) => item.privilege_key === privilegeKey);
  return privilege?.default_allowed_roles?.includes(user.role) || false;
}

module.exports = {
  MODULE_CATALOG,
  GROUP_TEMPLATES,
  normalizeOrgId,
  getPrivilegeCatalog,
  getRolePermissions,
  getAccessGroups,
  getGroupMembers,
  getGroupPrivileges,
  setGroupPrivileges,
  seedAccessTemplates,
  getAccessUsers,
  getAccessSites,
  getSiteAccess,
  upsertSiteAccess,
  deleteSiteAccess,
  getSiteRules,
  replaceSiteRules,
  getAuthPolicy,
  saveAuthPolicy,
  listAccessRequests,
  createAccessRequest,
  reviewAccessRequest,
  getSodRules,
  validateAccessConfiguration,
  createAccessReviewSnapshot,
  listAccessReviewSnapshots,
  getOverview,
  resolveEffectivePrivileges,
  userHasActivityPrivilege,
  auditAccessChange,
};
