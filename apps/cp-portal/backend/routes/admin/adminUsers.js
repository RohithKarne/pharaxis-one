/**
 * Admin Users — /api/admin/admin-users
 * S4-10: Role-based admin access — manage admin console users
 *
 * Who can access:
 *   superadmin — view/create/edit/deactivate any admin user across all clients
 *   admin      — view/create/edit/deactivate admin users scoped to their own client
 *
 * Roles that can be assigned: admin | content_manager | reviewer | safety_reviewer | viewer
 *
 * CPPM-52: safety_reviewer is the role that may record a clinical outcome on the
 * Safety Queue and read chat records. Those routes have checked for it since
 * August 2026, but it was never added here, so nobody could be given it and only
 * the platform admin could record a clinical outcome.
 * (superadmin role is reserved — only seeded at startup, never assignable via API)
 */

const express = require('express');
const bcrypt  = require('bcrypt');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess, requireRole } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');
const log = require('../../utils/logger');
const lockout = require('../../utils/loginLockout');
const { releaseWorkHeldBy } = require('../../utils/workOwnership');

const ASSIGNABLE_ROLES = ['admin', 'content_manager', 'reviewer', 'safety_reviewer', 'viewer'];

// CPPM-6, CPPM-61: change a staff account and, when the change means they can no longer
// hold work (safety tasks, enquiries, content awaiting approval), hand it back to its
// list — together, or not at all.
async function updateAccount(sql, params, releaseFor) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute(sql, params);
    const released = releaseFor ? await releaseWorkHeldBy(conn, releaseFor.actor, releaseFor.user, releaseFor.reason) : 0;
    await conn.commit();
    return released;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}
const releasedNote = n => (n ? ` ${n} item${n === 1 ? '' : 's'} they were holding went back to the list for anyone to take.` : '');

