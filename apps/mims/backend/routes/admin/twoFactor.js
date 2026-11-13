'use strict';

const express = require('express');
const { encryptMailboxSecret, decryptMailboxSecret } = require('../../services/mailboxCrypto');
const mailer = require('../../utils/mailer');
const pool = require('../../database/db');
const { authenticate, requireRole, requireOrg } = require('../../middleware/auth');
const { emitPlatformAdminAlert } = require('../../services/alertService');
const { hasGlobalAdminScope } = require('../../utils/adminScope');
const { logAudit } = require('../../utils/auditLog');
const { platformSmtpConfigError } = require('../../utils/mailSecurity');
const { parseAllowedDomains } = require('../../services/ssoService');
const { invalidatePlatformSignIn } = require('../../services/platformSignIn');

const router = express.Router();
const adminTwoFactorAuth = [authenticate, requireRole('admin', 'platform_admin'), requireOrg];
// The platform SMTP sends every organisation's 2FA codes and password-reset email,
// so only a platform admin reads, changes or tests it (MIPM-143). A tenant admin
// could set it — including the From address — for every client.
const platformConfigAuth = [authenticate, requireRole('platform_admin')];

function parseIntSafe(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Shared writer: logs a failed write instead of discarding it; outside a
// transaction it does not block the admin action.
async function audit(userId, userName, action, entity, entityId, details) {
  await logAudit(userId, userName, action, entity, entityId, details);
}

function assertOrgScope(req, orgId) {
  if (hasGlobalAdminScope(req.user)) return null;
  if (Number(req.user.orgId) === Number(orgId)) return null;
  const err = new Error('You can update 2FA only for your active organisation.');
  err.status = 403;
  return err;
}

// L4: platform sign-in rules saved from Sign-in & Security (system_config).
// Password rules are saved through PUT /system-params/general (one writer).
const PLATFORM_RULE_KEYS = [
  'user_session_timeout_minutes', 'two_factor_methods', 'two_factor_remember_days',
  'login_lockout_threshold', 'login_lockout_minutes',
];
const RULE_RANGES = {
  user_session_timeout_minutes: [30, 480, 'Idle timeout must be 30–480 minutes.'],
  two_factor_remember_days: [1, 90, '"Remember this device" must be 1–90 days.'],
  login_lockout_threshold: [3, 20, 'Lock after 3–20 wrong passwords.'],
  login_lockout_minutes: [5, 1440, 'Lockout must be 5–1440 minutes.'],
};
function collectPlatformRules(body, upserts) {
  for (const [key, [min, max, msg]] of Object.entries(RULE_RANGES)) {
    if (body[key] === undefined) continue;
    const n = parseInt(body[key], 10);
    if (!Number.isFinite(n) || n < min || n > max) return msg;
    upserts.push([key, String(n)]);
  }
  if (body.two_factor_methods !== undefined) {
    const list = String(body.two_factor_methods).split(',').map((m) => m.trim()).filter((m) => ['email', 'totp'].includes(m));
    if (!list.length) return 'Choose at least one two-step method.';
    upserts.push(['two_factor_methods', [...new Set(list)].join(',')]);
  }
  return null;
}

function handleError(res, err) {
  return res.status(err.status || 500).json({ error: err.message || 'Server error.' });
}

// GET /api/admin/two-factor/orgs
router.get('/two-factor/orgs', ...adminTwoFactorAuth, async (req, res) => {
  try {
    const isPlatformAdmin = hasGlobalAdminScope(req.user);
    const [orgs] = await pool.execute(
      `SELECT id, name, is_active, two_factor_enabled, allow_personal_emails, company_email_domains
         FROM organisations ${isPlatformAdmin ? '' : 'WHERE id = ?'} ORDER BY name`,
      isPlatformAdmin ? [] : [req.user.orgId]
    );
    // L4: each client's company login, for the Sign-in & Security row.
    const [sso] = await pool.execute(
      `SELECT org_id, provider_key, allowed_domains, is_active,
              (client_id IS NOT NULL AND client_secret_encrypted IS NOT NULL) AS configured
         FROM access_sso_provider_configs`);
    for (const org of orgs) {
      org.company_email_domains = parseAllowedDomains(org.company_email_domains);
      org.company_login = sso.filter((p) => Number(p.org_id) === Number(org.id) && p.is_active && Number(p.configured))
        .map((p) => ({ provider: p.provider_key, domains: parseAllowedDomains(p.allowed_domains) }));
    }
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

    // L4 (Rohith, 2026-11-13): a client keeps only these settings. Timeout,
    // two-step methods and remember days are platform-wide (PUT /two-factor/config).
    const domains = req.body.company_email_domains !== undefined
      ? parseAllowedDomains(req.body.company_email_domains)
      : parseAllowedDomains(existing.company_email_domains);
    const badDomain = domains.find((d) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d));
    if (badDomain) return res.status(400).json({ error: `"${badDomain}" is not an email domain (for example calder.com).` });
    const next = {
      two_factor_enabled: req.body.two_factor_enabled !== undefined ? (req.body.two_factor_enabled ? 1 : 0) : Number(existing.two_factor_enabled),
      allow_personal_emails: req.body.allow_personal_emails !== undefined ? (req.body.allow_personal_emails ? 1 : 0) : Number(existing.allow_personal_emails),
      company_email_domains: domains.length ? domains.join(',') : null,
    };

    await pool.execute(
      `UPDATE organisations
          SET two_factor_enabled = ?, allow_personal_emails = ?, company_email_domains = ?, updated_at = NOW()
        WHERE id = ?`,
      [next.two_factor_enabled, next.allow_personal_emails, next.company_email_domains, req.params.id]
    );

    await logAudit(req.user.userId, req.user.email, 'UPDATE', 'organisation_sign_in', req.params.id,
      { source: 'sign_in_security' },
      { two_factor_enabled: Number(existing.two_factor_enabled), allow_personal_emails: Number(existing.allow_personal_emails), company_email_domains: existing.company_email_domains },
      next);

    return res.json({ message: `Sign-in settings saved for ${existing.name}.` });
  } catch (err) {
    return handleError(res, err);
  }
});

