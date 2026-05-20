'use strict';

const express = require('express');
const nodemailer = require('nodemailer');
const pool = require('../../database/db');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');
const { emitPlatformAdminAlert } = require('../../services/alertService');
const { hasGlobalAdminScope } = require('../../utils/adminScope');

const router = express.Router();
const adminTwoFactorAuth = [authenticate, requireRole('admin', 'platform_admin'), requireOrg];

function parseIntSafe(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function audit(userId, userName, action, entity, entityId, details) {
  try {
    await pool.execute(
      `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, userName, action, entity, entityId, JSON.stringify(details)]
    );
  } catch (_) {}
}

function assertOrgScope(req, orgId) {
  if (hasGlobalAdminScope(req.user)) return null;
  if (Number(req.user.orgId) === Number(orgId)) return null;
  const err = new Error('You can update 2FA only for your active organisation.');
  err.status = 403;
  return err;
}

function handleError(res, err) {
  return res.status(err.status || 500).json({ error: err.message || 'Server error.' });
}

// GET /api/admin/two-factor/orgs
router.get('/two-factor/orgs', ...adminTwoFactorAuth, async (req, res) => {
  try {
    const isPlatformAdmin = hasGlobalAdminScope(req.user);
    const [orgs] = await pool.execute(
      isPlatformAdmin ? 'SELECT * FROM organisations ORDER BY name' : 'SELECT * FROM organisations WHERE id = ? ORDER BY name',
      isPlatformAdmin ? [] : [req.user.orgId]
    );
    return res.json({ orgs });
  } catch (err) {
    return handleError(res, err);
  }
});

// PUT /api/admin/two-factor/orgs/:id
router.put('/two-factor/orgs/:id', ...adminTwoFactorAuth, async (req, res) => {
  try {
    const scopeError = assertOrgScope(req, req.params.id);
    if (scopeError) throw scopeError;

    const [[existing]] = await pool.execute('SELECT * FROM organisations WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Organisation not found.' });

    const sessionTimeout = parseIntSafe(req.body.session_timeout_minutes, existing.session_timeout_minutes || 30);
    if (sessionTimeout < 15) {
      return res.status(400).json({ error: 'Session timeout must be at least 15 minutes.' });
    }

    const rememberDays = parseIntSafe(req.body.two_factor_remember_days, existing.two_factor_remember_days || 7);
    if (rememberDays < 1) {
      return res.status(400).json({ error: 'Remember-device duration must be at least 1 day.' });
    }

    await pool.execute(
      `UPDATE organisations
       SET session_timeout_minutes = ?,
           two_factor_enabled = ?,
           two_factor_methods = ?,
           two_factor_remember_days = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        sessionTimeout,
        req.body.two_factor_enabled !== undefined ? (req.body.two_factor_enabled ? 1 : 0) : existing.two_factor_enabled,
        req.body.two_factor_methods ?? existing.two_factor_methods ?? 'email,totp',
        rememberDays,
        req.params.id,
      ]
    );

    await audit(req.user.userId, req.user.email, 'UPDATE', 'organisation_2fa', req.params.id, {
      session_timeout_minutes: sessionTimeout,
      two_factor_enabled: req.body.two_factor_enabled,
      two_factor_methods: req.body.two_factor_methods,
      two_factor_remember_days: rememberDays,
      source: 'mims_admin_system_setup',
    });

    return res.json({ message: '2FA settings updated.' });
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /api/admin/two-factor/config
router.get('/two-factor/config', ...adminTwoFactorAuth, async (_req, res) => {
  try {
    const [rows] = await pool.execute('SELECT config_key, config_value FROM system_config');
    const config = rows.reduce((acc, row) => {
      acc[row.config_key] = row.config_value;
      return acc;
    }, {});
    if (config.platform_admin_session_timeout_minutes === undefined && config.superadmin_session_timeout_minutes !== undefined) {
      config.platform_admin_session_timeout_minutes = config.superadmin_session_timeout_minutes;
    }
    const sensitiveKeyPattern = /(password|secret|token|api[_-]?key)/i;
    for (const [key, value] of Object.entries(config)) {
      if (!sensitiveKeyPattern.test(key)) continue;
      config[`${key}_set`] = !!String(value || '').trim();
      delete config[key];
    }
    return res.json({ config });
  } catch (err) {
    return handleError(res, err);
  }
});

// PUT /api/admin/two-factor/config
router.put('/two-factor/config', ...adminTwoFactorAuth, async (req, res) => {
  try {
    const {
      platform_admin_session_timeout_minutes,
      superadmin_session_timeout_minutes,
      smtp_host,
      smtp_port,
      smtp_encryption,
      smtp_username,
      smtp_password,
      smtp_from_email,
      smtp_from_name,
    } = req.body || {};

    const upserts = [];
    const timeoutValue = platform_admin_session_timeout_minutes ?? superadmin_session_timeout_minutes;
    if (timeoutValue !== undefined) {
      const mins = parseIntSafe(timeoutValue, 0);
      if (mins < 30) return res.status(400).json({ error: 'Platform admin session timeout must be at least 30 minutes.' });
      upserts.push(['platform_admin_session_timeout_minutes', String(mins)]);
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
        `INSERT INTO system_config (config_key, config_value)
         VALUES (?, ?)
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
      source: 'mims_admin_system_setup',
    });

    await emitPlatformAdminAlert('sensitive_config_change', {
      severity: 'medium',
      title: 'Sensitive MIMS Admin configuration changed',
      message: `2FA system configuration was updated by ${req.user.email}.`,
      metadata: {
        updatedBy: req.user.email,
        changedKeys: Object.keys(configPairs).filter(key => configPairs[key] !== undefined)
          .concat(timeoutValue !== undefined ? ['platform_admin_session_timeout_minutes'] : []),
      },
      linkUrl: '/mims/mims-admin',
    });

    return res.json({ message: 'Config updated.' });
  } catch (err) {
    return handleError(res, err);
  }
});

// POST /api/admin/two-factor/config/test-email
router.post('/two-factor/config/test-email', ...adminTwoFactorAuth, async (req, res) => {
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
    const port = parseIntSafe(smtp_port ?? currentConfig.smtp_port, 0);
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
      if (!test_email) return res.status(400).json({ error: 'Recipient email is required to send a test email.' });
      await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: test_email,
        subject: 'MIMS SMTP test email',
        text: `Hello,\n\nThis is a test email from MIMS Admin 2FA Configuration.\n\nSMTP host: ${host}\nEncryption: ${encryption}\nSent at: ${new Date().toISOString()}\n`,
      });
      await audit(req.user.userId, req.user.email, 'TEST_SMTP_SEND', 'system_config', null, {
        smtp_host: host,
        smtp_port: String(port),
        smtp_encryption: encryption,
        smtp_username: username,
        smtp_from_email: fromEmail,
        test_email,
        source: 'mims_admin_system_setup',
      });
      return res.json({ message: `Test email sent to ${test_email}.` });
    }

    await audit(req.user.userId, req.user.email, 'TEST_SMTP_VERIFY', 'system_config', null, {
      smtp_host: host,
      smtp_port: String(port),
      smtp_encryption: encryption,
      smtp_username: username,
      smtp_from_email: fromEmail,
      source: 'mims_admin_system_setup',
    });
    return res.json({ message: 'SMTP connection verified successfully.' });
  } catch (err) {
    await emitPlatformAdminAlert('smtp_failure', {
      severity: 'high',
      title: 'SMTP verification failed',
      message: err.message || 'SMTP test failed.',
      metadata: { updatedBy: req.user.email, source: 'mims_admin_system_setup' },
      linkUrl: '/mims/mims-admin',
    });
    return res.status(400).json({ error: err.message || 'SMTP test failed.' });
  }
});

module.exports = router;
