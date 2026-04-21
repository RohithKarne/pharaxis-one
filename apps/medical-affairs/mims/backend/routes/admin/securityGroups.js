'use strict';

/**
 * admin/securityGroups.js — Security Groups (RBAC) API
 * Manages groups with privilege matrices and user assignments.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../database/db');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      'INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

async function resolveScopedGroup(groupId, req) {
  const id = Number(groupId);
  if (!Number.isFinite(id) || id <= 0) return null;

  if (req.user.role === 'superadmin') {
    const [[group]] = await pool.execute(
      'SELECT id, name, description, privileges, is_active, org_id FROM security_groups WHERE id = ?',
      [id]
    );
    return group || null;
  }

  const [[group]] = await pool.execute(
    'SELECT id, name, description, privileges, is_active, org_id FROM security_groups WHERE id = ? AND org_id = ?',
    [id, req.user.orgId]
  );
  return group || null;
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
router.get('/security-groups', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const isSA = req.user.role === 'superadmin';
    const [groups] = await pool.execute(
      `SELECT id, name, description, privileges, is_active, created_at, updated_at, org_id
       FROM security_groups
       ${isSA ? '' : 'WHERE org_id = ?'}
       ORDER BY name`,
      isSA ? [] : [req.user.orgId]
    );

    const parsed = groups.map(g => ({
      ...g,
      privileges: g.privileges ? (typeof g.privileges === 'string' ? JSON.parse(g.privileges) : g.privileges) : null,
    }));
    res.json({ groups: parsed });
  } catch (err) {
    console.error('GET /security-groups error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/security-groups — create group
router.post('/security-groups', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const { name, description, privileges } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required.' });
    }

    const privilegesJson = privileges !== undefined ? JSON.stringify(privileges) : null;
    const orgId = req.user.role === 'superadmin'
      ? (req.body.org_id !== undefined ? Number(req.body.org_id) : null)
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
router.get('/security-groups/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
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
      privileges: group.privileges
        ? (typeof group.privileges === 'string' ? JSON.parse(group.privileges) : group.privileges)
        : null,
    };

    res.json({ group: parsed, members });
  } catch (err) {
    console.error('GET /security-groups/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/security-groups/:id — update group
router.put('/security-groups/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
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
router.delete('/security-groups/:id', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
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
router.post('/security-groups/:id/users', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
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
router.delete('/security-groups/:id/users/:userId', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
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
router.post('/security-groups/:id/clone', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const group = await resolveScopedGroup(req.params.id, req);
    if (!group) return res.status(404).json({ error: 'Group not found' });
    const newName = `${group.name} (Copy)`;
    const orgId = req.user.role === 'superadmin'
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
router.put('/users/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { role, is_active } = req.body;
    const [[existing]] = await pool.execute('SELECT id, email, role FROM users WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'User not found.' });

    const validRoles = ['admin', 'agent', 'reviewer', 'content_manager', 'superadmin'];
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