// GET /api/admin/two-factor/config
router.get('/two-factor/config', ...platformConfigAuth, async (_req, res) => {
  try {
    const [rows] = await pool.execute('SELECT config_key, config_value FROM system_config');
    const config = rows.reduce((acc, row) => {
      acc[row.config_key] = row.config_value;
      return acc;
    }, {});
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
router.put('/two-factor/config', ...platformConfigAuth, async (req, res) => {
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
    } = req.body || {};

    const upserts = [];
    const timeoutValue = platform_admin_session_timeout_minutes;
    if (timeoutValue !== undefined) {
      const mins = parseIntSafe(timeoutValue, 0);
      if (mins < 30) return res.status(400).json({ error: 'Platform admin session timeout must be at least 30 minutes.' });
      upserts.push(['platform_admin_session_timeout_minutes', String(mins)]);
    }

    // L4: the platform sign-in rules, one value each for every organisation.
    const ruleError = collectPlatformRules(req.body || {}, upserts);
    if (ruleError) return res.status(400).json({ error: ruleError });

    const smtpError = await platformSmtpConfigError(req.body, pool);
    if (smtpError) return res.status(400).json({ error: smtpError });

    const configPairs = {
      smtp_host,
      smtp_port: smtp_port !== undefined ? String(smtp_port) : undefined,
      smtp_encryption,
      smtp_username,
      smtp_password: smtp_password ? encryptMailboxSecret(smtp_password) : undefined, // MIPM-68
      smtp_from_email,
      smtp_from_name,
    };

    for (const [key, value] of Object.entries(configPairs)) {
      if (value !== undefined) upserts.push([key, value]);
    }

    const changedRuleKeys = upserts.map(([k]) => k).filter((k) => PLATFORM_RULE_KEYS.includes(k));
    if (changedRuleKeys.length) invalidatePlatformSignIn();
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
        changedKeys: Object.keys(configPairs).filter(key => configPairs[key] !== undefined).concat(changedRuleKeys)
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
router.post('/two-factor/config/test-email', ...platformConfigAuth, async (req, res) => {
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
    const password = smtp_password || decryptMailboxSecret(currentConfig.smtp_password); // MIPM-68
    const fromEmail = smtp_from_email ?? currentConfig.smtp_from_email ?? username;
    const fromName = smtp_from_name ?? currentConfig.smtp_from_name ?? 'MIMS Platform';

    if (!host || !port || !username || !password || !fromEmail) {
      return res.status(400).json({ error: 'SMTP host, port, username, password, and from email are required.' });
    }

    const transporter = mailer.createTransport('operational', {
      host,
      port,
      secure: encryption === 'SSL/TLS',
      requireTLS: encryption === 'STARTTLS',
      auth: { user: username, pass: password },
      tls: { rejectUnauthorized: process.env.SMTP_ALLOW_INSECURE_TLS !== 'true' },
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
