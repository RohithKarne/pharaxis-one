/**
 * routes/superadmin.js — Superadmin API
 * Superadmin manages organisations, users, sites, and per-user module access.
 * Clients cannot self-provision any billing-affecting resource.
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const pool = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');

const ALLOWED_MODULES = ['mims_core', 'admin_console', 'content_mgmt', 'data_visualization'];
const ASSIGNABLE_ROLES = ['admin', 'agent', 'reviewer', 'content_manager'];

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

// GET /api/superadmin/users — list users with current module overrides (excludes superadmin system account)
router.get('/users', authenticate, requireRole('superadmin'), async (_req, res) => {
  try {
    const [users] = await pool.execute(
      "SELECT id, name, email, role, is_active, created_at FROM users WHERE role != 'superadmin' ORDER BY created_at DESC"
    );
    const [perms] = await pool.execute(
      'SELECT user_id, module FROM user_module_permissions WHERE can_access = 1'
    );
    const byUser = perms.reduce((acc, p) => {
      if (!acc[p.user_id]) acc[p.user_id] = [];
      acc[p.user_id].push(p.module);
      return acc;
    }, {});
    res.json({ users: users.map(u => ({ ...u, modules: byUser[u.id] || [] })) });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PUT /api/superadmin/users/:id/modules — replace module list for a user
router.put('/users/:id/modules', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { modules } = req.body || {};

    const [[user]] = await pool.execute('SELECT id, email FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (!Array.isArray(modules)) {
      return res.status(400).json({ error: 'modules must be an array.' });
    }
    const invalid = modules.filter(m => !ALLOWED_MODULES.includes(m));
    if (invalid.length) {
      return res.status(400).json({ error: `Invalid module(s): ${invalid.join(', ')}` });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('DELETE FROM user_module_permissions WHERE user_id = ?', [id]);
      for (const mod of modules) {
        await conn.execute(
          'INSERT INTO user_module_permissions (user_id, module, can_access) VALUES (?, ?, 1)',
          [id, mod]
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    await audit(req.user.userId, req.user.email, 'UPDATE', 'user_module_permissions', Number(id), { modules });
    res.json({ message: 'Updated.', modules });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// ── ORGANISATIONS ────────────────────────────────────────────────────────────

// GET /api/superadmin/orgs — list all orgs with their sites
router.get('/orgs', authenticate, requireRole('superadmin'), async (_req, res) => {
  try {
    const [orgs] = await pool.execute('SELECT * FROM organisations ORDER BY name');
    const [sites] = await pool.execute('SELECT * FROM sites ORDER BY name');
    const byOrg = sites.reduce((acc, s) => { (acc[s.org_id] = acc[s.org_id] || []).push(s); return acc; }, {});
    res.json({ orgs: orgs.map(o => ({ ...o, sites: byOrg[o.id] || [] })) });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/superadmin/orgs — create organisation
router.post('/orgs', authenticate, requireRole('superadmin'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Organisation name is required.' });
  try {
    const [result] = await pool.execute('INSERT INTO organisations (name) VALUES (?)', [name.trim()]);
    await audit(req.user.userId, req.user.email, 'CREATE', 'organisation', result.insertId, { name });
    res.status(201).json({ id: result.insertId, name, is_active: 1 });
  } catch { res.status(409).json({ error: 'Organisation name already exists.' }); }
});

// PUT /api/superadmin/orgs/:id — update org (name / active status / session timeout)
router.put('/orgs/:id', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { name, is_active, session_timeout_minutes, two_factor_enabled, two_factor_methods, two_factor_remember_days } = req.body;
    const [[existing]] = await pool.execute('SELECT * FROM organisations WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Organisation not found.' });
    if (session_timeout_minutes !== undefined) {
      const mins = parseInt(session_timeout_minutes);
      if (isNaN(mins) || mins < 30)
        return res.status(400).json({ error: 'Session timeout must be at least 30 minutes.' });
    }
    if (two_factor_remember_days !== undefined) {
      const days = parseInt(two_factor_remember_days);
      if (isNaN(days) || days < 1)
        return res.status(400).json({ error: 'Remember-device duration must be at least 1 day.' });
    }
    await pool.execute(
      `UPDATE organisations
       SET name = ?, is_active = ?, session_timeout_minutes = ?,
           two_factor_enabled = ?, two_factor_methods = ?, two_factor_remember_days = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        name ?? existing.name,
        is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
        session_timeout_minutes ?? existing.session_timeout_minutes ?? 30,
        two_factor_enabled !== undefined ? (two_factor_enabled ? 1 : 0) : existing.two_factor_enabled,
        two_factor_methods ?? existing.two_factor_methods ?? 'email,totp',
        two_factor_remember_days ?? existing.two_factor_remember_days ?? 7,
        req.params.id,
      ]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'organisation', req.params.id, {
      name, is_active, session_timeout_minutes, two_factor_enabled, two_factor_methods, two_factor_remember_days,
    });
    res.json({ message: 'Updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/superadmin/config — get system config (e.g. superadmin timeout)
router.get('/config', authenticate, requireRole('superadmin'), async (_req, res) => {
  try {
    const [rows] = await pool.execute('SELECT config_key, config_value FROM system_config');
    const config = rows.reduce((acc, r) => { acc[r.config_key] = r.config_value; return acc; }, {});
    res.json({ config });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PUT /api/superadmin/config — update system config
router.put('/config', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const {
      superadmin_session_timeout_minutes,
      smtp_host,
      smtp_port,
      smtp_encryption,
      smtp_username,
      smtp_password,
      smtp_from_email,
      smtp_from_name,
    } = req.body;
    const upserts = [];
    if (superadmin_session_timeout_minutes !== undefined) {
      const mins = parseInt(superadmin_session_timeout_minutes);
      if (isNaN(mins) || mins < 30)
        return res.status(400).json({ error: 'Superadmin session timeout must be at least 30 minutes.' });
      upserts.push(['superadmin_session_timeout_minutes', String(mins)]);
    }
    const configPairs = {
      smtp_host,
      smtp_port: smtp_port !== undefined ? String(smtp_port) : undefined,
      smtp_encryption,
      smtp_username,
      smtp_password,
      smtp_from_email,
      smtp_from_name,
    };
    for (const [key, value] of Object.entries(configPairs)) {
      if (value !== undefined) upserts.push([key, value]);
    }
    for (const [key, value] of upserts) {
      await pool.execute(
        `INSERT INTO system_config (config_key, config_value) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
        [key, value]
      );
    }
    await audit(req.user.userId, req.user.email, 'UPDATE', 'system_config', null, {
      superadmin_session_timeout_minutes,
      smtp_host,
      smtp_port,
      smtp_encryption,
      smtp_username,
      smtp_from_email,
      smtp_from_name,
      smtp_password: smtp_password ? '[UPDATED]' : undefined,
    });
    res.json({ message: 'Config updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/superadmin/config/test-email — verify SMTP config and optionally send a test email
router.post('/config/test-email', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT config_key, config_value FROM system_config');
    const currentConfig = rows.reduce((acc, row) => {
      acc[row.config_key] = row.config_value;
      return acc;
    }, {});

    const {
      smtp_host,
      smtp_port,
      smtp_encryption,
      smtp_username,
      smtp_password,
      smtp_from_email,
      smtp_from_name,
      test_email,
      mode,
    } = req.body || {};

    const host = smtp_host ?? currentConfig.smtp_host;
    const port = parseInt(smtp_port ?? currentConfig.smtp_port ?? '0', 10);
    const encryption = smtp_encryption ?? currentConfig.smtp_encryption ?? 'STARTTLS';
    const username = smtp_username ?? currentConfig.smtp_username;
    const password = smtp_password || currentConfig.smtp_password;
    const fromEmail = smtp_from_email ?? currentConfig.smtp_from_email ?? username;
    const fromName = smtp_from_name ?? currentConfig.smtp_from_name ?? 'MIMS Platform';

    if (!host || !port || !username || !password || !fromEmail) {
      return res.status(400).json({ error: 'SMTP host, port, username, password, and from email are required.' });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: encryption === 'SSL/TLS',
      requireTLS: encryption === 'STARTTLS',
      auth: { user: username, pass: password },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 10000,
    });

    await transporter.verify();

    if (mode === 'send') {
      if (!test_email) {
        return res.status(400).json({ error: 'Recipient email is required to send a test email.' });
      }
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: test_email,
        subject: 'MIMS SMTP test email',
        text: `Hello,\n\nThis is a test email from MIMS SuperAdmin 2FA Configuration.\n\nSMTP host: ${host}\nEncryption: ${encryption}\nSent at: ${new Date().toISOString()}\n`,
      });
      await audit(req.user.userId, req.user.email, 'TEST_SMTP_SEND', 'system_config', null, {
        smtp_host: host,
        smtp_port: String(port),
        smtp_encryption: encryption,
        smtp_username: username,
        smtp_from_email: fromEmail,
        test_email,
      });
      return res.json({ message: `Test email sent to ${test_email}.` });
    }

    await audit(req.user.userId, req.user.email, 'TEST_SMTP_VERIFY', 'system_config', null, {
      smtp_host: host,
      smtp_port: String(port),
      smtp_encryption: encryption,
      smtp_username: username,
      smtp_from_email: fromEmail,
    });
    return res.json({ message: 'SMTP connection verified successfully.' });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'SMTP test failed.' });
  }
});

// POST /api/superadmin/orgs/:id/sites — create site under an org
router.post('/orgs/:id/sites', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { name, country, is_primary } = req.body;
    if (!name) return res.status(400).json({ error: 'Site name is required.' });
    const [[existing]] = await pool.execute(
      'SELECT id FROM sites WHERE org_id = ? AND name = ?',
      [req.params.id, name.trim()]
    );
    if (existing) return res.status(409).json({ error: `A site named "${name.trim()}" already exists in this organisation.` });
    const [result] = await pool.execute(
      'INSERT INTO sites (org_id, name, country, is_primary) VALUES (?, ?, ?, ?)',
      [req.params.id, name.trim(), country || null, is_primary ? 1 : 0]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'site', result.insertId, { name, country, org_id: req.params.id });
    res.status(201).json({ id: result.insertId, name, country, is_primary, is_active: 1 });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PUT /api/superadmin/sites/:id — update site
router.put('/sites/:id', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { name, country, is_primary, is_active } = req.body;
    await pool.execute(
      'UPDATE sites SET name = ?, country = ?, is_primary = ?, is_active = ? WHERE id = ?',
      [name ?? null, country ?? null, is_primary ? 1 : 0, is_active ? 1 : 0, req.params.id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'site', req.params.id, req.body);
    res.json({ message: 'Updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// ── USERS ────────────────────────────────────────────────────────────────────

// GET /api/superadmin/all-users — full user list with org assignment (excludes superadmin system account)
router.get('/all-users', authenticate, requireRole('superadmin'), async (_req, res) => {
  try {
    const [users] = await pool.execute(`
      SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.password_reset_required,
             COALESCE(MAX(ufs.is_enabled), 0) AS two_factor_enabled,
             COALESCE(MAX(ufs.is_locked), 0) AS two_factor_locked,
             (SELECT GROUP_CONCAT(o2.name ORDER BY uoa2.last_accessed_at DESC SEPARATOR ', ')
              FROM user_org_access uoa2
              JOIN organisations o2 ON o2.id = uoa2.org_id
              WHERE uoa2.user_id = u.id AND uoa2.is_active = 1) AS org_name
      FROM users u
      LEFT JOIN user_2fa_settings ufs ON ufs.user_id = u.id
      WHERE u.role != 'superadmin'
      GROUP BY u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.password_reset_required
      ORDER BY u.created_at DESC
    `);
    res.json({ users });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/superadmin/users/create — create user (password auto-set to Manager@123, reset required on first login)
router.post('/users/create', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name and email are required.' });

    const defaultPassword = 'Manager@123';
    const hash = await bcrypt.hash(defaultPassword, 10);
    const userRole = role || 'agent';
    if (!ASSIGNABLE_ROLES.includes(userRole))
      return res.status(400).json({ error: `Invalid role. Allowed roles: ${ASSIGNABLE_ROLES.join(', ')}.` });

    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password, role, is_active, password_reset_required) VALUES (?, ?, ?, ?, 1, 1)',
      [name.trim(), email.trim().toLowerCase(), hash, userRole]
    );
    const userId = result.insertId;

    // Auto-assign default modules by role so user can access the app on first login
    const defaultModules = {
      admin:           ['mims_core', 'admin_console'],
      agent:           ['mims_core'],
      reviewer:        ['mims_core'],
      content_manager: ['mims_core', 'content_mgmt'],
    };
    const modules = defaultModules[userRole] || ['mims_core'];
    for (const mod of modules) {
      await pool.execute(
        'INSERT INTO user_module_permissions (user_id, module, can_access) VALUES (?, ?, 1)',
        [userId, mod]
      );
    }

    await audit(req.user.userId, req.user.email, 'CREATE', 'user', userId, { name, email, role: userRole, modules });
    res.status(201).json({ id: userId, name, email, role: userRole, is_active: 1, modules });
  } catch { res.status(409).json({ error: 'Email already exists.' }); }
});

// PUT /api/superadmin/users/:id — update user (name, email, role, org, active)
router.put('/users/:id', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { name, email, role, org_id, is_active } = req.body;
    if (role && !ASSIGNABLE_ROLES.includes(role))
      return res.status(400).json({ error: `Invalid role. Allowed roles: ${ASSIGNABLE_ROLES.join(', ')}.` });
    await pool.execute(
      'UPDATE users SET name = ?, email = ?, role = ?, org_id = ?, is_active = ? WHERE id = ?',
      [name, email, role, org_id || null, is_active ? 1 : 0, req.params.id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'user', req.params.id, { name, email, role, org_id, is_active });
    res.json({ message: 'Updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.post('/users/:id/reset-2fa', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM user_2fa_backup_codes WHERE user_id = ?', [id]);
    await pool.execute('DELETE FROM user_2fa_trusted_devices WHERE user_id = ?', [id]);
    await pool.execute('DELETE FROM user_2fa_challenges WHERE user_id = ?', [id]);
    await pool.execute(
      `UPDATE user_2fa_settings
       SET is_enabled = 0, preferred_method = NULL, totp_secret = NULL, failed_attempts = 0, is_locked = 0, updated_at = NOW()
       WHERE user_id = ?`,
      [id]
    );
    await audit(req.user.userId, req.user.email, 'RESET_2FA', 'user', Number(id), {});
    res.json({ message: 'User 2FA reset.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── AUDIT ────────────────────────────────────────────────────────────────────

// GET /api/superadmin/audit — general audit log (module access changes)
router.get('/audit', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const [rows] = await pool.execute(
      `SELECT id, user_id, user_name, action, entity, entity_id, details, created_at
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`
    );
    const [[{ cnt: total }]] = await pool.execute('SELECT COUNT(*) AS cnt FROM audit_logs');
    res.json({ logs: rows.map(r => ({ ...r, details: tryParse(r.details) })), total, limit, offset });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/superadmin/login-audit — login/logout event log
router.get('/login-audit', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit)  || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const status = req.query.status || null;

    let rows, total;
    if (status) {
      [rows] = await pool.execute(
        `SELECT id, user_id, user_name, role, login_time, logout_time, status, fail_reason
         FROM login_audit WHERE status = ? ORDER BY login_time DESC LIMIT ${limit} OFFSET ${offset}`,
        [status]
      );
      const [[{ cnt }]] = await pool.execute(
        'SELECT COUNT(*) AS cnt FROM login_audit WHERE status = ?', [status]
      );
      total = cnt;
    } else {
      [rows] = await pool.execute(
        `SELECT id, user_id, user_name, role, login_time, logout_time, status, fail_reason
         FROM login_audit ORDER BY login_time DESC LIMIT ${limit} OFFSET ${offset}`
      );
      const [[{ cnt }]] = await pool.execute('SELECT COUNT(*) AS cnt FROM login_audit');
      total = cnt;
    }
    res.json({ logs: rows, total, limit, offset });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// ── ORG ACCESS (user_org_access) ─────────────────────────────────────────────

// GET /api/superadmin/users/:id/org-access — list all org assignments for a user
router.get('/users/:id/org-access', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT uoa.id, uoa.org_id, uoa.primary_site_id, uoa.role_at_org, uoa.site_permission, uoa.is_active,
              o.name AS org_name,
              s.name AS site_name,
              (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', s2.id, 'name', s2.name))
               FROM sites s2 WHERE s2.org_id = uoa.org_id AND s2.is_active = 1) AS org_sites,
              (SELECT JSON_ARRAYAGG(ump.module)
               FROM user_module_permissions ump WHERE ump.user_id = uoa.user_id AND ump.can_access = 1) AS modules
       FROM user_org_access uoa
       JOIN organisations o ON o.id = uoa.org_id
       LEFT JOIN sites s ON s.id = uoa.primary_site_id
       WHERE uoa.user_id = ?
       ORDER BY o.name`,
      [req.params.id]
    );
    const parsed = rows.map(r => ({
      ...r,
      org_sites: tryParse(r.org_sites) || [],
      modules:   tryParse(r.modules)   || []
    }));
    res.json({ orgAccess: parsed });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/superadmin/users/:id/org-access — assign user to an org
router.post('/users/:id/org-access', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { org_id, primary_site_id, role_at_org, site_permission } = req.body;
    if (!org_id) return res.status(400).json({ error: 'org_id is required.' });
    const [result] = await pool.execute(
      `INSERT INTO user_org_access (user_id, org_id, primary_site_id, role_at_org, site_permission)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE primary_site_id = VALUES(primary_site_id),
         role_at_org = VALUES(role_at_org), site_permission = VALUES(site_permission), is_active = 1`,
      [req.params.id, org_id, primary_site_id || null, role_at_org || 'user', site_permission || 'full']
    );
    await audit(req.user.userId, req.user.email, 'ASSIGN_ORG', 'user_org_access', result.insertId,
      { user_id: req.params.id, org_id, role_at_org, site_permission });
    res.status(201).json({ message: 'Org access assigned.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PUT /api/superadmin/users/:id/org-access/:orgId — update role/site/permission for an org
router.put('/users/:id/org-access/:orgId', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    const { primary_site_id, role_at_org, site_permission, is_active } = req.body;
    await pool.execute(
      `UPDATE user_org_access SET primary_site_id = ?, role_at_org = ?, site_permission = ?, is_active = ?
       WHERE user_id = ? AND org_id = ?`,
      [primary_site_id || null, role_at_org || 'user', site_permission || 'full',
       is_active !== undefined ? (is_active ? 1 : 0) : 1, req.params.id, req.params.orgId]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE_ORG_ACCESS', 'user_org_access', null,
      { user_id: req.params.id, org_id: req.params.orgId });
    res.json({ message: 'Updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// DELETE /api/superadmin/users/:id/org-access/:orgId — remove org assignment
router.delete('/users/:id/org-access/:orgId', authenticate, requireRole('superadmin'), async (req, res) => {
  try {
    await pool.execute('DELETE FROM user_org_access WHERE user_id = ? AND org_id = ?',
      [req.params.id, req.params.orgId]);
    await audit(req.user.userId, req.user.email, 'REMOVE_ORG', 'user_org_access', null,
      { user_id: req.params.id, org_id: req.params.orgId });
    res.json({ message: 'Removed.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/superadmin/orgs-for-assignment — all active orgs with their sites (for assignment dropdown)
router.get('/orgs-for-assignment', authenticate, requireRole('superadmin'), async (_req, res) => {
  try {
    const [orgs]  = await pool.execute('SELECT id, name FROM organisations WHERE is_active = 1 ORDER BY name');
    const [sites] = await pool.execute('SELECT id, org_id, name FROM sites WHERE is_active = 1 ORDER BY name');
    const byOrg   = sites.reduce((acc, s) => { (acc[s.org_id] = acc[s.org_id] || []).push(s); return acc; }, {});
    res.json({ orgs: orgs.map(o => ({ ...o, sites: byOrg[o.id] || [] })) });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

function tryParse(str) {
  try { return JSON.parse(str) } catch { return str }
}

module.exports = router;