// ── GET /:clientId — list all admin users for a client ───────────────────────
router.get('/:clientId', authenticateAdmin, requireClientAccess, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const [users] = await pool.execute(
      `SELECT id, name, email, role, is_active, client_id, created_at, updated_at
       FROM cp_admin_users
       WHERE client_id = ? AND role != 'superadmin'
       ORDER BY created_at DESC`,
      [clientId]
    );
    // CPPM-49: when an admin's sign-in is locked, and until when (UTC).
    const locked = await lockout.lockedUntilByEmail('admin', null, users.map(u => u.email));
    res.json({ users: users.map(u => ({ ...u, locked_until: locked[u.email] || null })) });
  } catch (err) {
    log.error('admin.adminUsers.error', { err, route: 'GET /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── POST /:clientId — create a new admin user for a client ───────────────────
router.post('/:clientId', authenticateAdmin, requireClientAccess, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password, and role are required.' });
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${ASSIGNABLE_ROLES.join(', ')}.` });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    // Non-superadmin can only assign roles below admin
    if (req.admin.role === 'admin' && role === 'admin') {
      // admins can create other admins for their own client — allowed
    }

    const [[existing]] = await pool.execute('SELECT id FROM cp_admin_users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'An admin user with this email already exists.' });

    const hash = bcrypt.hashSync(password, 10);
    const [result] = await pool.execute(
      `INSERT INTO cp_admin_users (name, email, password, role, client_id)
       VALUES (?, ?, ?, ?, ?)`,
      [name, email.toLowerCase().trim(), hash, role, clientId]
    );

    await audit(req.admin, clientId, 'create', 'admin_user', result.insertId, `Created ${role}: ${email}`);

    res.status(201).json({
      user: { id: result.insertId, name, email: email.toLowerCase().trim(), role, client_id: clientId, is_active: 1 }
    });
  } catch (err) {
    log.error('admin.adminUsers.error', { err, route: 'POST /:clientId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── PATCH /:clientId/:userId — update name, role, or is_active ───────────────
router.patch('/:clientId/:userId', authenticateAdmin, requireClientAccess, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const userId   = parseInt(req.params.userId);
    const { name, role, is_active } = req.body;

    const [[user]] = await pool.execute('SELECT * FROM cp_admin_users WHERE id = ? AND client_id = ?', [userId, clientId]);
    if (!user) return res.status(404).json({ error: 'Admin user not found.' });
    if (user.role === 'superadmin') return res.status(403).json({ error: 'Superadmin accounts cannot be modified via this endpoint.' });

    if (role !== undefined && !ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${ASSIGNABLE_ROLES.join(', ')}.` });
    }

    const newName     = name      !== undefined ? name      : user.name;
    const newRole     = role      !== undefined ? role      : user.role;
    const newIsActive = is_active !== undefined ? (is_active ? 1 : 0) : user.is_active;

    const switchedOff = user.is_active && !newIsActive;
    const madeViewer  = user.role !== 'viewer' && newRole === 'viewer';
    const released = await updateAccount(
      `UPDATE cp_admin_users SET name = ?, role = ?, is_active = ?, updated_at = NOW() WHERE id = ?`,
      [newName, newRole, newIsActive, userId],
      (switchedOff || madeViewer) ? { actor: req.admin, user, reason: switchedOff ? 'account deactivated' : 'role changed to viewer' } : null
    );

    await audit(req.admin, clientId, 'update', 'admin_user', userId, `Updated ${user.email}: role=${newRole}, active=${newIsActive}`);

    res.json({ message: `Admin user updated.${releasedNote(released)}`, released_tasks: released, released_note: releasedNote(released) });
  } catch (err) {
    log.error('admin.adminUsers.error', { err, route: 'PATCH /:clientId/:userId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── POST /:clientId/:userId/unlock — CPPM-49: lift a sign-in lock early ──────
router.post('/:clientId/:userId/unlock', authenticateAdmin, requireClientAccess, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const userId   = parseInt(req.params.userId);

    const [[user]] = await pool.execute('SELECT id, email FROM cp_admin_users WHERE id = ? AND client_id = ?', [userId, clientId]);
    if (!user) return res.status(404).json({ error: 'Admin user not found.' });

    const removed = await lockout.clearAttempts(lockout.loginKey('admin', null, user.email));
    if (removed) await audit(req.admin, clientId, 'UNLOCK', 'admin_user', userId, { email: user.email });
    res.json({ message: removed ? 'Sign-in unlocked.' : 'This admin’s sign-in was not locked.' });
  } catch (err) {
    log.error('admin.adminUsers.error', { err, route: 'POST /:clientId/:userId/unlock', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── DELETE /:clientId/:userId — deactivate (soft delete) ─────────────────────
router.delete('/:clientId/:userId', authenticateAdmin, requireClientAccess, requireRole('superadmin', 'admin'), async (req, res) => {
  try {
    const clientId = parseInt(req.params.clientId);
    const userId   = parseInt(req.params.userId);

    const [[user]] = await pool.execute('SELECT * FROM cp_admin_users WHERE id = ? AND client_id = ?', [userId, clientId]);
    if (!user) return res.status(404).json({ error: 'Admin user not found.' });
    if (user.role === 'superadmin') return res.status(403).json({ error: 'Superadmin accounts cannot be deleted.' });
    if (user.id === req.admin.adminId) return res.status(400).json({ error: 'You cannot deactivate your own account.' });

    const released = await updateAccount(
      `UPDATE cp_admin_users SET is_active = 0, updated_at = NOW() WHERE id = ?`, [userId],
      { actor: req.admin, user, reason: 'account deactivated' }
    );
    await audit(req.admin, clientId, 'deactivate', 'admin_user', userId, `Deactivated ${user.email}`);

    res.json({ message: `Admin user deactivated.${releasedNote(released)}`, released_tasks: released, released_note: releasedNote(released) });
  } catch (err) {
    log.error('admin.adminUsers.error', { err, route: 'DELETE /:clientId/:userId', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
