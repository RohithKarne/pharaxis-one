'use strict';

/**
 * admin/securityGroups.js — Security Groups (RBAC) API
 * Manages groups with privilege matrices and user assignments.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validate');
const { hasGlobalAdminScope } = require('../../utils/adminScope');

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

function parsePrivileges(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return {};
  }
}

function normalizeTenantIds(privileges) {
  const ids = privileges?.details?.tenant_ids;
  if (!Array.isArray(ids)) return [];
  return ids
    .map(id => Number(id))
    .filter(id => Number.isFinite(id) && id > 0);
}

function groupVisibleToRequest(group, req) {
  if (!group) return false;
  if (hasGlobalAdminScope(req.user)) return true;
  if (Number(group.org_id) === Number(req.user.orgId)) return true;
  const tenantIds = normalizeTenantIds(parsePrivileges(group.privileges));
  return tenantIds.includes(Number(req.user.orgId));
}

function mergeSystemOptions(groups) {
  return mergeBooleanOptions(groups, 'system_options');
}

function mergeCaseOptions(groups) {
  return mergeBooleanOptions(groups, 'case_options');
}

function mergeBooleanOptions(groups, key) {
  const merged = {};
  for (const group of groups) {
    const privileges = parsePrivileges(group.privileges);
    const optionSet = privileges[key] || {};
    for (const [sectionKey, options] of Object.entries(optionSet)) {
      if (!merged[sectionKey]) merged[sectionKey] = {};
      for (const [optionKey, value] of Object.entries(options || {})) {
        merged[sectionKey][optionKey] = Boolean(merged[sectionKey][optionKey] || value);
      }
    }
  }
  return merged;
}

function hasConfiguredOptionSet(groups, key) {
  return groups.some(group => {
    const optionSet = parsePrivileges(group.privileges)?.[key];
    if (!optionSet || typeof optionSet !== 'object') return false;
    return Object.values(optionSet).some(options => (
      options && typeof options === 'object' && Object.keys(options).length > 0
    ));
  });
}

async function loadPicklistChoices(req, names) {
  const lowerNames = names.map(name => String(name).toLowerCase());
  const placeholders = lowerNames.map(() => '?').join(', ');
  const params = [...lowerNames, ...lowerNames, ...lowerNames];
  const orgFilter = hasGlobalAdminScope(req.user) ? '' : 'AND p.org_id = ?';
  if (!hasGlobalAdminScope(req.user)) params.push(req.user.orgId);

  const [rows] = await pool.execute(
    `SELECT DISTINCT p.value, p.name, p.field_type, COALESCE(f.name, p.field_type) AS field_name, COALESCE(c.name, p.category) AS category
     FROM picklists p
     LEFT JOIN picklist_fields f ON f.id = p.field_id
     LEFT JOIN picklist_categories c ON c.id = f.category_id
     WHERE COALESCE(p.status, 'Active') != 'Inactive'
       AND (
         LOWER(COALESCE(f.name, p.field_type, '')) IN (${placeholders})
         OR LOWER(COALESCE(c.name, p.category, '')) IN (${placeholders})
         OR LOWER(COALESCE(p.field_type, '')) IN (${placeholders})
       )
       ${orgFilter}
     ORDER BY COALESCE(p.value, p.name) ASC`,
    params
  );

  return rows
    .map(row => ({
      value: row.value || row.name,
      label: row.value || row.name,
      field_name: row.field_name,
      category: row.category,
    }))
    .filter(row => row.value);
}

async function resolveScopedGroup(groupId, req) {
  const id = Number(groupId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const [[group]] = await pool.execute(
    'SELECT id, name, description, privileges, is_active, org_id FROM security_groups WHERE id = ?',
    [id]
  );
  if (!group || !groupVisibleToRequest(group, req)) return null;
  return group;
}

async function getActiveMemberDependency(groupId) {
  const [[countRow]] = await pool.execute(
    `SELECT COUNT(*) AS cnt
     FROM security_group_users sgu
     INNER JOIN users u ON u.id = sgu.user_id
     WHERE sgu.group_id = ? AND u.is_active = 1`,
    [groupId]
  );

  const [sampleRows] = await pool.execute(
    `SELECT u.id, u.name, u.email, u.role
     FROM security_group_users sgu
     INNER JOIN users u ON u.id = sgu.user_id
     WHERE sgu.group_id = ? AND u.is_active = 1
     ORDER BY u.name ASC, u.id ASC
     LIMIT 10`,
    [groupId]
  );

  return {
    active_member_count: Number(countRow?.cnt || 0),
    active_members_sample: sampleRows,
  };
}

// GET /api/admin/security-groups — list all groups
router.get('/security-groups', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const isSA = hasGlobalAdminScope(req.user);
    const [groups] = await pool.execute(
      `SELECT id, name, description, privileges, is_active, created_at, updated_at, org_id
       FROM security_groups
       ${isSA ? '' : 'WHERE org_id = ? OR org_id IS NULL'}
       ORDER BY name`,
      isSA ? [] : [req.user.orgId]
    );

    const parsed = groups.map(g => ({
      ...g,
      privileges: parsePrivileges(g.privileges),
    })).filter(g => groupVisibleToRequest(g, req));
    res.json({ groups: parsed });
  } catch (err) {
    console.error('GET /security-groups error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/security-groups/options — form reference data
router.get('/security-groups/options', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const [orgs] = await pool.execute(
      hasGlobalAdminScope(req.user)
        ? 'SELECT id, name, is_active FROM organisations ORDER BY name ASC'
        : 'SELECT id, name, is_active FROM organisations WHERE id = ? ORDER BY name ASC',
      hasGlobalAdminScope(req.user) ? [] : [req.user.orgId]
    );

    const [departments, callCenterLocations, callCenterTypes, generalTables] = await Promise.all([
      loadPicklistChoices(req, ['department', 'departments']),
      loadPicklistChoices(req, ['call center location', 'call_center_location', 'call center locations']),
      loadPicklistChoices(req, ['call center type', 'call_center_type', 'call center types']),
      loadPicklistChoices(req, ['tables general tables', 'general tables', 'table general tables']),
    ]);

    res.json({
      tenants: orgs,
      departments,
      call_center_locations: callCenterLocations,
      call_center_types: callCenterTypes,
      general_tables: generalTables,
    });
  } catch (err) {
    console.error('GET /security-groups/options error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/security-groups/effective — current user's group-derived privileges
router.get('/security-groups/effective', authenticate, requireOrg, async (req, res) => {
  try {
    if (hasGlobalAdminScope(req.user)) {
      // null privileges = unrestricted (capability checks pass for everything).
      return res.json({ unrestricted: true, groups: [], system_options: null, privileges: null });
    }

    const [groups] = await pool.execute(
      `SELECT DISTINCT sg.id, sg.name, sg.privileges, sg.org_id
       FROM security_groups sg
       LEFT JOIN security_group_users sgu ON sgu.group_id = sg.id AND sgu.user_id = ?
       LEFT JOIN users u ON u.id = ? AND u.security_group_id = sg.id
       WHERE sg.is_active = 1
         AND (sgu.id IS NOT NULL OR u.id IS NOT NULL)`,
      [req.user.userId, req.user.userId]
    );

    const visibleGroups = groups.filter(group => groupVisibleToRequest(group, req));
    const hasSystemOptions = hasConfiguredOptionSet(visibleGroups, 'system_options');
    const hasCaseOptions = hasConfiguredOptionSet(visibleGroups, 'case_options');

    // New capability model: surface the user's EFFECTIVE capability keys so the
    // frontend can hide/disable actions/menus they lack (server still enforces).
    // Must mirror backend userHasActivityPrivilege(): union of explicit group
    // grants AND capabilities whose default_allowed_roles include the user's role.
    // Without the role-default merge, role-based admins would be wrongly hidden.
    let privileges = [];
    try {
      const { resolveEffectivePrivileges, getPrivilegeCatalog } = require('../../services/accessConfigurationService');
      const eff = await resolveEffectivePrivileges(req.user.userId, req.user.orgId);
      const set = new Set(eff?.privileges || []);
      const catalog = await getPrivilegeCatalog(req.user.orgId);
      const role = String(req.user.role || '').toLowerCase();
      for (const cap of catalog) {
        const roles = (cap.default_allowed_roles || []).map(r => String(r).toLowerCase());
        if (roles.includes(role)) set.add(cap.privilege_key);
      }
      privileges = Array.from(set);
    } catch (err) {
      // Fail open: null = "not resolved", which the frontend treats as unrestricted
      // (don't hide actions; the server still enforces each one). An empty array
      // would instead hide every capability-gated control, including from admins.
      console.error('GET /security-groups/effective privilege resolution failed:', err);
      privileges = null;
    }

    res.json({
      unrestricted: visibleGroups.length === 0,
      groups: visibleGroups.map(group => ({ id: group.id, name: group.name })),
      system_options: hasSystemOptions ? mergeSystemOptions(visibleGroups) : null,
      case_options: hasCaseOptions ? mergeCaseOptions(visibleGroups) : null,
      privileges,
    });
  } catch (err) {
    console.error('GET /security-groups/effective error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/security-groups — create group
router.post('/security-groups', authenticate, requireRole('admin', 'platform_admin'), requireOrg, validate(schemas.createSecurityGroup), async (req, res) => {
  try {
    const { name, description, privileges } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required.' });
    }

    const privilegesJson = privileges !== undefined ? JSON.stringify(privileges) : null;
    const tenantIds = normalizeTenantIds(privileges);
    const orgId = hasGlobalAdminScope(req.user)
      ? (tenantIds.length === 1 ? tenantIds[0] : (req.body.org_id !== undefined ? Number(req.body.org_id) || null : null))
      : req.user.orgId;

    const [result] = await pool.execute(
      'INSERT INTO security_groups (name, description, privileges, created_by, org_id) VALUES (?, ?, ?, ?, ?)',
      [String(name).trim(), description || null, privilegesJson, req.user.userId, orgId]
    );

    await audit(req.user.userId, req.user.email, 'CREATE', 'security_group', result.insertId, {
      name: String(name).trim(),
      org_id: orgId,
    });

    const [[created]] = await pool.execute('SELECT * FROM security_groups WHERE id = ?', [result.insertId]);
    res.status(201).json({ message: 'Security group created.', id: result.insertId, group: created });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A security group with this name already exists.' });
    }
    console.error('POST /security-groups error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/security-groups/:id — get group with its users
router.get('/security-groups/:id', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const group = await resolveScopedGroup(req.params.id, req);
    if (!group) return res.status(404).json({ error: 'Security group not found.' });

    const [members] = await pool.execute(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, sgu.id AS membership_id
       FROM security_group_users sgu
       JOIN users u ON sgu.user_id = u.id
       WHERE sgu.group_id = ?
       ORDER BY u.name`,
      [group.id]
    );

    const parsed = {
      ...group,
      privileges: parsePrivileges(group.privileges),
    };

    res.json({ group: parsed, members });
  } catch (err) {
    console.error('GET /security-groups/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/security-groups/:id/audit — recent audit timeline for one group
router.get('/security-groups/:id/audit', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const group = await resolveScopedGroup(req.params.id, req);
    if (!group) return res.status(404).json({ error: 'Security group not found.' });

    const [rows] = await pool.execute(
      `SELECT user_name, action, details, created_at
       FROM audit_logs
       WHERE entity = 'security_group' AND entity_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
      [group.id]
    );

    const events = rows.map((row) => {
      let details = row.details;
      if (typeof details === 'string') {
        try { details = JSON.parse(details) } catch (_) {}
      }
      return { ...row, details: details || null };
    });

    res.json({ events });
  } catch (err) {
    console.error('GET /security-groups/:id/audit error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/security-groups/:id — update group
router.put('/security-groups/:id', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { name, description, privileges, is_active } = req.body;
    const group = await resolveScopedGroup(req.params.id, req);
    if (!group) return res.status(404).json({ error: 'Security group not found.' });

    const nextIsActive = is_active === undefined ? Number(group.is_active) : (is_active ? 1 : 0);
    if (Number(group.is_active) === 1 && nextIsActive === 0) {
      const dependency = await getActiveMemberDependency(group.id);
      if (dependency.active_member_count > 0) {
        return res.status(409).json({
          error: 'Cannot deactivate security group while active members are assigned. Remove or deactivate members first.',
          dependency,
        });
      }
    }

    const updates = [];
    const params = [];

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return res.status(400).json({ error: 'name cannot be empty.' });
      updates.push('name = ?');
      params.push(trimmed);
    }

    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description || null);
    }

    if (privileges !== undefined) {
      updates.push('privileges = ?');
      params.push(JSON.stringify(privileges));

      if (hasGlobalAdminScope(req.user)) {
        const tenantIds = normalizeTenantIds(privileges);
        updates.push('org_id = ?');
        params.push(tenantIds.length === 1 ? tenantIds[0] : null);
      }
    }

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(nextIsActive);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'Nothing to update.' });
    }

    updates.push('updated_at = NOW()');
    params.push(group.id);

    await pool.execute(`UPDATE security_groups SET ${updates.join(', ')} WHERE id = ?`, params);
    await audit(req.user.userId, req.user.email, 'UPDATE', 'security_group', Number(group.id), {
      name: name !== undefined ? String(name).trim() : group.name,
      is_active: nextIsActive,
    });

    res.json({ message: 'Security group updated.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A security group with this name already exists.' });
    }
    console.error('PUT /security-groups/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/security-groups/:id — soft delete (is_active=0)
router.delete('/security-groups/:id', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const group = await resolveScopedGroup(req.params.id, req);
    if (!group) return res.status(404).json({ error: 'Security group not found.' });

    const dependency = await getActiveMemberDependency(group.id);
    if (dependency.active_member_count > 0) {
      return res.status(409).json({
        error: 'Cannot deactivate security group while active members are assigned. Remove or deactivate members first.',
        dependency,
      });
    }

    await pool.execute('UPDATE security_groups SET is_active = 0, updated_at = NOW() WHERE id = ?', [group.id]);
    await audit(req.user.userId, req.user.email, 'DELETE', 'security_group', Number(group.id), { name: group.name });
    res.json({ message: 'Security group deactivated.' });
  } catch (err) {
    console.error('DELETE /security-groups/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/security-groups/:id/users — add user to group
router.post('/security-groups/:id/users', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required.' });

    const group = await resolveScopedGroup(req.params.id, req);
    if (!group) return res.status(404).json({ error: 'Security group not found.' });
    if (!group.is_active) return res.status(409).json({ error: 'Cannot add users to an inactive security group.' });

    const [[user]] = await pool.execute('SELECT id, name, email FROM users WHERE id = ?', [user_id]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    await pool.execute(
      'INSERT IGNORE INTO security_group_users (group_id, user_id) VALUES (?, ?)',
      [group.id, user_id]
    );
    await audit(req.user.userId, req.user.email, 'ADD_USER', 'security_group', Number(group.id), { user_id, user_email: user.email });
    res.status(201).json({ message: 'User added to security group.' });
  } catch (err) {
    console.error('POST /security-groups/:id/users error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/security-groups/:id/users/:userId — remove user from group
router.delete('/security-groups/:id/users/:userId', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const { userId } = req.params;
    const group = await resolveScopedGroup(req.params.id, req);
    if (!group) return res.status(404).json({ error: 'Security group not found.' });

    await pool.execute(
      'DELETE FROM security_group_users WHERE group_id = ? AND user_id = ?',
      [group.id, userId]
    );
    await audit(req.user.userId, req.user.email, 'REMOVE_USER', 'security_group', Number(group.id), { user_id: Number(userId) });
    res.json({ message: 'User removed from security group.' });
  } catch (err) {
    console.error('DELETE /security-groups/:id/users/:userId error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/security-groups/:id/clone — Clone group with its privileges
router.post('/security-groups/:id/clone', authenticate, requireRole('admin', 'platform_admin'), requireOrg, async (req, res) => {
  try {
    const group = await resolveScopedGroup(req.params.id, req);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const newName = `${group.name} (Copy)`;
    const orgId = hasGlobalAdminScope(req.user)
      ? (req.body.org_id !== undefined ? Number(req.body.org_id) : group.org_id)
      : req.user.orgId;
    const [result] = await pool.execute(
      `INSERT INTO security_groups (name, description, privileges, is_active, created_by, org_id, created_at) VALUES (?,?,?,1,?,?,NOW())`,
      [newName, group.description || null, group.privileges || null, req.user.userId || null, orgId]
    );
    await audit(req.user.userId, req.user.email, 'CLONE', 'security_group', result.insertId, { source_id: group.id, name: newName });
    res.json({ success: true, id: result.insertId, name: newName });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'A security group with this name already exists.' });
    }
    console.error('POST /security-groups/:id/clone error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:id — update user (role, is_active)
router.put('/users/:id', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { role, is_active } = req.body;
    const [[existing]] = await pool.execute('SELECT id, email, role FROM users WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'User not found.' });

    const validRoles = ['admin', 'agent', 'reviewer', 'content_manager', 'platform_admin'];
    // H-02: only a global (platform) admin may assign the platform_admin role.
    if (role === 'platform_admin' && !hasGlobalAdminScope(req.user)) {
      return res.status(403).json({ error: 'You are not permitted to assign the platform_admin role.' });
    }
    const newRole = role && validRoles.includes(role) ? role : existing.role;

    await pool.execute(
      'UPDATE users SET role = ?, is_active = ?, updated_at = NOW() WHERE id = ?',
      [newRole, is_active !== undefined ? (is_active ? 1 : 0) : 1, id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'user', Number(id), { role: newRole, is_active });
    res.json({ message: 'User updated.' });
  } catch (err) {
    console.error('PUT /users/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
