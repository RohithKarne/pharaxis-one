'use strict';

/**
 * admin/users.js — MIMS Admin User Management
 * System > Security > Add / Edit Users
 *
 * Admin is now global — no requireOrg on any route here.
 * All routes: admin + platform-admin only.
 */

const express  = require('express');
const router   = express.Router();
const bcrypt   = require('bcrypt');
const pool     = require('../../database/db');
const { authenticate, requireRole } = require('../../middleware/auth');
const passwordPolicy = require('../../services/passwordPolicy');
const { toCsv, setCsvDownloadHeaders } = require('../../shared/csvHelpers');

const SALT_ROUNDS = 12;
const PLATFORM_ADMIN_EXCLUSION_SQL =
  "u.id NOT IN (SELECT ump.user_id FROM user_module_permissions ump WHERE ump.module IN ('platform_admin_console','superadmin_console') AND ump.can_access = 1)";

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// ── Helper: audit log ─────────────────────────────────────────────────────────
async function audit(userId, action, entityId, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, entity, entity_id, action, details) VALUES (?, 'user', ?, ?, ?)`,
      [userId, entityId, action, JSON.stringify(details)]
    );
  } catch (_) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT: specific paths before /:id to avoid route shadowing
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/users/export — CSV download of users matching the same filter
router.get('/users/export', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { search = '' } = req.query;
    const like = `%${search}%`;
    const [users] = await pool.execute(
      `SELECT u.id, u.user_id, u.name, u.email, u.role, u.department,
              sg.name AS security_group_name,
              u.is_active, u.is_disabled, u.access_admin_site, u.case_admin,
              u.password_expires_at, u.created_at, u.updated_at
         FROM users u
    LEFT JOIN security_groups sg ON sg.id = u.security_group_id
        WHERE ${PLATFORM_ADMIN_EXCLUSION_SQL}
          AND (u.name LIKE ? OR u.email LIKE ? OR u.user_id LIKE ?)
        ORDER BY u.name`,
      [like, like, like]
    );
    const columns = [
      { key: 'user_id', label: 'User ID' },
      { key: 'name', label: 'Full Name' },
      { key: 'email', label: 'Email' },
      { key: 'role', label: 'Role' },
      { key: 'security_group_name', label: 'Security Group' },
      { key: 'department', label: 'Department' },
      { label: 'Status', value: u => u.is_disabled ? 'Disabled' : (u.is_active ? 'Active' : 'Inactive') },
      { key: 'access_admin_site', label: 'Admin Site Access' },
      { key: 'case_admin', label: 'Case Admin' },
      { key: 'password_expires_at', label: 'Password Expires At' },
      { key: 'created_at', label: 'Created At' },
      { key: 'updated_at', label: 'Last Updated' },
    ];
    setCsvDownloadHeaders(res, 'users-export');
    res.send(toCsv(users, columns));
  } catch (err) {
    console.error('GET /users/export error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users/security-groups — global list for dropdown (no requireOrg)
router.get('/users/security-groups', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const [groups] = await pool.execute(
      `SELECT id, name, description, is_active FROM security_groups WHERE is_active = 1 ORDER BY name ASC`
    );
    res.json({ groups });
  } catch (err) {
    console.error('GET /users/security-groups error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users/orgs — all organisations for tenant assignment tab
router.get('/users/orgs', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const [orgs] = await pool.execute(
      `SELECT id, name, is_active FROM organisations ORDER BY name ASC`
    );
    res.json({ orgs });
  } catch (err) {
    console.error('GET /users/orgs error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/users — list all users globally ────────────────────────────
router.get('/users', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { search = '', limit = 100, offset = 0 } = req.query;
    const like = `%${search}%`;
    const [users] = await pool.execute(
      `SELECT
         u.id, u.user_id, u.name, u.email, u.initials, u.role,
         u.is_active, u.is_disabled, u.is_primary_ref,
         u.access_admin_site, u.case_admin,
         u.network_user_id, u.department,
         u.security_group_id, sg.name AS security_group_name,
         u.password_expires_at, u.created_at, u.updated_at,
         (
           SELECT al.user_id FROM audit_logs al
            WHERE al.entity = 'user' AND al.entity_id = u.id
            ORDER BY al.created_at DESC LIMIT 1
         ) AS updated_by_id,
         (
           SELECT mu.name FROM audit_logs al2
             LEFT JOIN users mu ON mu.id = al2.user_id
            WHERE al2.entity = 'user' AND al2.entity_id = u.id
            ORDER BY al2.created_at DESC LIMIT 1
         ) AS updated_by_name
       FROM users u
       LEFT JOIN security_groups sg ON sg.id = u.security_group_id
       WHERE ${PLATFORM_ADMIN_EXCLUSION_SQL}
         AND (u.name LIKE ? OR u.email LIKE ? OR u.user_id LIKE ?)
       ORDER BY u.name ASC
       LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}`,
      [like, like, like]
    );
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM users u
       WHERE ${PLATFORM_ADMIN_EXCLUSION_SQL}
         AND (u.name LIKE ? OR u.email LIKE ? OR u.user_id LIKE ?)`,
      [like, like, like]
    );
    res.json({ users, total });
  } catch (err) {
    console.error('GET /users error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/users/:id — single user with tenant assignments ─────────────
router.get('/users/:id', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const [[user]] = await pool.execute(
      `SELECT
         u.id, u.user_id, u.name, u.email, u.initials, u.role,
         u.is_active, u.is_disabled, u.is_primary_ref,
         u.access_admin_site, u.case_admin,
         u.network_user_id, u.department,
         u.security_group_id, sg.name AS security_group_name,
         u.password_expires_at, u.created_at, u.updated_at
       FROM users u
       LEFT JOIN security_groups sg ON sg.id = u.security_group_id
       WHERE u.id = ? AND ${PLATFORM_ADMIN_EXCLUSION_SQL}`,
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const [tenants] = await pool.execute(
      `SELECT org_id FROM user_org_access WHERE user_id = ? AND is_active = 1`,
      [user.id]
    );
    user.tenant_ids = tenants.map(t => t.org_id);
    res.json({ user });
  } catch (err) {
    console.error('GET /users/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/users — create user ───────────────────────────────────────
router.post('/users', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const {
    user_id, name, email, initials, role = 'agent',
    security_group_id, network_user_id, department,
    is_primary_ref = 0, access_admin_site = 0, case_admin = 0,
    tenant_ids = [],
  } = req.body;

  // Mandatory field validation
  const missing = [];
  if (!user_id?.trim())          missing.push('User ID');
  if (!name?.trim())             missing.push('Full Name');
  if (!security_group_id)        missing.push('Security Group');
  if (!email?.trim())            missing.push('Email Account');
  if (!tenant_ids.length)        missing.push('Tenant Selection (at least one)');
  if (missing.length) {
    return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}.` });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Uniqueness checks
    const [[dupUserId]] = await conn.execute(
      'SELECT id FROM users WHERE user_id = ? LIMIT 1', [user_id.trim()]
    );
    if (dupUserId) {
      await conn.rollback();
      return res.status(409).json({ error: 'User ID already exists. Choose a unique User ID.' });
    }
    const [[dupEmail]] = await conn.execute(
      'SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [email.trim().toLowerCase()]
    );
    if (dupEmail) {
      await conn.rollback();
      return res.status(409).json({ error: 'Email address already in use.' });
    }

    // Temporary default password — user must reset on first login
    const tempPassword = await bcrypt.hash('Temp@12345!', SALT_ROUNDS);
    const { expiry_days } = await passwordPolicy.getPolicy();
    const expiresAt    = addDays(new Date(), expiry_days);

    const [insert] = await conn.execute(
      `INSERT INTO users
         (user_id, name, email, password, role, initials, security_group_id,
          network_user_id, department, is_primary_ref, access_admin_site,
          case_admin, is_active, is_disabled, password_reset_required,
          password_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 1, ?)`,
      [
        user_id.trim(), name.trim(), email.trim().toLowerCase(), tempPassword,
        role, initials?.trim() || null, security_group_id || null,
        network_user_id?.trim() || null, department?.trim() || null,
        is_primary_ref ? 1 : 0, access_admin_site ? 1 : 0,
        case_admin ? 1 : 0, expiresAt,
      ]
    );
    const newUserId = insert.insertId;

    // Tenant assignments — derive role from security group
    let roleAtOrg = 'agent';
    if (security_group_id) {
      const [[sg]] = await conn.execute(
        'SELECT privileges FROM security_groups WHERE id = ? LIMIT 1', [security_group_id]
      );
      if (sg?.privileges) {
        const priv = typeof sg.privileges === 'string' ? JSON.parse(sg.privileges) : sg.privileges;
        if (priv?.role) roleAtOrg = priv.role;
      }
    }

    for (const orgId of tenant_ids) {
      await conn.execute(
        `INSERT INTO user_org_access (user_id, org_id, role_at_org, is_active)
         VALUES (?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE role_at_org = VALUES(role_at_org), is_active = 1`,
        [newUserId, orgId, roleAtOrg]
      );
    }

    await conn.commit();

    await audit(req.user.userId, 'CREATE_USER', newUserId, { user_id, name, email, role, tenant_ids });

    const [[created]] = await pool.execute(
      `SELECT u.id, u.user_id, u.name, u.email, u.role, u.is_active, u.password_expires_at,
              sg.name AS security_group_name
       FROM users u LEFT JOIN security_groups sg ON sg.id = u.security_group_id
       WHERE u.id = ?`, [newUserId]
    );
    res.status(201).json({ ok: true, user: created });
  } catch (err) {
    await conn.rollback();
    console.error('POST /users error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ── PUT /api/admin/users/:id — update user fields ─────────────────────────────
router.put('/users/:id', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const {
    user_id, name, email, initials, role,
    security_group_id, network_user_id, department,
    is_active, is_disabled, is_primary_ref,
    access_admin_site, case_admin,
  } = req.body;

  try {
    const [[existing]] = await pool.execute(
      'SELECT id, role FROM users WHERE id = ? AND role != ?', [req.params.id, 'superadmin']
    );
    if (!existing) return res.status(404).json({ error: 'User not found.' });

    // user_id uniqueness check (exclude self)
    if (user_id !== undefined) {
      const [[dup]] = await pool.execute(
        'SELECT id FROM users WHERE user_id = ? AND id != ? LIMIT 1',
        [user_id, req.params.id]
      );
      if (dup) return res.status(409).json({ error: 'User ID already in use by another user.' });
    }

    // email uniqueness check (exclude self)
    if (email !== undefined) {
      const [[dup]] = await pool.execute(
        'SELECT id FROM users WHERE LOWER(email) = ? AND id != ? LIMIT 1',
        [email.trim().toLowerCase(), req.params.id]
      );
      if (dup) return res.status(409).json({ error: 'Email address already in use.' });
    }

    await pool.execute(
      `UPDATE users SET
         user_id           = COALESCE(?, user_id),
         name              = COALESCE(?, name),
         email             = COALESCE(?, email),
         initials          = COALESCE(?, initials),
         role              = COALESCE(?, role),
         security_group_id = COALESCE(?, security_group_id),
         network_user_id   = COALESCE(?, network_user_id),
         department        = COALESCE(?, department),
         is_active         = COALESCE(?, is_active),
         is_disabled       = COALESCE(?, is_disabled),
         is_primary_ref    = COALESCE(?, is_primary_ref),
         access_admin_site = COALESCE(?, access_admin_site),
         case_admin        = COALESCE(?, case_admin)
       WHERE id = ?`,
      [
        user_id   ?? null, name     ?? null,
        email     ? email.trim().toLowerCase() : null,
        initials  ?? null, role     ?? null,
        security_group_id ?? null,
        network_user_id   ?? null,
        department        ?? null,
        is_active   != null ? (is_active   ? 1 : 0) : null,
        is_disabled != null ? (is_disabled ? 1 : 0) : null,
        is_primary_ref    != null ? (is_primary_ref    ? 1 : 0) : null,
        access_admin_site != null ? (access_admin_site ? 1 : 0) : null,
        case_admin        != null ? (case_admin        ? 1 : 0) : null,
        req.params.id,
      ]
    );

    await audit(req.user.userId, 'UPDATE_USER', req.params.id, req.body);
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /users/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/admin/users/:id/expire-password — expire immediately ────────────
router.post('/users/:id/expire-password', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const [[user]] = await pool.execute(
      'SELECT id FROM users WHERE id = ? AND role != ? LIMIT 1', [req.params.id, 'superadmin']
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });

    await pool.execute(
      `UPDATE users SET password_expires_at = NOW(), password_reset_required = 1 WHERE id = ?`,
      [req.params.id]
    );
    await audit(req.user.userId, 'EXPIRE_PASSWORD', req.params.id, {});
    res.json({ ok: true, message: 'Password expired. User must reset on next login.' });
  } catch (err) {
    console.error('POST /users/:id/expire-password error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/admin/users/:id/change-password — admin sets new password ─────────
router.put('/users/:id/change-password', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const { new_password } = req.body;

  // Run shared complexity policy
  const complexity = await passwordPolicy.validateComplexity(new_password);
  if (!complexity.ok) {
    return res.status(400).json({ error: complexity.error });
  }

  try {
    const [[user]] = await pool.execute(
      'SELECT id, network_user_id FROM users WHERE id = ? AND role != ? LIMIT 1',
      [req.params.id, 'superadmin']
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.network_user_id) {
      return res.status(400).json({ error: 'Password cannot be changed for SSO users.' });
    }

    const hash = await bcrypt.hash(new_password, SALT_ROUNDS);
    const { expiry_days } = await passwordPolicy.getPolicy();
    const expiresAt = addDays(new Date(), expiry_days);
    await pool.execute(
      `UPDATE users SET password = ?, password_reset_required = 0,
        password_expires_at = ? WHERE id = ?`,
      [hash, expiresAt, req.params.id]
    );
    await audit(req.user.userId, 'ADMIN_CHANGE_PASSWORD', req.params.id, {});
    res.json({ ok: true });
  } catch (err) {
    console.error('PUT /users/:id/change-password error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/admin/users/:id/tenants ─────────────────────────────────────────
router.get('/users/:id/tenants', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT uoa.org_id, uoa.role_at_org, uoa.is_active, o.name AS org_name
       FROM user_org_access uoa
       JOIN organisations o ON o.id = uoa.org_id
       WHERE uoa.user_id = ?`,
      [req.params.id]
    );
    res.json({ tenants: rows });
  } catch (err) {
    console.error('GET /users/:id/tenants error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/admin/users/:id/tenants — full replace of tenant assignments ──────
router.put('/users/:id/tenants', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const { tenant_ids = [] } = req.body;
  if (!tenant_ids.length) {
    return res.status(400).json({ error: 'At least one tenant must be assigned.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[user]] = await conn.execute(
      'SELECT id, security_group_id FROM users WHERE id = ? AND role != ? LIMIT 1',
      [req.params.id, 'superadmin']
    );
    if (!user) {
      await conn.rollback();
      return res.status(404).json({ error: 'User not found.' });
    }
    if (!user.security_group_id) {
      await conn.rollback();
      return res.status(400).json({ error: 'User must have a Security Group assigned before tenant assignment.' });
    }

    // Derive role from security group
    let roleAtOrg = 'agent';
    const [[sg]] = await conn.execute(
      'SELECT privileges FROM security_groups WHERE id = ? LIMIT 1', [user.security_group_id]
    );
    if (sg?.privileges) {
      const priv = typeof sg.privileges === 'string' ? JSON.parse(sg.privileges) : sg.privileges;
      if (priv?.role) roleAtOrg = priv.role;
    }

    // Deactivate all existing
    await conn.execute(
      'UPDATE user_org_access SET is_active = 0 WHERE user_id = ?', [req.params.id]
    );

    // Re-activate / insert selected
    for (const orgId of tenant_ids) {
      await conn.execute(
        `INSERT INTO user_org_access (user_id, org_id, role_at_org, is_active)
         VALUES (?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE role_at_org = VALUES(role_at_org), is_active = 1`,
        [req.params.id, orgId, roleAtOrg]
      );
    }

    await conn.commit();
    await audit(req.user.userId, 'UPDATE_TENANTS', req.params.id, { tenant_ids });
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error('PUT /users/:id/tenants error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
