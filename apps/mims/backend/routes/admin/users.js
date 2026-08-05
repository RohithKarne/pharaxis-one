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
const { hasGlobalAdminScope } = require('../../utils/adminScope');
const passwordPolicy = require('../../services/passwordPolicy');
const { toCsv, setCsvDownloadHeaders } = require('../../shared/csvHelpers');
const { validateBulkUserRows } = require('../../services/bulkUserProvisioningService');

const SALT_ROUNDS = 12;
const PLATFORM_ADMIN_EXCLUSION_SQL =
  "u.id NOT IN (SELECT ump.user_id FROM user_module_permissions ump WHERE ump.module = 'platform_admin_console' AND ump.can_access = 1)";

// WP1: non-platform admins may only see/act on users within their OWN org.
// Platform admins (global scope) keep full cross-tenant visibility. Returns a SQL
// fragment (users alias = `u`) plus its bind params to AND into a WHERE clause.
function orgScopeForUsers(req) {
  if (hasGlobalAdminScope(req.user)) return { sql: '1=1', params: [] };
  return {
    sql: 'EXISTS (SELECT 1 FROM user_org_access uoa_scope WHERE uoa_scope.user_id = u.id AND uoa_scope.org_id = ? AND uoa_scope.is_active = 1)',
    params: [req.user.orgId ?? null],
  };
}

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
    const scope = orgScopeForUsers(req);
    const [users] = await pool.execute(
      `SELECT u.id, u.user_id, u.name, u.email, u.role, u.department,
              sg.name AS security_group_name,
              u.is_active, u.is_disabled, u.access_admin_site, u.case_admin,
              u.password_expires_at, u.created_at, u.updated_at
         FROM users u
    LEFT JOIN security_groups sg ON sg.id = u.security_group_id
        WHERE ${PLATFORM_ADMIN_EXCLUSION_SQL}
          AND ${scope.sql}
          AND (u.name LIKE ? OR u.email LIKE ? OR u.user_id LIKE ?)
        ORDER BY u.name`,
      [...scope.params, like, like, like]
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
      `SELECT id, name, description, is_active FROM security_groups WHERE is_active = 1 AND is_template = 0 ORDER BY name ASC`
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
    const scope = orgScopeForUsers(req);
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
         AND ${scope.sql}
         AND (u.name LIKE ? OR u.email LIKE ? OR u.user_id LIKE ?)
       ORDER BY u.name ASC
       LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}`,
      [...scope.params, like, like, like]
    );
    const [[{ total }]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM users u
       WHERE ${PLATFORM_ADMIN_EXCLUSION_SQL}
         AND ${scope.sql}
         AND (u.name LIKE ? OR u.email LIKE ? OR u.user_id LIKE ?)`,
      [...scope.params, like, like, like]
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
    const scope = orgScopeForUsers(req);
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
       WHERE u.id = ? AND ${PLATFORM_ADMIN_EXCLUSION_SQL} AND ${scope.sql}`,
      [req.params.id, ...scope.params]
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

// Roles a non-global (tenant) admin may never assign. (H-02 / H-13)
const ELEVATED_ROLES = new Set(['platform_admin']);

// Org ids the caller may assign users to. Returns null for global admins (unrestricted);
// otherwise the set of orgs the caller is an active member of. (H-03)
async function callerAssignableOrgIds(req) {
  if (hasGlobalAdminScope(req.user)) return null;
  const [rows] = await pool.execute(
    'SELECT org_id FROM user_org_access WHERE user_id = ? AND is_active = 1',
    [req.user.userId]
  );
  return new Set(rows.map((r) => Number(r.org_id)));
}

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

    // Derive the effective role from the security group (H-13: users.role is not free-form
    // body input — it mirrors the assigned group so the global admin gate can't be set
    // independently of the group).
    let roleAtOrg = 'agent';
    if (security_group_id) {
      const [[sg]] = await conn.execute(
        'SELECT privileges FROM security_groups WHERE id = ? LIMIT 1', [security_group_id]
      );
      let parsedRole = null;
      if (sg?.privileges) {
        try {
          const priv = typeof sg.privileges === 'string' ? JSON.parse(sg.privileges) : sg.privileges;
          if (priv?.role) parsedRole = priv.role;
        } catch (parseErr) {
          // L-11: surface the silent fall-through to the 'agent' default.
          console.warn(`POST /users: security group ${security_group_id} has unparseable privileges JSON, defaulting role_at_org to 'agent':`, parseErr.message);
        }
      }
      if (parsedRole) {
        roleAtOrg = parsedRole;
      } else {
        // L-11: no parseable role on the group — the 'agent' default now warns instead of being silent.
        console.warn(`POST /users: security group ${security_group_id} has no parseable role; defaulting role_at_org to 'agent'.`);
      }
    }

    // H-02 / H-03: a non-global (tenant) admin may not mint an elevated role and may only
    // assign users to organisations they themselves belong to.
    if (!hasGlobalAdminScope(req.user)) {
      if (ELEVATED_ROLES.has(roleAtOrg)) {
        await conn.rollback();
        return res.status(403).json({ error: 'You are not permitted to assign a platform-admin security group.' });
      }
      const allowedOrgs = await callerAssignableOrgIds(req);
      const bad = tenant_ids.map(Number).filter((id) => !allowedOrgs.has(id));
      if (bad.length) {
        await conn.rollback();
        return res.status(403).json({ error: 'You can only assign users to organisations you belong to.' });
      }
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
        roleAtOrg, initials?.trim() || null, security_group_id || null,
        network_user_id?.trim() || null, department?.trim() || null,
        is_primary_ref ? 1 : 0, access_admin_site ? 1 : 0,
        case_admin ? 1 : 0, expiresAt,
      ]
    );
    const newUserId = insert.insertId;

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

// ── POST /api/admin/users/bulk — create many users in one batch ──────────────
// PAUD-4 item 2. Applied all-or-nothing inside a single transaction: user
// provisioning is access control, and a half-applied batch leaves an admin
// unsure who exists. Every row is validated first and the whole batch is
// rejected with per-row reasons if any row fails.
router.post('/users/bulk', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  const { valid, errors, normalized } = validateBulkUserRows(req.body?.users);
  if (!valid) {
    return res.status(400).json({ error: 'Batch rejected. No users were created.', errors });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Uniqueness against users that already exist (the batch's own duplicates
    // were caught by validateBulkUserRows).
    const dupErrors = [];
    for (const row of normalized) {
      const [[dupUserId]] = await conn.execute('SELECT id FROM users WHERE user_id = ? LIMIT 1', [row.user_id]);
      if (dupUserId) dupErrors.push({ row: row.row, reason: `User ID already exists: ${row.user_id}.` });
      const [[dupEmail]] = await conn.execute('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [row.email]);
      if (dupEmail) dupErrors.push({ row: row.row, reason: `Email address already in use: ${row.email}.` });
    }
    if (dupErrors.length) {
      await conn.rollback();
      return res.status(409).json({ error: 'Batch rejected. No users were created.', errors: dupErrors });
    }

    // Resolve the effective role per row from its security group, and apply the
    // same elevation and org-scope rules the single-user route enforces.
    const allowedOrgs = hasGlobalAdminScope(req.user) ? null : await callerAssignableOrgIds(req);
    const permissionErrors = [];
    for (const row of normalized) {
      let roleAtOrg = 'agent';
      const [[sg]] = await conn.execute('SELECT privileges FROM security_groups WHERE id = ? LIMIT 1', [row.security_group_id]);
      if (!sg) {
        permissionErrors.push({ row: row.row, reason: `Security group ${row.security_group_id} not found.` });
        continue;
      }
      if (sg.privileges) {
        try {
          const priv = typeof sg.privileges === 'string' ? JSON.parse(sg.privileges) : sg.privileges;
          if (priv?.role) roleAtOrg = priv.role;
        } catch (parseErr) {
          console.warn(`POST /users/bulk: security group ${row.security_group_id} has unparseable privileges JSON, defaulting role_at_org to 'agent':`, parseErr.message);
        }
      }
      if (allowedOrgs) {
        if (ELEVATED_ROLES.has(roleAtOrg)) {
          permissionErrors.push({ row: row.row, reason: 'You are not permitted to assign a platform-admin security group.' });
          continue;
        }
        const bad = row.tenant_ids.filter((id) => !allowedOrgs.has(id));
        if (bad.length) {
          permissionErrors.push({ row: row.row, reason: 'You can only assign users to organisations you belong to.' });
          continue;
        }
      }
      row.roleAtOrg = roleAtOrg;
    }
    if (permissionErrors.length) {
      await conn.rollback();
      return res.status(403).json({ error: 'Batch rejected. No users were created.', errors: permissionErrors });
    }

    const tempPassword = await bcrypt.hash('Temp@12345!', SALT_ROUNDS);
    const { expiry_days } = await passwordPolicy.getPolicy();
    const expiresAt = addDays(new Date(), expiry_days);

    const created = [];
    for (const row of normalized) {
      const [insert] = await conn.execute(
        `INSERT INTO users
           (user_id, name, email, password, role, initials, security_group_id,
            network_user_id, department, is_primary_ref, access_admin_site,
            case_admin, is_active, is_disabled, password_reset_required,
            password_expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, 1, ?)`,
        [
          row.user_id, row.name, row.email, tempPassword,
          row.roleAtOrg, row.initials, row.security_group_id,
          row.network_user_id, row.department,
          row.is_primary_ref, row.access_admin_site, row.case_admin, expiresAt,
        ]
      );
      for (const orgId of row.tenant_ids) {
        await conn.execute(
          `INSERT INTO user_org_access (user_id, org_id, role_at_org, is_active)
           VALUES (?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE role_at_org = VALUES(role_at_org), is_active = 1`,
          [insert.insertId, orgId, row.roleAtOrg]
        );
      }
      created.push({ id: insert.insertId, user_id: row.user_id, email: row.email });
    }

    await conn.commit();

    // One audit row per user — a batch is a convenience for the operator, not a
    // reason for forty provisioning events to collapse into a single record.
    for (const user of created) {
      await audit(req.user.userId, 'CREATE_USER', user.id, { ...user, via: 'bulk' });
    }

    res.status(201).json({ ok: true, created: created.length, users: created });
  } catch (err) {
    await conn.rollback();
    console.error('POST /users/bulk error:', err);
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
    // Platform-admin accounts are protected from edits by regular admins, but a
    // superadmin (global scope) may edit superadmin accounts (incl. their own).
    const canTouchPlatformAdmin = hasGlobalAdminScope(req.user);
    const [[existing]] = await pool.execute(
      canTouchPlatformAdmin
        ? 'SELECT id, role FROM users WHERE id = ?'
        : 'SELECT id, role FROM users WHERE id = ? AND role != ?',
      canTouchPlatformAdmin ? [req.params.id] : [req.params.id, 'platform_admin']
    );
    if (!existing) return res.status(404).json({ error: 'User not found.' });

    // WP1: a tenant admin may only edit users that belong to their own org.
    if (!canTouchPlatformAdmin) {
      const [[inOrg]] = await pool.execute(
        'SELECT 1 AS ok FROM user_org_access WHERE user_id = ? AND org_id = ? AND is_active = 1 LIMIT 1',
        [req.params.id, req.user.orgId ?? null]
      );
      if (!inOrg) return res.status(403).json({ error: 'You can only modify users within your organisation.' });
    }

    // H-02: a non-global admin may not elevate a user to a platform-admin role.
    if (role != null && !hasGlobalAdminScope(req.user) && ELEVATED_ROLES.has(String(role))) {
      return res.status(403).json({ error: 'You are not permitted to assign the platform_admin role.' });
    }

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
      'SELECT id FROM users WHERE id = ? AND role != ? LIMIT 1', [req.params.id, 'platform_admin']
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
      [req.params.id, 'platform_admin']
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

    const canTouchPlatformAdmin = hasGlobalAdminScope(req.user);
    const [[user]] = await conn.execute(
      canTouchPlatformAdmin
        ? 'SELECT id, security_group_id FROM users WHERE id = ? LIMIT 1'
        : 'SELECT id, security_group_id FROM users WHERE id = ? AND role != ? LIMIT 1',
      canTouchPlatformAdmin ? [req.params.id] : [req.params.id, 'platform_admin']
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

    // H-02 / H-03: non-global admins cannot assign an elevated role or orgs they don't belong to.
    if (!hasGlobalAdminScope(req.user)) {
      if (ELEVATED_ROLES.has(roleAtOrg)) {
        await conn.rollback();
        return res.status(403).json({ error: 'You are not permitted to assign a platform-admin security group.' });
      }
      const allowedOrgs = await callerAssignableOrgIds(req);
      const bad = tenant_ids.map(Number).filter((id) => !allowedOrgs.has(id));
      if (bad.length) {
        await conn.rollback();
        return res.status(403).json({ error: 'You can only assign users to organisations you belong to.' });
      }
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
