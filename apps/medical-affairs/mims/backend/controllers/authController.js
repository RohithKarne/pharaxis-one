/**
 * authController.js — Authentication + 2FA Logic
 */

'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const pool = require('../database/db');
const {
  OTP_EXPIRY_MINUTES,
  generateTotpSecret,
  generateOtpCode,
  generateBackupCodes,
  generateTrustedDeviceToken,
  verifyTotpToken,
  hashValue,
  maskEmail,
  sendEmailOtp,
} = require('../services/twoFactorService');
const { emitSuperadminAlert } = require('../services/alertService');
const geoip = require('geoip-lite');

const JWT_SECRET = process.env.JWT_SECRET || 'mims-dev-secret-change-in-production';
const SALT_ROUNDS = 10;

function resolveIp(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req?.connection?.remoteAddress || req?.socket?.remoteAddress || null;
}

function resolveLocation(ip) {
  if (!ip || ip === '::1' || ip === '127.0.0.1') return 'localhost';
  const geo = geoip.lookup(ip);
  if (!geo) return null;
  const parts = [geo.city, geo.region, geo.country].filter(Boolean);
  return parts.join(', ') || null;
}

async function logLoginAudit({ userId, userName, role, status, failReason, authEvent = null, metadata = null, req = null }) {
  try {
    const ip = resolveIp(req);
    const location = resolveLocation(ip);
    await pool.execute(
      `INSERT INTO login_audit (user_id, user_name, role, status, fail_reason, auth_event, ip_address, location, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId || null,
        userName || null,
        role || null,
        status,
        failReason || null,
        authEvent,
        ip || null,
        location || null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
    if (status === 'failed' && authEvent === 'password_login_failed') {
      await emitSuperadminAlert('failed_login_spike', {
        severity: 'high',
        title: 'Failed login spike detected',
        message: failReason || 'Multiple failed login attempts detected.',
        metadata: { userId: userId || null, userName: userName || null, authEvent, details: metadata || null },
        linkUrl: '/superadmin',
      });
    }
    if (authEvent === '2fa_locked') {
      await emitSuperadminAlert('two_factor_lockout', {
        severity: 'high',
        title: 'Repeated 2FA lockouts detected',
        message: failReason || '2FA lockout triggered.',
        metadata: { userId: userId || null, userName: userName || null, authEvent, details: metadata || null },
        linkUrl: '/superadmin',
      });
    }
  } catch (_) {}
}

function issueToken(payload, expiresIn = '8h') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function issueTwoFactorToken(payload) {
  return issueToken({ ...payload, twoFactorPending: true }, '10m');
}

function issuePasswordResetToken(payload) {
  return issueToken({ ...payload, passwordResetFlow: true }, '10m');
}

function toMysqlDateTimeFromUnix(unixSeconds) {
  if (unixSeconds == null) return null;
  const dt = new Date(Number(unixSeconds) * 1000);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 19).replace('T', ' ');
}

async function trackSessionToken(userId, token) {
  if (userId == null || token == null) return;
  try {
    const decoded = jwt.decode(token) || {};
    const expiresAt = toMysqlDateTimeFromUnix(decoded.exp) || '2099-12-31 23:59:59';
    await pool.execute(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), expires_at = VALUES(expires_at), created_at = NOW()',
      [userId, token, expiresAt]
    );
  } catch (_) {
    // Session tracking must never block login flow.
  }
}

function parseTwoFactorToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (!decoded.twoFactorPending) throw new Error('Invalid 2FA token.');
  return decoded;
}

function parsePasswordResetToken(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (!decoded.passwordResetFlow) throw new Error('Invalid password reset token.');
  return decoded;
}

async function getSystemConfig() {
  const [rows] = await pool.execute('SELECT config_key, config_value FROM system_config');
  return rows.reduce((acc, row) => {
    acc[row.config_key] = row.config_value;
    return acc;
  }, {});
}

async function findUserByLoginIdentifier(identifier) {
  const value = String(identifier || '').trim().toLowerCase();
  if (!value) return null;
  const [[row]] = await pool.execute(
    'SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1',
    [value]
  );
  return row || null;
}

async function getLatestActiveOrgIdForUser(userId) {
  const [[row]] = await pool.execute(
    `SELECT uoa.org_id
     FROM user_org_access uoa
     JOIN organisations o ON o.id = uoa.org_id
     WHERE uoa.user_id = ? AND uoa.is_active = 1 AND o.is_active = 1
     ORDER BY uoa.last_accessed_at DESC, uoa.id DESC
     LIMIT 1`,
    [userId]
  );
  return row?.org_id || null;
}

async function getRecentPasswordHistory(userId, limit = 5) {
  const [rows] = await pool.query(
    `SELECT password_hash
     FROM user_password_history
     WHERE user_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ${parseInt(limit, 10)}`,
    [userId]
  );
  return rows.map(row => row.password_hash).filter(Boolean);
}

async function isPasswordReused(userId, newPassword, currentHash) {
  if (currentHash && await bcrypt.compare(newPassword, currentHash)) return true;
  const historyHashes = await getRecentPasswordHistory(userId, 5);
  for (const hash of historyHashes) {
    if (await bcrypt.compare(newPassword, hash)) return true;
  }
  return false;
}

async function trimPasswordHistory(userId, keep = 5, conn = pool) {
  await conn.execute(
    `DELETE FROM user_password_history
     WHERE user_id = ?
       AND id NOT IN (
         SELECT id FROM (
           SELECT id
           FROM user_password_history
           WHERE user_id = ?
           ORDER BY created_at DESC, id DESC
           LIMIT ${parseInt(keep, 10)}
         ) keep_rows
       )`,
    [userId, userId]
  );
}

async function updatePasswordWithHistory(userId, currentHash, newPassword) {
  if (await isPasswordReused(userId, newPassword, currentHash)) {
    return { reused: true };
  }

  const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (currentHash) {
      await conn.execute(
        'INSERT INTO user_password_history (user_id, password_hash) VALUES (?, ?)',
        [userId, currentHash]
      );
    }
    await conn.execute(
      `UPDATE users
       SET password = ?, password_reset_required = ?, updated_at = NOW()
       WHERE id = ?`,
      [newHash, 0, userId]
    );
    await trimPasswordHistory(userId, 5, conn);
    await conn.commit();
    return { reused: false };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function parseMethodList(value) {
  return String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

async function getUserModules(userId) {
  const [rows] = await pool.execute(
    'SELECT module FROM user_module_permissions WHERE user_id = ? AND can_access = 1',
    [userId]
  );
  return rows.map(r => r.module);
}

async function getActiveOrgRowsForUser(userId) {
  const [orgRows] = await pool.execute(
    `SELECT uoa.org_id, uoa.primary_site_id, uoa.role_at_org, uoa.site_permission, uoa.last_accessed_at,
            o.name AS org_name, o.session_timeout_minutes, o.two_factor_enabled, o.two_factor_methods, o.two_factor_remember_days,
            s.name AS site_name
     FROM user_org_access uoa
     JOIN organisations o ON o.id = uoa.org_id
     LEFT JOIN sites s ON s.id = uoa.primary_site_id
     WHERE uoa.user_id = ? AND uoa.is_active = 1 AND o.is_active = 1
     ORDER BY uoa.last_accessed_at DESC`,
    [userId]
  );
  return orgRows;
}

async function resolveRegularLoginContext(user) {
  const orgRows = await getActiveOrgRowsForUser(user.id);

  if (orgRows.length === 0) return { noOrgAccess: true };

  const selected = orgRows[0];
  await pool.execute(
    'UPDATE user_org_access SET last_accessed_at = NOW() WHERE user_id = ? AND org_id = ?',
    [user.id, selected.org_id]
  );

  return {
    orgRows,
    selected,
    modules: await getUserModules(user.id),
    orgId: selected.org_id,
    siteId: selected.primary_site_id,
    orgName: selected.org_name,
    siteName: selected.site_name,
    sessionTimeout: selected.session_timeout_minutes ?? 30,
    twoFactorEnabled: !!selected.two_factor_enabled,
    twoFactorMethods: parseMethodList(selected.two_factor_methods || 'email,totp'),
    rememberDays: selected.two_factor_remember_days ?? 7,
  };
}

function buildLoginResponse({ user, token, modules, orgId, siteId, orgName, siteName, allOrgs, sessionTimeout, roleForOrg, extra = {} }) {
  return {
    message: 'Login successful.',
    token,
    user: { id: user.id, name: user.name, email: user.email, role: roleForOrg || user.role },
    modules,
    orgId,
    siteId,
    orgName: orgName || null,
    siteName: siteName || null,
    allOrgs: allOrgs || [],
    sessionTimeout,
    ...extra,
  };
}

function makeTwoFactorPayload(user, context, mode) {
  return {
    userId: user.id,
    email: user.email,
    role: context.selected?.role_at_org || user.role,
    orgId: context.orgId,
    siteId: context.siteId,
    orgName: context.orgName,
    siteName: context.siteName,
    modules: context.modules,
    allOrgs: context.orgRows.map(o => ({
      orgId: o.org_id,
      orgName: o.org_name,
      siteId: o.primary_site_id,
      siteName: o.site_name,
      roleAtOrg: o.role_at_org || user.role,
    })),
    sessionTimeout: context.sessionTimeout,
    twoFactorMethods: context.twoFactorMethods,
    rememberDays: context.rememberDays,
    mode,
  };
}

async function finalizeRegularLogin({ res, req, user, context, trustedDeviceToken = null, authEvent = 'login_success' }) {
  const roleForOrg = context.selected?.role_at_org || user.role;
  const token = issueToken({
    userId: user.id,
    email: user.email,
    role: roleForOrg,
    orgId: context.orgId,
    siteId: context.siteId,
  });
  await trackSessionToken(user.id, token);

  await logLoginAudit({
    userId: user.id,
    userName: user.email,
    role: roleForOrg,
    status: 'success',
    authEvent,
    metadata: { orgId: context.orgId },
    req,
  });

  const allOrgs = (context.orgRows || []).map(o => ({
    orgId: o.orgId ?? o.org_id,
    orgName: o.orgName ?? o.org_name,
    siteId: o.siteId ?? o.primary_site_id,
    siteName: o.siteName ?? o.site_name,
    roleAtOrg: o.role_at_org || user.role,
  }));

  return res.status(200).json(buildLoginResponse({
    user,
    token,
    modules: context.modules,
    orgId: context.orgId,
    siteId: context.siteId,
    orgName: context.orgName,
    siteName: context.siteName,
    allOrgs,
    sessionTimeout: context.sessionTimeout,
    roleForOrg,
    extra: trustedDeviceToken ? { rememberedDeviceToken: trustedDeviceToken } : {},
  }));
}

async function getUser2faSettings(userId, orgId) {
  const [[row]] = await pool.execute(
    'SELECT * FROM user_2fa_settings WHERE user_id = ? AND org_id = ?',
    [userId, orgId]
  );
  return row || null;
}

async function setTwoFactorFailure(userId, orgId) {
  const settings = await getUser2faSettings(userId, orgId);
  if (!settings) return { failedAttempts: 0, isLocked: false };
  const nextAttempts = (settings.failed_attempts || 0) + 1;
  const isLocked = nextAttempts >= 3;
  await pool.execute(
    `UPDATE user_2fa_settings
     SET failed_attempts = ?, is_locked = ?, updated_at = NOW()
     WHERE user_id = ? AND org_id = ?`,
    [nextAttempts, isLocked ? 1 : 0, userId, orgId]
  );
  return { failedAttempts: nextAttempts, isLocked };
}

async function clearTwoFactorFailures(userId, orgId) {
  await pool.execute(
    `UPDATE user_2fa_settings
     SET failed_attempts = 0, is_locked = 0, last_verified_at = NOW(), updated_at = NOW()
     WHERE user_id = ? AND org_id = ?`,
    [userId, orgId]
  );
}

async function isTrustedDevice(userId, orgId, rawToken) {
  if (!rawToken) return false;
  const [[row]] = await pool.execute(
    `SELECT id FROM user_2fa_trusted_devices
     WHERE user_id = ? AND org_id = ? AND device_token_hash = ? AND expires_at > NOW()`,
    [userId, orgId, hashValue(rawToken)]
  );
  if (row) {
    await pool.execute('UPDATE user_2fa_trusted_devices SET last_used_at = NOW() WHERE id = ?', [row.id]);
    return true;
  }
  return false;
}

async function createTrustedDevice(userId, orgId, rememberDays, userAgent) {
  const rawToken = generateTrustedDeviceToken();
  await pool.execute(
    `INSERT INTO user_2fa_trusted_devices (user_id, org_id, device_token_hash, user_agent, expires_at, last_used_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), NOW())`,
    [userId, orgId, hashValue(rawToken), userAgent || null, rememberDays]
  );
  return rawToken;
}

async function consumeBackupCode(userId, orgId, code) {
  const [rows] = await pool.execute(
    'SELECT id, code_hash FROM user_2fa_backup_codes WHERE user_id = ? AND org_id = ? AND is_used = 0',
    [userId, orgId]
  );
  const codeHash = hashValue(code);
  const match = rows.find(row => row.code_hash === codeHash);
  if (!match) return false;
  await pool.execute(
    'UPDATE user_2fa_backup_codes SET is_used = 1, used_at = NOW() WHERE id = ?',
    [match.id]
  );
  return true;
}

async function replaceBackupCodes(userId, orgId) {
  const backupCodes = generateBackupCodes();
  await pool.execute('DELETE FROM user_2fa_backup_codes WHERE user_id = ? AND org_id = ?', [userId, orgId]);
  for (const code of backupCodes) {
    await pool.execute(
      'INSERT INTO user_2fa_backup_codes (user_id, org_id, code_hash) VALUES (?, ?, ?)',
      [userId, orgId, hashValue(code)]
    );
  }
  return backupCodes;
}

async function createEmailChallenge(user, orgId, challengeType) {
  const code = generateOtpCode();
  await pool.execute(
    `INSERT INTO user_2fa_challenges (user_id, org_id, challenge_type, code_hash, expires_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [user.id, orgId, challengeType, hashValue(code), OTP_EXPIRY_MINUTES]
  );
  await sendEmailOtp({ toEmail: user.email, userName: user.name, code });
  return { maskedEmail: maskEmail(user.email), expiresInMinutes: OTP_EXPIRY_MINUTES };
}

async function verifyEmailChallenge(userId, orgId, challengeType, code) {
  const [[row]] = await pool.execute(
    `SELECT * FROM user_2fa_challenges
     WHERE user_id = ? AND org_id = ? AND challenge_type = ? AND is_consumed = 0 AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [userId, orgId, challengeType]
  );
  if (!row) return false;
  if (row.code_hash !== hashValue(code)) return false;
  await pool.execute('UPDATE user_2fa_challenges SET is_consumed = 1 WHERE id = ?', [row.id]);
  return true;
}

async function verifyEmailChallengeWithoutOrg(userId, challengeType, code) {
  const [[row]] = await pool.execute(
    `SELECT * FROM user_2fa_challenges
     WHERE user_id = ? AND challenge_type = ? AND is_consumed = 0 AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [userId, challengeType]
  );
  if (!row) return false;
  if (row.code_hash !== hashValue(code)) return false;
  await pool.execute('UPDATE user_2fa_challenges SET is_consumed = 1 WHERE id = ?', [row.id]);
  return true;
}

async function beginTotpEnrollment(userId, orgId) {
  const secret = generateTotpSecret();
  await pool.execute(
    `INSERT INTO user_2fa_challenges (user_id, org_id, challenge_type, totp_secret, expires_at)
     VALUES (?, ?, 'setup_totp', ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
    [userId, orgId, secret]
  );
  return secret;
}

async function getLatestTotpEnrollmentSecret(userId, orgId) {
  const [[row]] = await pool.execute(
    `SELECT totp_secret FROM user_2fa_challenges
     WHERE user_id = ? AND org_id = ? AND challenge_type = 'setup_totp' AND is_consumed = 0 AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [userId, orgId]
  );
  return row?.totp_secret || null;
}

async function consumeTotpEnrollmentSecret(userId, orgId, secret) {
  await pool.execute(
    `UPDATE user_2fa_challenges
     SET is_consumed = 1
     WHERE user_id = ? AND org_id = ? AND challenge_type = 'setup_totp' AND totp_secret = ? AND is_consumed = 0`,
    [userId, orgId, secret]
  );
}

async function ensureUser2faRow(userId, orgId, preferredMethod, totpSecret = null) {
  await pool.execute(
    `INSERT INTO user_2fa_settings (user_id, org_id, is_enabled, preferred_method, totp_secret, failed_attempts, is_locked, last_verified_at)
     VALUES (?, ?, 1, ?, ?, 0, 0, NOW())
     ON DUPLICATE KEY UPDATE
       is_enabled = VALUES(is_enabled),
       preferred_method = VALUES(preferred_method),
       totp_secret = COALESCE(VALUES(totp_secret), totp_secret),
       failed_attempts = 0,
       is_locked = 0,
       updated_at = NOW()`,
    [userId, orgId, preferredMethod, totpSecret]
  );
}

const authController = {
  async register(req, res) {
    try {
      const { name, email, password, role } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: 'Name, email, and password are required.' });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      }

      const validRoles = ['admin', 'agent', 'reviewer', 'content_manager', 'superadmin'];
      const userRole = role && validRoles.includes(role) ? role : 'agent';

      if (await userModel.emailExists(email)) {
        return res.status(409).json({ error: 'An account with this email already exists.' });
      }

      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      const newUser = await userModel.create({
        name,
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role: userRole,
      });

      return res.status(201).json({
        message: 'Account created successfully.',
        user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role },
      });
    } catch (err) {
      console.error('Register error:', err);
      return res.status(500).json({ error: 'Server error. Please try again.' });
    }
  },

  async login(req, res) {
    try {
      const { email, password, rememberedDeviceToken } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }

      const identity = email.toLowerCase().trim();
      const user = await userModel.findByEmail(identity);
      if (!user) {
        await logLoginAudit({ userName: email, status: 'failed', failReason: 'User not found', authEvent: 'password_login_failed', req });
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
      if (!user.is_active) {
        await logLoginAudit({ userId: user.id, userName: user.email, role: user.role, status: 'failed', failReason: 'Account deactivated', authEvent: 'password_login_failed', req });
        return res.status(403).json({ error: 'Your account has been deactivated. Contact your administrator.' });
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        await logLoginAudit({ userId: user.id, userName: user.email, role: user.role, status: 'failed', failReason: 'Wrong password', authEvent: 'password_login_failed', req });
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      if (user.password_reset_required) {
        const resetToken = issueToken({ userId: user.id, email: user.email, role: user.role, passwordResetRequired: true });
        return res.status(200).json({
          passwordResetRequired: true,
          token: resetToken,
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
        });
      }

      if (user.role === 'superadmin') {
        const token = issueToken({ userId: user.id, email: user.email, role: user.role, orgId: null, siteId: null });
        await trackSessionToken(user.id, token);
        const [distRows] = await pool.execute('SELECT DISTINCT module FROM role_permissions');
        const config = await getSystemConfig();
        const sessionTimeout = parseInt(config.superadmin_session_timeout_minutes || '60', 10);
        await logLoginAudit({ userId: user.id, userName: user.email, role: user.role, status: 'success', authEvent: 'login_success', req });
        return res.status(200).json({
          message: 'Login successful.',
          token,
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
          modules: distRows.map(r => r.module),
          orgId: null,
          siteId: null,
          sessionTimeout,
        });
      }

      const context = await resolveRegularLoginContext(user);
      if (context.noOrgAccess) {
        await logLoginAudit({ userId: user.id, userName: user.email, role: user.role, status: 'failed', failReason: 'No org assigned', authEvent: 'password_login_failed', req });
        return res.status(200).json({ noOrgAccess: true });
      }

      if (!context.twoFactorEnabled) {
        return finalizeRegularLogin({ res, req, user, context });
      }

      const settings = await getUser2faSettings(user.id, context.orgId);
      if (settings?.is_enabled && settings.is_locked) {
        await logLoginAudit({
          userId: user.id,
          userName: user.email,
          role: user.role,
          status: 'failed',
          failReason: '2FA locked. Contact SuperAdmin for reset.',
          authEvent: '2fa_locked',
          metadata: { orgId: context.orgId },
        });
        return res.status(423).json({ error: '2FA is locked after 3 failed attempts. Contact SuperAdmin for reset.' });
      }

      if (settings?.is_enabled && await isTrustedDevice(user.id, context.orgId, rememberedDeviceToken)) {
        return finalizeRegularLogin({ res, req, user, context, authEvent: '2fa_trusted_device_bypass' });
      }

      const challengeToken = issueTwoFactorToken(makeTwoFactorPayload(
        user,
        context,
        settings?.is_enabled ? 'verify' : 'setup_optional'
      ));

      await logLoginAudit({
        userId: user.id,
        userName: user.email,
        role: user.role,
        status: 'pending',
        authEvent: settings?.is_enabled ? '2fa_challenge_started' : '2fa_enrollment_offered',
        metadata: { orgId: context.orgId, methods: context.twoFactorMethods },
      });

      return res.status(200).json({
        twoFactorRequired: !!settings?.is_enabled,
        twoFactorSetupAvailable: !settings?.is_enabled,
        challengeToken,
        availableMethods: context.twoFactorMethods,
        maskedEmail: maskEmail(user.email),
        rememberDays: context.rememberDays,
        preferredMethod: settings?.preferred_method || null,
      });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'Server error. Please try again.' });
    }
  },

  async sendTwoFactorEmailCode(req, res) {
    try {
      const { challengeToken } = req.body;
      if (!challengeToken) return res.status(400).json({ error: 'challengeToken is required.' });
      const pending = parseTwoFactorToken(challengeToken);
      const user = await userModel.findById(pending.userId);
      if (!user) return res.status(404).json({ error: 'User not found.' });
      const challengeType = pending.mode === 'verify' ? 'login_email' : 'setup_email';
      const result = await createEmailChallenge(user, pending.orgId, challengeType);
      await logLoginAudit({
        userId: pending.userId,
        userName: pending.email,
        role: pending.role,
        status: 'success',
        authEvent: '2fa_email_code_sent',
        metadata: { orgId: pending.orgId },
      });
      return res.json(result);
    } catch (err) {
      console.error('sendTwoFactorEmailCode error:', err);
      return res.status(400).json({ error: err.message || 'Could not send 2FA email code.' });
    }
  },

  async beginTotpSetup(req, res) {
    try {
      const { challengeToken } = req.body;
      if (!challengeToken) return res.status(400).json({ error: 'challengeToken is required.' });
      const pending = parseTwoFactorToken(challengeToken);
      const secret = await beginTotpEnrollment(pending.userId, pending.orgId);
      const issuer = encodeURIComponent('MIMS');
      const label = encodeURIComponent(`${pending.orgName}:${pending.email}`);
      const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(otpauthUrl)}`;
      return res.json({ secret, otpauthUrl, qrUrl });
    } catch (err) {
      console.error('beginTotpSetup error:', err);
      return res.status(400).json({ error: err.message || 'Could not start TOTP setup.' });
    }
  },

  async skipTwoFactorSetup(req, res) {
    try {
      const { challengeToken } = req.body;
      const pending = parseTwoFactorToken(challengeToken);
      if (pending.mode !== 'setup_optional') {
        return res.status(400).json({ error: 'Setup skip is not allowed for this session.' });
      }
      const user = await userModel.findById(pending.userId);
      if (!user) return res.status(404).json({ error: 'User not found.' });
      const context = {
        orgId: pending.orgId,
        siteId: pending.siteId,
        orgName: pending.orgName,
        siteName: pending.siteName,
        modules: pending.modules || [],
        orgRows: pending.allOrgs || [],
        sessionTimeout: pending.sessionTimeout ?? 30,
      };
      return finalizeRegularLogin({ res, req, user: { ...user, email: pending.email, role: pending.role }, context, authEvent: '2fa_setup_skipped' });
    } catch (err) {
      console.error('skipTwoFactorSetup error:', err);
      return res.status(400).json({ error: err.message || 'Could not skip 2FA setup.' });
    }
  },

  async verifyTwoFactor(req, res) {
    try {
      const { challengeToken, method, code, backupCode, rememberDevice } = req.body;
      if (!challengeToken) return res.status(400).json({ error: 'challengeToken is required.' });
      const pending = parseTwoFactorToken(challengeToken);
      const user = await userModel.findById(pending.userId);
      if (!user) return res.status(404).json({ error: 'User not found.' });

      const settings = await getUser2faSettings(pending.userId, pending.orgId);
      let verified = false;
      let setupCompleted = false;
      let generatedBackupCodes = null;
      let authEvent = '2fa_verified';

      if (backupCode) {
        verified = await consumeBackupCode(pending.userId, pending.orgId, backupCode);
        authEvent = '2fa_backup_code_used';
      } else if (method === 'email') {
        const challengeType = pending.mode === 'verify' ? 'login_email' : 'setup_email';
        verified = await verifyEmailChallenge(pending.userId, pending.orgId, challengeType, code);
        if (verified && pending.mode !== 'verify') {
          await ensureUser2faRow(pending.userId, pending.orgId, 'email', null);
          generatedBackupCodes = await replaceBackupCodes(pending.userId, pending.orgId);
          setupCompleted = true;
          authEvent = '2fa_setup_completed';
        }
      } else if (method === 'totp') {
        if (pending.mode === 'verify') {
          verified = !!settings?.totp_secret && verifyTotpToken(settings.totp_secret, String(code || '').trim());
        } else {
          const secret = await getLatestTotpEnrollmentSecret(pending.userId, pending.orgId);
          verified = !!secret && verifyTotpToken(secret, String(code || '').trim());
          if (verified) {
            await ensureUser2faRow(pending.userId, pending.orgId, 'totp', secret);
            await consumeTotpEnrollmentSecret(pending.userId, pending.orgId, secret);
            generatedBackupCodes = await replaceBackupCodes(pending.userId, pending.orgId);
            setupCompleted = true;
            authEvent = '2fa_setup_completed';
          }
        }
      }

      if (!verified) {
        const failure = await setTwoFactorFailure(pending.userId, pending.orgId);
        await logLoginAudit({
          userId: pending.userId,
          userName: pending.email,
          role: pending.role,
          status: 'failed',
          failReason: failure.isLocked ? '2FA locked after 3 failed attempts.' : 'Invalid 2FA code.',
          authEvent: failure.isLocked ? '2fa_locked' : '2fa_failed',
          metadata: { orgId: pending.orgId, method: method || 'backup' },
        });
        return res.status(failure.isLocked ? 423 : 401).json({
          error: failure.isLocked ? '2FA is locked after 3 failed attempts. Contact SuperAdmin for reset.' : 'Invalid verification code.',
          locked: failure.isLocked,
        });
      }

      await clearTwoFactorFailures(pending.userId, pending.orgId);
      const trustedDeviceToken = rememberDevice
        ? await createTrustedDevice(pending.userId, pending.orgId, pending.rememberDays ?? 7, req.headers['user-agent'])
        : null;

      const context = {
        orgId: pending.orgId,
        siteId: pending.siteId,
        orgName: pending.orgName,
        siteName: pending.siteName,
        modules: pending.modules || [],
        orgRows: pending.allOrgs || [],
        sessionTimeout: pending.sessionTimeout ?? 30,
      };

      await logLoginAudit({
        userId: pending.userId,
        userName: pending.email,
        role: pending.role,
        status: 'success',
        authEvent,
        metadata: { orgId: pending.orgId, method: backupCode ? 'backup' : method, rememberDevice: !!rememberDevice },
      });
      const token = issueToken({
        userId: pending.userId,
        email: pending.email,
        role: pending.role,
        orgId: pending.orgId,
        siteId: pending.siteId,
      });
      await trackSessionToken(pending.userId, token);
      await logLoginAudit({
        userId: pending.userId,
        userName: pending.email,
        role: pending.role,
        status: 'success',
        authEvent: 'login_success',
        metadata: { orgId: pending.orgId },
      });
      return res.status(200).json(buildLoginResponse({
        user: { ...user, email: pending.email, role: pending.role },
        token,
        modules: pending.modules || [],
        orgId: pending.orgId,
        siteId: pending.siteId,
        orgName: pending.orgName,
        siteName: pending.siteName,
        allOrgs: pending.allOrgs || [],
        sessionTimeout: pending.sessionTimeout ?? 30,
        extra: {
          rememberedDeviceToken: trustedDeviceToken,
          twoFactorSetupCompleted: setupCompleted,
          backupCodes: generatedBackupCodes,
        },
      }));
    } catch (err) {
      console.error('verifyTwoFactor error:', err);
      return res.status(400).json({ error: err.message || 'Could not verify 2FA.' });
    }
  },

  async me(req, res) {
    const user = await userModel.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.role === 'superadmin') {
      return res.status(200).json({ user, allOrgs: [], orgId: null, siteId: null, orgName: null, siteName: null });
    }

    const orgRows = await getActiveOrgRowsForUser(user.id);
    const allOrgs = orgRows.map(o => ({
      orgId: o.org_id,
      orgName: o.org_name,
      siteId: o.primary_site_id,
      siteName: o.site_name,
    }));
    const current = allOrgs.find(o => Number(o.orgId) === Number(req.user.orgId)) || allOrgs[0] || null;
    return res.status(200).json({
      user,
      allOrgs,
      orgId: current?.orgId ?? null,
      siteId: current?.siteId ?? null,
      orgName: current?.orgName ?? null,
      siteName: current?.siteName ?? null,
      currentOrgActive: !!current && Number(current.orgId) === Number(req.user.orgId),
    });
  },

  async switchOrg(req, res) {
    try {
      const { orgId } = req.body;
      if (!orgId) return res.status(400).json({ error: 'orgId is required.' });

      const [[access]] = await pool.execute(
        `SELECT uoa.primary_site_id, uoa.role_at_org, uoa.site_permission,
                o.name AS org_name, o.session_timeout_minutes, s.name AS site_name
         FROM user_org_access uoa
         JOIN organisations o ON o.id = uoa.org_id
         LEFT JOIN sites s ON s.id = uoa.primary_site_id
         WHERE uoa.user_id = ? AND uoa.org_id = ? AND uoa.is_active = 1 AND o.is_active = 1`,
        [req.user.userId, orgId]
      );

      if (!access) return res.status(403).json({ error: 'You do not have access to this organisation.' });

      const orgRows = await getActiveOrgRowsForUser(req.user.userId);
      const allOrgs = orgRows.map(o => ({
        orgId: o.org_id,
        orgName: o.org_name,
        siteId: o.primary_site_id,
        siteName: o.site_name,
        roleAtOrg: o.role_at_org,
      }));

      await pool.execute(
        'UPDATE user_org_access SET last_accessed_at = NOW() WHERE user_id = ? AND org_id = ?',
        [req.user.userId, orgId]
      );

      const siteId = access.primary_site_id;
      const roleForOrg = access.role_at_org || req.user.role;
      const token = issueToken({
        userId: req.user.userId,
        email: req.user.email,
        role: roleForOrg,
        orgId: Number(orgId),
        siteId,
      });
      await trackSessionToken(req.user.userId, token);

      await logLoginAudit({
        userId: req.user.userId,
        userName: req.user.email,
        role: roleForOrg,
        status: 'success',
        authEvent: 'org_switch',
        metadata: { fromOrgId: req.user.orgId, toOrgId: Number(orgId) },
        req,
      });

      return res.status(200).json({
        message: 'Org switched.',
        token,
        orgId: Number(orgId),
        siteId,
        orgName: access.org_name,
        siteName: access.site_name,
        allOrgs,
        sessionTimeout: access.session_timeout_minutes ?? 30,
        role: roleForOrg,
      });
    } catch (err) {
      console.error('Switch-org error:', err);
      return res.status(500).json({ error: 'Server error.' });
    }
  },

  async resetPassword(req, res) {
    try {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      }

      if (!req.user.passwordResetRequired) {
        return res.status(403).json({ error: 'Password reset not required for this session.' });
      }

      const [[dbUser]] = await pool.execute(
        'SELECT password_reset_required, password, email, role FROM users WHERE id = ?',
        [req.user.userId]
      );
      if (!dbUser || !dbUser.password_reset_required) {
        return res.status(403).json({ error: 'Password has already been reset. Please log in again.' });
      }

      const result = await updatePasswordWithHistory(req.user.userId, dbUser.password, newPassword);
      if (result.reused) {
        await logLoginAudit({
          userId: req.user.userId,
          userName: dbUser.email || req.user.email,
          role: dbUser.role || req.user.role,
          status: 'failed',
          failReason: 'Password reuse blocked.',
          authEvent: 'password_reuse_blocked',
        });
        return res.status(400).json({ error: 'You cannot reuse your current password or last 5 passwords.' });
      }

      return res.status(200).json({ message: 'Password updated. Please log in again.' });
    } catch (err) {
      console.error('Reset-password error:', err);
      return res.status(500).json({ error: 'Server error.' });
    }
  },

  async sendForgotPasswordCode(req, res) {
    try {
      const { email } = req.body || {};
      if (!email) return res.status(400).json({ error: 'Email is required.' });

      const user = await findUserByLoginIdentifier(email);
      if (!user || user.role === 'superadmin' || !String(user.email || '').includes('@')) {
        return res.status(404).json({ error: 'No eligible user found for this email.' });
      }
      if (!user.is_active) {
        return res.status(403).json({ error: 'This account is inactive.' });
      }

      const orgId = await getLatestActiveOrgIdForUser(user.id);
      if (!orgId) {
        return res.status(403).json({ error: 'No active organisation is assigned to this account.' });
      }

      await createEmailChallenge(user, orgId, 'password_reset_email');
      await logLoginAudit({
        userId: user.id,
        userName: user.email,
        role: user.role,
        status: 'success',
        authEvent: 'forgot_password_code_sent',
        metadata: { orgId },
      });
      return res.json({ maskedEmail: maskEmail(user.email), expiresInMinutes: OTP_EXPIRY_MINUTES });
    } catch (err) {
      console.error('sendForgotPasswordCode error:', err);
      return res.status(400).json({ error: err.message || 'Could not send forgot-password code.' });
    }
  },

  async verifyForgotPasswordCode(req, res) {
    try {
      const { email, code } = req.body || {};
      if (!email || !code) {
        return res.status(400).json({ error: 'Email and code are required.' });
      }
      const user = await findUserByLoginIdentifier(email);
      if (!user || user.role === 'superadmin' || !String(user.email || '').includes('@')) {
        return res.status(404).json({ error: 'No eligible user found for this email.' });
      }

      const verified = await verifyEmailChallengeWithoutOrg(user.id, 'password_reset_email', String(code).trim());
      if (!verified) {
        await logLoginAudit({
          userId: user.id,
          userName: user.email,
          role: user.role,
          status: 'failed',
          failReason: 'Invalid forgot-password code.',
          authEvent: 'forgot_password_code_failed',
        });
        return res.status(401).json({ error: 'Invalid verification code.' });
      }

      const resetToken = issuePasswordResetToken({ userId: user.id, email: user.email, role: user.role });
      await logLoginAudit({
        userId: user.id,
        userName: user.email,
        role: user.role,
        status: 'success',
        authEvent: 'forgot_password_code_verified',
      });
      return res.json({ resetToken });
    } catch (err) {
      console.error('verifyForgotPasswordCode error:', err);
      return res.status(400).json({ error: err.message || 'Could not verify code.' });
    }
  },

  async completeForgotPasswordReset(req, res) {
    try {
      const { resetToken, newPassword } = req.body || {};
      if (!resetToken || !newPassword) {
        return res.status(400).json({ error: 'Reset token and new password are required.' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      }

      const pending = parsePasswordResetToken(resetToken);
      const user = await findUserByLoginIdentifier(pending.email);
      if (!user) return res.status(404).json({ error: 'User not found.' });

      const result = await updatePasswordWithHistory(pending.userId, user.password, newPassword);
      if (result.reused) {
        await logLoginAudit({
          userId: pending.userId,
          userName: pending.email,
          role: pending.role,
          status: 'failed',
          failReason: 'Password reuse blocked.',
          authEvent: 'password_reuse_blocked',
        });
        return res.status(400).json({ error: 'You cannot reuse your current password or last 5 passwords.' });
      }

      await logLoginAudit({
        userId: pending.userId,
        userName: pending.email,
        role: pending.role,
        status: 'success',
        authEvent: 'forgot_password_reset_completed',
      });
      return res.json({ message: 'Password updated successfully. Please sign in again.' });
    } catch (err) {
      console.error('completeForgotPasswordReset error:', err);
      return res.status(400).json({ error: err.message || 'Could not reset password.' });
    }
  },

  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body || {};
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required.' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
      }

      const user = await findUserByLoginIdentifier(req.user.email);
      if (!user) return res.status(404).json({ error: 'User not found.' });

      const matches = await bcrypt.compare(currentPassword, user.password);
      if (!matches) {
        await logLoginAudit({
          userId: user.id,
          userName: user.email,
          role: user.role,
          status: 'failed',
          failReason: 'Incorrect current password.',
          authEvent: 'change_password_failed',
        });
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }

      const result = await updatePasswordWithHistory(user.id, user.password, newPassword);
      if (result.reused) {
        await logLoginAudit({
          userId: user.id,
          userName: user.email,
          role: user.role,
          status: 'failed',
          failReason: 'Password reuse blocked.',
          authEvent: 'password_reuse_blocked',
        });
        return res.status(400).json({ error: 'You cannot reuse your current password or last 5 passwords.' });
      }
      await logLoginAudit({
        userId: user.id,
        userName: user.email,
        role: user.role,
        status: 'success',
        authEvent: 'change_password_completed',
      });
      return res.json({ message: 'Password updated successfully.' });
    } catch (err) {
      console.error('changePassword error:', err);
      return res.status(500).json({ error: 'Server error.' });
    }
  },
};

module.exports = authController;
