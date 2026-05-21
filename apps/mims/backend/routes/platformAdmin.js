/**
 * routes/platformAdmin.js — Platform admin API
 * Platform admin manages organisations, users, sites, and per-user module access.
 * Clients cannot self-provision any billing-affecting resource.
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const pool = require('../database/db');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { accountCreationRateLimiter } = require('../middleware/rateLimiters');
const { validateUpload } = require('../middleware/uploadValidation');
const { emitPlatformAdminAlert, getSystemConfig, parseJson } = require('../services/alertService');
const {
  bootstrapOrg,
  getOrgReadiness,
  getPlatformReadinessSummary,
  repairOrgData,
} = require('../services/orgBootstrapService');

const ALLOWED_MODULES = ['mims_core', 'admin_console', 'content_mgmt', 'data_visualization', 'reports'];
const ASSIGNABLE_ROLES = ['admin', 'agent', 'reviewer', 'content_manager'];
const THRESHOLD_ALERT_EVENTS = new Set(['failed_login_spike', 'two_factor_lockout', 'service_error_threshold']);
const PLATFORM_ADMIN_EXCLUSION_SQL =
  "u.id NOT IN (SELECT ump.user_id FROM user_module_permissions ump WHERE ump.module = 'platform_admin_console' AND ump.can_access = 1)";

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

function parseIntSafe(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function generateTemporaryPassword() {
  return crypto.randomBytes(18).toString('base64').replace(/[+/=]/g, '').slice(0, 20);
}

function normalizeAlertRulePayload(input, fallback = {}) {
  const eventType = input.event_type ?? fallback.event_type;
  const isThresholdRule = THRESHOLD_ALERT_EVENTS.has(eventType);
  return {
    name: input.name ?? fallback.name,
    event_type: eventType,
    severity: input.severity ?? fallback.severity ?? 'medium',
    channels: input.channels ?? fallback.channels ?? 'email,in_app',
    recipient_emails: input.recipient_emails ?? fallback.recipient_emails ?? '',
    threshold_value: isThresholdRule ? parseIntSafe(input.threshold_value, fallback.threshold_value ?? 1) : 1,
    window_minutes: isThresholdRule ? parseIntSafe(input.window_minutes, fallback.window_minutes ?? 15) : 0,
    cooldown_minutes: parseIntSafe(input.cooldown_minutes, fallback.cooldown_minutes ?? 30),
    is_active: input.is_active !== undefined ? (input.is_active ? 1 : 0) : (fallback.is_active ?? 1),
  };
}

function csvEscape(value) {
  const normalized = value === undefined || value === null ? '' : String(value);
  if (normalized.includes('"') || normalized.includes(',') || normalized.includes('\n')) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function sendCsv(res, filename, rows) {
  if (!rows.length) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send('No data\n');
  }
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(key => csvEscape(row[key])).join(',')),
  ];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(lines.join('\n'));
}

async function getDashboardSummary() {
  const [
    [[orgTotals]],
    [[userTotals]],
    [[failedLogins]],
    [[lockedUsers]],
    [recentAudit],
    [recentLogins],
    [[smtpStatus]],
    [[unreadNotifications]],
    [[alertEvents]],
  ] = await Promise.all([
    pool.execute(`SELECT COUNT(*) AS total,
                         SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
                         SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive
                  FROM organisations`),
    pool.execute(`SELECT COUNT(*) AS total,
                         SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
                         SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive
                  FROM users
                  WHERE id NOT IN (
                    SELECT user_id FROM user_module_permissions
                    WHERE module = 'platform_admin_console' AND can_access = 1
                  )`),
    pool.execute(`SELECT COUNT(*) AS count
                  FROM login_audit
                  WHERE status = 'failed'
                    AND login_time >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`),
    pool.execute(`SELECT COUNT(DISTINCT user_id) AS count
                  FROM user_2fa_settings
                  WHERE is_locked = 1`),
    pool.execute(`SELECT id, user_name, action, entity, entity_id, created_at
                  FROM audit_logs
                  ORDER BY created_at DESC
                  LIMIT 5`),
    pool.execute(`SELECT id, user_name, status, fail_reason, auth_event, login_time
                  FROM login_audit
                  ORDER BY login_time DESC
                  LIMIT 5`),
    pool.execute(`SELECT MAX(last_smtp_test_status) AS last_status
                  FROM email_accounts`),
    pool.execute(`SELECT COUNT(*) AS count
                  FROM notifications n
                  JOIN user_module_permissions ump ON ump.user_id = n.user_id
                  WHERE ump.module = 'platform_admin_console' AND ump.can_access = 1 AND n.is_read = 0`),
    pool.execute(`SELECT COUNT(*) AS count
                  FROM platform_admin_alert_events
                  WHERE created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`),
  ]);

  const systemConfig = await getSystemConfig();
  const readiness = await getPlatformReadinessSummary();
  return {
    kpis: {
      organisations: orgTotals || { total: 0, active: 0, inactive: 0 },
      users: userTotals || { total: 0, active: 0, inactive: 0 },
      failedLogins24h: failedLogins?.count || 0,
      lockedUsers: lockedUsers?.count || 0,
      unreadNotifications: unreadNotifications?.count || 0,
      alertEvents24h: alertEvents?.count || 0,
      smtpStatus: smtpStatus?.last_status || (systemConfig.smtp_host ? 'configured' : 'not configured'),
    },
    readiness: {
      totalOrgs: readiness.total_orgs,
      readyOrgs: readiness.ready_orgs,
      attentionOrgs: readiness.attention_orgs,
      averageScore: readiness.average_score,
      totalBlockers: readiness.total_blockers,
    },
    recentAudit: recentAudit || [],
    recentLogins: recentLogins || [],
  };
}

// GET /api/admin/platform/users — list users with current module overrides (excludes platform admin system account)
router.get('/users', authenticate, requireRole('platform_admin'), async (_req, res) => {
  try {
    const [users] = await pool.execute(
      `SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at
       FROM users u
       WHERE ${PLATFORM_ADMIN_EXCLUSION_SQL}
       ORDER BY u.created_at DESC`
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

// PUT /api/admin/platform/users/:id/modules — replace module list for a user
router.put('/users/:id/modules', authenticate, requireRole('platform_admin'), async (req, res) => {
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

router.get('/dashboard', authenticate, requireRole('admin', 'platform_admin'), async (_req, res) => {
  try {
    const summary = await getDashboardSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── ORGANISATIONS ────────────────────────────────────────────────────────────

// GET /api/admin/platform/orgs — list all orgs with their sites
router.get('/orgs', authenticate, requireRole('admin', 'platform_admin'), async (_req, res) => {
  try {
    const [orgs] = await pool.execute('SELECT * FROM organisations ORDER BY name');
    const [sites] = await pool.execute('SELECT * FROM sites ORDER BY name');
    const byOrg = sites.reduce((acc, s) => { (acc[s.org_id] = acc[s.org_id] || []).push(s); return acc; }, {});
    const readiness = await Promise.all(orgs.map((org) => getOrgReadiness(org.id)));
    const readinessByOrg = readiness.reduce((acc, item) => {
      acc[item.org_id] = item;
      return acc;
    }, {});
    res.json({ orgs: orgs.map(o => ({ ...o, sites: byOrg[o.id] || [], readiness: readinessByOrg[o.id] || null })) });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/admin/platform/orgs — create organisation
router.post('/orgs', authenticate, requireRole('admin', 'platform_admin'), validate(schemas.createOrg), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Organisation name is required.' });
  try {
    const [result] = await pool.execute('INSERT INTO organisations (name) VALUES (?)', [name.trim()]);
    const readiness = await bootstrapOrg(result.insertId, req.user.userId);
    await audit(req.user.userId, req.user.email, 'CREATE', 'organisation', result.insertId, { name });
    res.status(201).json({ id: result.insertId, name, is_active: 1, readiness });
  } catch { res.status(409).json({ error: 'Organisation name already exists.' }); }
});

// PUT /api/admin/platform/orgs/:id — update org (name / active status / session timeout)
router.put('/orgs/:id', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const {
      name,
      is_active,
      session_timeout_minutes,
      two_factor_enabled,
      two_factor_methods,
      two_factor_remember_days,
    } = req.body;
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
    if (!existing.is_active && is_active === 1) {
      const readiness = await getOrgReadiness(Number(req.params.id));
      if (!readiness.ready) {
        return res.status(409).json({
          error: 'Organisation is not ready for activation.',
          readiness,
        });
      }
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
      name, is_active, session_timeout_minutes, two_factor_enabled, two_factor_methods,
      two_factor_remember_days,
    });
    if (existing.is_active && is_active === 0) {
      await emitPlatformAdminAlert('organization_deactivated', {
        severity: 'medium',
        title: 'Organisation deactivated',
        message: `${existing.name} was deactivated by a platform admin.`,
        metadata: { orgId: Number(req.params.id), orgName: existing.name, updatedBy: req.user.email },
        linkUrl: '/mims-admin?standalone=1',
      });
    }
    res.json({ message: 'Updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.get('/orgs/:id/readiness', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const readiness = await getOrgReadiness(Number(req.params.id));
    res.json({ readiness });
  } catch (err) {
    if (String(err.message || '').includes('Organisation not found')) {
      return res.status(404).json({ error: 'Organisation not found.' });
    }
    return res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/orgs/:id/bootstrap', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const readiness = await bootstrapOrg(Number(req.params.id), req.user.userId);
    await audit(req.user.userId, req.user.email, 'BOOTSTRAP', 'organisation', Number(req.params.id), { source: 'platform_admin' });
    res.json({ message: 'Organisation bootstrap completed.', readiness });
  } catch (err) {
    if (String(err.message || '').includes('Organisation not found')) {
      return res.status(404).json({ error: 'Organisation not found.' });
    }
    return res.status(500).json({ error: err.message || 'Server error.' });
  }
});

router.post('/orgs/:id/repair', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const readiness = await repairOrgData(Number(req.params.id));
    await audit(req.user.userId, req.user.email, 'REPAIR', 'organisation', Number(req.params.id), { source: 'platform_admin' });
    res.json({ message: 'Organisation data repair completed.', readiness });
  } catch (err) {
    if (String(err.message || '').includes('Organisation not found')) {
      return res.status(404).json({ error: 'Organisation not found.' });
    }
    return res.status(500).json({ error: err.message || 'Server error.' });
  }
});

// GET /api/admin/platform/config — get system config (e.g. platform admin timeout)
router.get('/config', authenticate, requireRole('admin', 'platform_admin'), async (_req, res) => {
  try {
    const [rows] = await pool.execute('SELECT config_key, config_value FROM system_config');
    const config = rows.reduce((acc, r) => { acc[r.config_key] = r.config_value; return acc; }, {});
    const sensitiveKeyPattern = /(password|secret|token|api[_-]?key)/i;
    for (const [key, value] of Object.entries(config)) {
      if (!sensitiveKeyPattern.test(key)) continue;
      config[`${key}_set`] = !!String(value || '').trim();
      delete config[key];
    }
    res.json({ config });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PUT /api/admin/platform/config — update system config
router.put('/config', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const {
      platform_admin_session_timeout_minutes,
      smtp_host,
      smtp_port,
      smtp_encryption,
      smtp_username,
      smtp_password,
      smtp_from_email,
      smtp_from_name,
    } = req.body;
    const upserts = [];
    const timeoutValue = platform_admin_session_timeout_minutes;
    if (timeoutValue !== undefined) {
      const mins = parseInt(timeoutValue);
      if (isNaN(mins) || mins < 30)
        return res.status(400).json({ error: 'Platform admin session timeout must be at least 30 minutes.' });
      upserts.push(['platform_admin_session_timeout_minutes', String(mins)]);
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
      platform_admin_session_timeout_minutes: timeoutValue,
      smtp_host,
      smtp_port,
      smtp_encryption,
      smtp_username,
      smtp_from_email,
      smtp_from_name,
      smtp_password: smtp_password ? '[UPDATED]' : undefined,
    });
    await emitPlatformAdminAlert('sensitive_config_change', {
      severity: 'medium',
      title: 'Sensitive platform admin configuration changed',
      message: `System configuration was updated by ${req.user.email}.`,
      metadata: {
        updatedBy: req.user.email,
        changedKeys: Object.keys(configPairs).filter(key => configPairs[key] !== undefined)
          .concat(timeoutValue !== undefined ? ['platform_admin_session_timeout_minutes'] : []),
      },
      linkUrl: '/mims-admin?standalone=1',
    });
    res.json({ message: 'Config updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/admin/platform/config/test-email — verify SMTP config and optionally send a test email
router.post('/config/test-email', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
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
        text: `Hello,\n\nThis is a test email from MIMS Platform Admin 2FA Configuration.\n\nSMTP host: ${host}\nEncryption: ${encryption}\nSent at: ${new Date().toISOString()}\n`,
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
    await emitPlatformAdminAlert('smtp_failure', {
      severity: 'high',
      title: 'SMTP verification failed',
      message: err.message || 'SMTP test failed.',
      metadata: { updatedBy: req.user.email },
      linkUrl: '/mims-admin?standalone=1',
    });
    return res.status(400).json({ error: err.message || 'SMTP test failed.' });
  }
});

// POST /api/admin/platform/orgs/:id/sites — create site under an org
router.post('/orgs/:id/sites', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
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

// PUT /api/admin/platform/sites/:id — update site
router.put('/sites/:id', authenticate, requireRole('admin', 'platform_admin'), async (req, res) => {
  try {
    const { name, country, is_primary, is_active } = req.body;
    const [[existing]] = await pool.execute('SELECT id, name, is_active FROM sites WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Site not found.' });
    await pool.execute(
      'UPDATE sites SET name = ?, country = ?, is_primary = ?, is_active = ? WHERE id = ?',
      [name ?? null, country ?? null, is_primary ? 1 : 0, is_active ? 1 : 0, req.params.id]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'site', req.params.id, req.body);
    if (existing.is_active && is_active === 0) {
      await emitPlatformAdminAlert('site_deactivated', {
        severity: 'medium',
        title: 'Site deactivated',
        message: `${existing.name} was deactivated by a platform admin.`,
        metadata: { siteId: Number(req.params.id), siteName: existing.name, updatedBy: req.user.email },
        linkUrl: '/mims-admin?standalone=1',
      });
    }
    res.json({ message: 'Updated.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// ── USERS ────────────────────────────────────────────────────────────────────

// GET /api/admin/platform/all-users — full user list with org assignment (excludes the platform-admin account)
router.get('/all-users', authenticate, requireRole('platform_admin'), async (_req, res) => {
  try {
    const [users] = await pool.execute(`
      SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.password_reset_required,
             COALESCE(MAX(ufs.is_enabled), 0) AS two_factor_enabled,
             COALESCE(MAX(ufs.is_locked), 0) AS two_factor_locked,
             (SELECT GROUP_CONCAT(o2.name ORDER BY uoa2.last_accessed_at DESC SEPARATOR ', ')
              FROM user_org_access uoa2
              JOIN organisations o2 ON o2.id = uoa2.org_id
              WHERE uoa2.user_id = u.id AND uoa2.is_active = 1) AS org_name,
             (SELECT MAX(la.login_time)
              FROM login_audit la
              WHERE la.user_id = u.id AND la.status = 'success') AS last_login_at
      FROM users u
      LEFT JOIN user_2fa_settings ufs ON ufs.user_id = u.id
      WHERE ${PLATFORM_ADMIN_EXCLUSION_SQL}
      GROUP BY u.id, u.name, u.email, u.role, u.is_active, u.created_at, u.password_reset_required
      ORDER BY u.created_at DESC
    `);
    res.json({ users });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// POST /api/admin/platform/users/create — create user with one-time temporary password
router.post('/users/create', authenticate, requireRole('platform_admin'), accountCreationRateLimiter, validate(schemas.createUser), async (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name and email are required.' });

    const temporaryPassword = generateTemporaryPassword();
    const hash = await bcrypt.hash(temporaryPassword, 12);
    const userRole = role || 'agent';
    if (!ASSIGNABLE_ROLES.includes(userRole))
      return res.status(400).json({ error: `Invalid role. Allowed roles: ${ASSIGNABLE_ROLES.join(', ')}.` });

    const [result] = await pool.execute(
      'INSERT INTO users (name, email, password, role, is_active, password_reset_required, email_verified) VALUES (?, ?, ?, ?, 1, 1, 1)',
      [name.trim(), email.trim().toLowerCase(), hash, userRole]
    );
    const userId = result.insertId;

    // Auto-assign default modules by role so user can access the app on first login
    const defaultModules = {
      admin:           ['mims_core', 'admin_console', 'data_visualization', 'reports'],
      agent:           ['mims_core'],
      reviewer:        ['mims_core', 'data_visualization', 'reports'],
      content_manager: ['mims_core', 'content_mgmt'],
    };
    const modules = defaultModules[userRole] || ['mims_core'];
    for (const mod of modules) {
      await pool.execute(
        'INSERT INTO user_module_permissions (user_id, module, can_access) VALUES (?, ?, 1)',
        [userId, mod]
      );
    }

    await audit(req.user.userId, req.user.email, 'CREATE', 'user', userId, {
      name,
      email,
      role: userRole,
      modules,
      temporary_password: '[GENERATED]',
    });
    res.status(201).json({
      id: userId,
      name,
      email,
      role: userRole,
      is_active: 1,
      modules,
      temporary_password: temporaryPassword,
      password_reset_required: 1,
    });
  } catch { res.status(409).json({ error: 'Email already exists.' }); }
});

// PUT /api/admin/platform/users/:id — update user (name, email, role, org, active)
router.put('/users/:id', authenticate, requireRole('platform_admin'), async (req, res) => {
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

router.post('/users/:id/reset-2fa', authenticate, requireRole('platform_admin'), async (req, res) => {
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

router.post('/users/:id/force-password-reset', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const [[user]] = await pool.execute(
      `SELECT u.id, u.name, u.role
       FROM users u
       WHERE u.id = ? AND ${PLATFORM_ADMIN_EXCLUSION_SQL}`,
      [id]
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });
    await pool.execute(
      'UPDATE users SET password_reset_required = 1, updated_at = NOW() WHERE id = ?',
      [id]
    );
    await audit(req.user.userId, req.user.email, 'FORCE_PASSWORD_RESET', 'user', Number(id), {});
    res.json({ message: `${user.name} will be required to reset password on next login.` });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/users/:id/unlock', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const [[user]] = await pool.execute(
      `SELECT u.id, u.name, u.role
       FROM users u
       WHERE u.id = ? AND ${PLATFORM_ADMIN_EXCLUSION_SQL}`,
      [id]
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });
    await pool.execute(
      `UPDATE user_2fa_settings
       SET failed_attempts = 0, is_locked = 0, updated_at = NOW()
       WHERE user_id = ?`,
      [id]
    );
    await audit(req.user.userId, req.user.email, 'UNLOCK_USER_SECURITY', 'user', Number(id), {});
    res.json({ message: `${user.name} security lock state cleared.` });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/users/bulk-action', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const { userIds, action } = req.body || {};
    const ids = Array.isArray(userIds) ? userIds.map(id => Number(id)).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: 'Select at least one user.' });
    if (!['activate', 'deactivate', 'force_password_reset'].includes(action)) {
      return res.status(400).json({ error: 'Unsupported bulk action.' });
    }

    if (action === 'force_password_reset') {
      await pool.query(
        `UPDATE users
         SET password_reset_required = 1, updated_at = NOW()
         WHERE id IN (?) AND id NOT IN (
           SELECT user_id FROM user_module_permissions
           WHERE module = 'platform_admin_console' AND can_access = 1
         )`,
        [ids]
      );
    } else {
      await pool.query(
        `UPDATE users
         SET is_active = ?, updated_at = NOW()
         WHERE id IN (?) AND id NOT IN (
           SELECT user_id FROM user_module_permissions
           WHERE module = 'platform_admin_console' AND can_access = 1
         )`,
        [action === 'activate' ? 1 : 0, ids]
      );
    }
    await audit(req.user.userId, req.user.email, 'BULK_USER_ACTION', 'user', null, { action, userIds: ids });
    res.json({ message: 'Bulk action completed.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── AUDIT ────────────────────────────────────────────────────────────────────

// GET /api/admin/platform/audit — general audit log (module access changes)
router.get('/audit', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const limit = Math.min(parseIntSafe(req.query.limit, 50), 200);
    const offset = parseIntSafe(req.query.offset, 0);
    const filters = [];
    const params = [];
    if (req.query.user) {
      filters.push('user_name LIKE ?');
      params.push(`%${req.query.user.trim()}%`);
    }
    if (req.query.action) {
      filters.push('action = ?');
      params.push(req.query.action.trim());
    }
    if (req.query.entity) {
      filters.push('entity = ?');
      params.push(req.query.entity.trim());
    }
    if (req.query.from) {
      filters.push('DATE(created_at) >= ?');
      params.push(req.query.from);
    }
    if (req.query.to) {
      filters.push('DATE(created_at) <= ?');
      params.push(req.query.to);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT id, user_id, user_name, action, entity, entity_id, details, created_at
       FROM audit_logs
       ${where}
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const [[{ cnt: total }]] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM audit_logs ${where}`,
      params
    );
    const mapped = rows.map(r => ({ ...r, details: tryParse(r.details) }));
    if (req.query.export === 'csv') {
      return sendCsv(res, 'platform-admin-audit.csv', mapped.map(log => ({
        time: log.created_at,
        user: log.user_name,
        action: log.action,
        entity: `${log.entity}${log.entity_id ? ` #${log.entity_id}` : ''}`,
        details: typeof log.details === 'object' ? JSON.stringify(log.details) : (log.details || ''),
      })));
    }
    res.json({ logs: mapped, total, limit, offset });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/admin/platform/login-audit — login/logout event log
router.get('/login-audit', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const limit = Math.min(parseIntSafe(req.query.limit, 50), 200);
    const offset = parseIntSafe(req.query.offset, 0);
    const filters = [];
    const params = [];
    if (req.query.status) {
      filters.push('status = ?');
      params.push(req.query.status);
    }
    if (req.query.user) {
      filters.push('user_name LIKE ?');
      params.push(`%${req.query.user.trim()}%`);
    }
    if (req.query.role) {
      filters.push('role = ?');
      params.push(req.query.role.trim());
    }
    if (req.query.from) {
      filters.push('DATE(login_time) >= ?');
      params.push(req.query.from);
    }
    if (req.query.to) {
      filters.push('DATE(login_time) <= ?');
      params.push(req.query.to);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT id, user_id, user_name, role, login_time, logout_time, status, fail_reason, auth_event, ip_address, location
       FROM login_audit
       ${where}
       ORDER BY login_time DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const [[{ cnt: total }]] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM login_audit ${where}`,
      params
    );
    if (req.query.export === 'csv') {
      return sendCsv(res, 'platform-admin-login-audit.csv', rows.map(log => ({
        login_time: log.login_time,
        user: log.user_name,
        role: log.role || '',
        status: log.status,
        auth_event: log.auth_event || '',
        ip_address: log.ip_address || '',
        location: log.location || '',
        fail_reason: log.fail_reason || '',
        logout_time: log.logout_time || '',
      })));
    }
    res.json({ logs: rows, total, limit, offset });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

router.get('/alerts/rules', authenticate, requireRole('platform_admin'), async (_req, res) => {
  try {
    const [rules] = await pool.execute(
      'SELECT * FROM platform_admin_alert_rules ORDER BY is_active DESC, name ASC'
    );
    res.json({ rules });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/alerts/rules', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const payload = normalizeAlertRulePayload(req.body || {});
    if (!payload.name || !payload.event_type) return res.status(400).json({ error: 'name and event_type are required.' });
    const [result] = await pool.execute(
      `INSERT INTO platform_admin_alert_rules
       (name, event_type, severity, channels, recipient_emails, threshold_value, window_minutes, cooldown_minutes, is_active, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payload.name.trim(),
        payload.event_type,
        payload.severity,
        payload.channels,
        payload.recipient_emails,
        payload.threshold_value,
        payload.window_minutes,
        payload.cooldown_minutes,
        payload.is_active,
        req.user.userId,
        req.user.userId,
      ]
    );
    await audit(req.user.userId, req.user.email, 'CREATE', 'platform_admin_alert_rule', result.insertId, payload);
    res.status(201).json({ message: 'Alert rule created.', id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.put('/alerts/rules/:id', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const [[existing]] = await pool.execute('SELECT * FROM platform_admin_alert_rules WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Alert rule not found.' });
    const payload = normalizeAlertRulePayload(req.body || {}, existing);
    await pool.execute(
      `UPDATE platform_admin_alert_rules
       SET name = ?, event_type = ?, severity = ?, channels = ?, recipient_emails = ?,
           threshold_value = ?, window_minutes = ?, cooldown_minutes = ?, is_active = ?, updated_by = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        payload.name,
        payload.event_type,
        payload.severity,
        payload.channels,
        payload.recipient_emails,
        payload.threshold_value,
        payload.window_minutes,
        payload.cooldown_minutes,
        payload.is_active,
        req.user.userId,
        req.params.id,
      ]
    );
    await audit(req.user.userId, req.user.email, 'UPDATE', 'platform_admin_alert_rule', Number(req.params.id), payload);
    res.json({ message: 'Alert rule updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/alerts/rules/:id', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const [[existing]] = await pool.execute('SELECT * FROM platform_admin_alert_rules WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Alert rule not found.' });

    await pool.execute('DELETE FROM platform_admin_alert_rules WHERE id = ?', [req.params.id]);
    await audit(req.user.userId, req.user.email, 'DELETE', 'platform_admin_alert_rule', Number(req.params.id), {
      name: existing.name,
      event_type: existing.event_type,
    });
    res.json({ message: 'Alert rule deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/alerts/events', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const limit = Math.min(parseIntSafe(req.query.limit, 50), 200);
    const offset = parseIntSafe(req.query.offset, 0);
    const filters = [];
    const params = [];
    if (req.query.event_type) {
      filters.push('e.event_type = ?');
      params.push(req.query.event_type);
    }
    if (req.query.severity) {
      filters.push('e.severity = ?');
      params.push(req.query.severity);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT e.*, r.name AS rule_name
       FROM platform_admin_alert_events e
       LEFT JOIN platform_admin_alert_rules r ON r.id = e.rule_id
       ${where}
       ORDER BY e.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );
    const [[{ cnt: total }]] = await pool.execute(
      `SELECT COUNT(*) AS cnt
       FROM platform_admin_alert_events e
       ${where}`,
      params
    );
    res.json({ events: rows.map(row => ({ ...row, metadata: parseJson(row.metadata, null) })), total, limit, offset });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/notifications', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const limit = Math.min(parseIntSafe(req.query.limit, 50), 200);
    const offset = parseIntSafe(req.query.offset, 0);
    const [rows] = await pool.execute(
      `SELECT id, title, message, link_url, metadata, is_read, created_at, read_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      [req.user.userId]
    );
    const [[{ cnt: total }]] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ?',
      [req.user.userId]
    );
    const [[{ cnt: unread }]] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.userId]
    );
    res.json({
      notifications: rows.map(row => ({ ...row, metadata: parseJson(row.metadata, null) })),
      total,
      unread,
      limit,
      offset,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/notifications/:id/read', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    await pool.execute(
      'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    res.json({ message: 'Notification marked as read.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/platform/notifications/read — clear all read notifications
// MUST be registered before /:id to prevent Express matching 'read' as a param
router.delete('/notifications/read', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM notifications WHERE user_id = ? AND is_read = 1',
      [req.user.userId]
    );
    res.json({ success: true, deleted: result.affectedRows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/platform/notifications/:id — delete a single notification
router.delete('/notifications/:id', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    await pool.execute(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// ── ORG ACCESS (user_org_access) ─────────────────────────────────────────────

// GET /api/admin/platform/users/:id/org-access — list all org assignments for a user
router.get('/users/:id/org-access', authenticate, requireRole('platform_admin'), async (req, res) => {
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

// POST /api/admin/platform/users/:id/org-access — assign user to an org
router.post('/users/:id/org-access', authenticate, requireRole('platform_admin'), async (req, res) => {
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

// PUT /api/admin/platform/users/:id/org-access/:orgId — update role/site/permission for an org
router.put('/users/:id/org-access/:orgId', authenticate, requireRole('platform_admin'), async (req, res) => {
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

// DELETE /api/admin/platform/users/:id/org-access/:orgId — remove org assignment
router.delete('/users/:id/org-access/:orgId', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    await pool.execute('DELETE FROM user_org_access WHERE user_id = ? AND org_id = ?',
      [req.params.id, req.params.orgId]);
    await audit(req.user.userId, req.user.email, 'REMOVE_ORG', 'user_org_access', null,
      { user_id: req.params.id, org_id: req.params.orgId });
    res.json({ message: 'Removed.' });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// GET /api/admin/platform/orgs-for-assignment — all active orgs with their sites (for assignment dropdown)
router.get('/orgs-for-assignment', authenticate, requireRole('admin', 'platform_admin'), async (_req, res) => {
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

// ── ALERT EMAIL TEMPLATE ─────────────────────────────────────────────────────

const DEFAULT_ALERT_EMAIL_SUBJECT = 'MIMS Alert: {{alert_title}}';
const DEFAULT_ALERT_EMAIL_BODY =
  'Alert: {{alert_title}}\nSeverity: {{severity}}\nOrganisation: {{org_name}}\nTriggered at: {{triggered_at}}\n\n{{message}}';

// GET /api/admin/platform/alert-email-template
router.get('/alert-email-template', authenticate, requireRole('platform_admin'), async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT config_key, config_value FROM system_config WHERE config_key IN ('alert_email_subject','alert_email_body')"
    );
    const map = rows.reduce((a, r) => { a[r.config_key] = r.config_value; return a; }, {});
    res.json({
      subject: map.alert_email_subject || DEFAULT_ALERT_EMAIL_SUBJECT,
      body:    map.alert_email_body    || DEFAULT_ALERT_EMAIL_BODY,
    });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// PUT /api/admin/platform/alert-email-template
router.put('/alert-email-template', authenticate, requireRole('platform_admin'), async (req, res) => {
  try {
    const { subject, body } = req.body;
    if (!subject || !body) return res.status(400).json({ error: 'subject and body are required.' });
    await pool.execute(
      "INSERT INTO system_config (config_key, config_value) VALUES ('alert_email_subject', ?) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)",
      [subject]
    );
    await pool.execute(
      "INSERT INTO system_config (config_key, config_value) VALUES ('alert_email_body', ?) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)",
      [body]
    );
    res.json({ success: true, subject, body });
  } catch (err) { res.status(500).json({ error: 'Server error.' }); }
});

// ── ORG LOGO UPLOAD ───────────────────────────────────────────────────────────

const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(__dirname, '../storage/org_logos');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `org_${req.params.orgId}_${Date.now()}${ext}`);
  },
});
const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  },
});

// POST /api/admin/platform/orgs/:orgId/logo
router.post('/orgs/:orgId/logo', authenticate, requireRole('admin', 'platform_admin'), logoUpload.single('logo'), validateUpload(['image']), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const logoUrl = `/storage/org_logos/${req.file.filename}`;
    await pool.execute(
      'UPDATE organisations SET logo_url = ? WHERE id = ?',
      [logoUrl, req.params.orgId]
    );
    res.json({ success: true, logo_url: logoUrl });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Server error.' });
  }
});

module.exports = router;
