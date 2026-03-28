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

// GET /api/admin/security-groups — list all groups
router.get('/security-groups', authenticate, requireRole('admin', 'superadmin'), requireOrg, async (req, res) => {
  try {
    const isSA = req.user.role === 'superadmin';
    const [groups] = await pool.execute(
      `SELECT id, name, description, privileges, is_active, created_at, updated_at FROM security_groups
       ${isSA ? '' : 'WHERE org_id = ?'} ORDER BY name`,
      isSA ? [] : [req.user.orgId]
    );
    // Parse privileges JSON for each group
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
    if (!name) return res.status(400).json({ error: 'name is required.' });

    const privilegesJson = privileges ? JSON.stringify(privileges) : null;
    const orgId = req.user.role === 'superadmin' ? (req.body.org_id || null) : req.user.orgId;
    const [result] = await pool.execute(
      'INSERT INTO security_groups (name, description, privileges, created_by, org_id) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), description || null, privilegesJson, req.user.userId, orgId]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'security_group', result.insertId, { name });
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
router.get('/security-groups/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const [[group]] = await pool.execute('SELECT * FROM security_groups WHERE id = ?', [id]);
    if (!group) return res.status(404).json({ error: 'Security group not found.' });

    const [members] = await pool.execute(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, sgu.id AS membership_id
       FROM security_group_users sgu
       JOIN users u ON sgu.user_id = u.id
       WHERE sgu.group_id = ?
       ORDER BY u.name`,
      [id]
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
router.put('/security-groups/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, privileges, is_active } = req.body;
    const [[existing]] = await pool.execute('SELECT id FROM security_groups WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Security group not found.' });

    const privilegesJson = privileges !== undefined ? JSON.stringify(privileges) : undefined;
    await pool.execute(
      `UPDATE security_groups SET
         name = ?, description = ?, privileges = ?, is_active = ?, updated_at = NOW()
       WHERE id = ?`,
      [name, description || null, privilegesJson !== undefined ? privilegesJson : null, is_active ? 1 : 0, id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'security_group', Number(id), { name, is_active });
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
router.delete('/security-groups/:id', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const [[existing]] = await pool.execute('SELECT id, name FROM security_groups WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Security group not found.' });

    await pool.execute('UPDATE security_groups SET is_active = 0, updated_at = NOW() WHERE id = ?', [id]);
    await audit(req.user.userId, req.user.email, 'DELETE', 'security_group', Number(id), { name: existing.name });
    res.json({ message: 'Security group deactivated.' });
  } catch (err) {
    console.error('DELETE /security-groups/:id error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/security-groups/:id/users — add user to group
router.post('/security-groups/:id/users', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id is required.' });

    const [[group]] = await pool.execute('SELECT id FROM security_groups WHERE id = ?', [id]);
    if (!group) return res.status(404).json({ error: 'Security group not found.' });

    const [[user]] = await pool.execute('SELECT id, name, email FROM users WHERE id = ?', [user_id]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    await pool.execute(
      'INSERT IGNORE INTO security_group_users (group_id, user_id) VALUES (?, ?)',
      [id, user_id]
    );
    await audit(req.user.userId, req.user.email, 'ADD_USER', 'security_group', Number(id), { user_id, user_email: user.email });
    res.status(201).json({ message: 'User added to security group.' });
  } catch (err) {
    console.error('POST /security-groups/:id/users error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/security-groups/:id/users/:userId — remove user from group
router.delete('/security-groups/:id/users/:userId', authenticate, requireRole('admin', 'superadmin'), async (req, res) => {
  try {
    const { id, userId } = req.params;
    await pool.execute(
      'DELETE FROM security_group_users WHERE group_id = ? AND user_id = ?',
      [id, userId]
    );
    await audit(req.user.userId, req.user.email, 'REMOVE_USER', 'security_group', Number(id), { user_id: Number(userId) });
    res.json({ message: 'User removed from security group.' });
  } catch (err) {
    console.error('DELETE /security-groups/:id/users/:userId error:', err);
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/users — list all users (for user assignment dropdown)
// Note: a basic version exists in config.js; this one is mounted under /api/admin via securityGroups
// To avoid conflict the route name is intentionally the same but requires securityGroups to be mounted first OR
// this endpoint is accessed through the security-groups prefix context. Since both mount on /api/admin,
// the first-registered handler wins. Config.js already registers GET /users — skip duplicate registration here.

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
