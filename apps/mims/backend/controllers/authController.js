/**
 * authController.js — Authentication + 2FA Logic
 */

'use strict';

const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const userModel = require('../models/userModel');
const pool = require('../database/db');
const JWT_SECRET = require('../utils/jwtSecret');
const passwordPolicy = require('../services/passwordPolicy');
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
const { sessionCacheInvalidate } = require('../services/redisClient');
const {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  getPublicLoginOptions,
  getPublicLoginOrgs,
  issueSsoState,
  listEnabledProviders,
  parseSsoState,
  sanitizeReturnTo,
  verifyIdToken,
} = require('../services/ssoService');
const geoip = require('geoip-lite');

const SALT_ROUNDS = Math.max(10, parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10) || 12);

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

/**
 * issueSessionToken — issues a full login/session token that carries an
 * `originalIat` claim marking the moment the user FIRST authenticated.
 *
 * The claim is preserved across re-issuance (org switch, session refresh) so
 * the 12-hour absolute session cap is measured from the original login, not
 * from the latest token. Do NOT use for short-lived flow tokens (2FA pending,
 * password reset) — those use issueToken directly.
 */
function issueSessionToken(payload, expiresIn = '8h') {
  const originalIat = Number.isFinite(payload.originalIat)
    ? payload.originalIat
    : Math.floor(Date.now() / 1000);
  return issueToken({ ...payload, originalIat }, expiresIn);
}

function attachAuthCookie(res, token, maxAgeMs = 8 * 60 * 60 * 1000) {
  res.cookie('mims_token', token, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeMs,
  });
  return token;
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
  if (!decoded.passwordResetFlow || !decoded.passwordResetNonce) {
    throw new Error('Invalid password reset token.');
  }
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
  const { history_count } = await passwordPolicy.getPolicy();
  const historyHashes = await getRecentPasswordHistory(userId, history_count);
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
  // Complexity check (alphanumeric / special chars) — driven by system params
  const complexity = await passwordPolicy.validateComplexity(newPassword);
  if (!complexity.ok) {
    return { invalid: true, error: complexity.error };
  }

  if (await isPasswordReused(userId, newPassword, currentHash)) {
    return { reused: true };
  }

  const { history_count, expiry_days } = await passwordPolicy.getPolicy();
  const newHash    = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const expiresAt  = new Date(Date.now() + expiry_days * 24 * 60 * 60 * 1000);
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
       SET password = ?, password_reset_required = ?, password_reset_nonce = NULL,
           password_expires_at = ?, updated_at = NOW()
       WHERE id = ?`,
      [newHash, 0, expiresAt, userId]
    );
    await trimPasswordHistory(userId, history_count, conn);
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

function parsePositiveInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractOptionalAuthToken(req) {
  const authHeader = req?.headers?.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token && token !== 'null' && token !== 'undefined') return token;
  }
  const cookieHeader = req?.headers?.cookie || '';
  const cookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('mims_token='));
  return cookie ? decodeURIComponent(cookie.slice('mims_token='.length)) : null;
}

function decodeOptionalAuthToken(req) {
  const token = extractOptionalAuthToken(req);
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (_) {
    return null;
  }
}

async function resolveRegularLoginContext(user, requestedOrgId = null) {
  const orgRows = await getActiveOrgRowsForUser(user.id);

  if (orgRows.length === 0) return { noOrgAccess: true };

  const selected = requestedOrgId
    ? orgRows.find((row) => Number(row.org_id) === Number(requestedOrgId)) || null
    : orgRows[0];
  if (!selected) return { noOrgAccess: true };
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

async function findExternalIdentity(providerKey, providerSubject) {
  const [[row]] = await pool.execute(
    `SELECT * FROM user_external_identities
     WHERE provider_key = ? AND provider_subject = ?
     LIMIT 1`,
    [providerKey, providerSubject]
  );
  return row || null;
}

async function listExternalIdentitiesForUser(userId) {
  const [rows] = await pool.execute(
    `SELECT id, provider_key, provider_email, provider_name, provider_tenant_id, created_at, updated_at
     FROM user_external_identities
     WHERE user_id = ?
     ORDER BY provider_key ASC`,
    [userId]
  );
  return rows;
}

async function upsertExternalIdentity({ userId, claims, linkedBy = null }) {
  const existing = await findExternalIdentity(claims.providerKey, claims.subject);
  if (existing && Number(existing.user_id) !== Number(userId)) {
    throw new Error(`This ${claims.providerLabel} account is already linked to another user.`);
  }

  const [[existingForUserProvider]] = await pool.execute(
    `SELECT id
       FROM user_external_identities
      WHERE user_id = ? AND provider_key = ?
      LIMIT 1`,
    [userId, claims.providerKey]
  );

  if (existingForUserProvider) {
    await pool.execute(
      `UPDATE user_external_identities
          SET provider_subject = ?,
              provider_tenant_id = ?,
              provider_email = ?,
              provider_name = ?,
              profile_json = ?,
              linked_by = ?,
              updated_at = NOW()
        WHERE id = ?`,
      [
        claims.subject,
        claims.tenantId || null,
        claims.email || null,
        claims.name || null,
        JSON.stringify(claims.profile || {}),
        linkedBy || userId || null,
        existingForUserProvider.id,
      ]
    );
    return;
  }

  await pool.execute(
    `INSERT INTO user_external_identities
       (user_id, provider_key, provider_subject, provider_tenant_id, provider_email, provider_name, profile_json, linked_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       user_id = VALUES(user_id),
       provider_tenant_id = VALUES(provider_tenant_id),
       provider_email = VALUES(provider_email),
       provider_name = VALUES(provider_name),
       profile_json = VALUES(profile_json),
       linked_by = VALUES(linked_by),
       updated_at = NOW()`,
    [
      userId,
      claims.providerKey,
      claims.subject,
      claims.tenantId || null,
      claims.email || null,
      claims.name || null,
      JSON.stringify(claims.profile || {}),
      linkedBy || userId || null,
    ]
  );
}

function buildSsoErrorRedirect(returnTo, providerKey, reason) {
  const target = new URL(sanitizeReturnTo(returnTo));
  target.searchParams.set('sso_error', reason);
  target.searchParams.set('provider', providerKey);
  return target.toString();
}

function hashLoginIdentifier(value) {
  return crypto
    .createHash('sha256')
    .update(String(value || '').trim().toLowerCase())
    .digest('hex');
}

function extractEmailDomain(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email.includes('@')) return '';
  return email.split('@').pop() || '';
}

function providerAllowsEmail(provider, email) {
  const allowedDomains = Array.isArray(provider?.allowed_domains) ? provider.allowed_domains : [];
  if (allowedDomains.length === 0) return true;
  const domain = extractEmailDomain(email);
  if (!domain) return false;
  return allowedDomains.map((item) => String(item || '').toLowerCase()).includes(domain);
}

function selectProviderForEmail(providers, email) {
  const list = Array.isArray(providers)
    ? providers.filter((provider) => providerAllowsEmail(provider, email))
    : [];
  if (list.length === 0) return null;

  const domain = extractEmailDomain(email);
  if (domain) {
    const domainMatch = list.find((provider) => {
      const allowedDomains = Array.isArray(provider.allowed_domains) ? provider.allowed_domains : [];
      return allowedDomains.map((item) => String(item || '').toLowerCase()).includes(domain);
    });
    if (domainMatch) return domainMatch;
  }

  return list[0];
}

async function getLoginProfilesForUser(user) {
  const orgRows = await getActiveOrgRowsForUser(user.id);
  const profiles = [];
  for (const row of orgRows) {
    const options = await getPublicLoginOptions(row.org_id).catch(() => null);
    if (options) profiles.push({ row, options });
  }
  return profiles;
}

async function resolvePasswordOrgIdForUser(user, requestedOrgId = null) {
  if (requestedOrgId) return requestedOrgId;
  const profiles = await getLoginProfilesForUser(user);
  const localProfile = profiles.find((profile) => profile.options?.local_login_allowed);
  return localProfile?.row?.org_id || profiles[0]?.row?.org_id || null;
}

async function buildLoginStartSsoRedirect({ orgId, providerKey, returnTo }) {
  const state = issueSsoState({
    orgId,
    provider: providerKey,
    intent: 'login',
    returnTo,
    nonce: crypto.randomBytes(16).toString('hex'),
  });
  const { url } = await buildAuthorizationUrl(orgId, providerKey, state, returnTo);
  return url;
}

async function establishRegularSession({ res, req, user, context, trustedDeviceToken = null, authEvent = 'login_success' }) {
  const roleForOrg = context.selected?.role_at_org || user.role;
  const token = issueSessionToken({
    userId: user.id,
    email: user.email,
    role: roleForOrg,
    orgId: context.orgId,
    siteId: context.siteId,
  });
  await trackSessionToken(user.id, token);
  attachAuthCookie(res, token, Number(context.sessionTimeout || 30) * 60 * 1000);

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

  return buildLoginResponse({
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
  });
}

async function finalizeRegularLogin({ res, req, user, context, trustedDeviceToken = null, authEvent = 'login_success' }) {
  const payload = await establishRegularSession({ res, req, user, context, trustedDeviceToken, authEvent });
  return res.status(200).json(payload);
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

async function createEmailVerificationChallenge(user) {
  const code = generateOtpCode();
  await pool.execute(
    `INSERT INTO user_email_verification_challenges (user_id, code_hash, expires_at)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [user.id, hashValue(code), OTP_EXPIRY_MINUTES]
  );
  await sendEmailOtp({ toEmail: user.email, userName: user.name, code });
  return { maskedEmail: maskEmail(user.email), expiresInMinutes: OTP_EXPIRY_MINUTES };
}

async function verifyEmailVerificationChallenge(userId, code) {
  const [[row]] = await pool.execute(
    `SELECT id, code_hash, attempts
     FROM user_email_verification_challenges
     WHERE user_id = ? AND is_consumed = 0 AND expires_at > NOW() AND attempts < 5
     ORDER BY id DESC LIMIT 1`,
    [userId]
  );
  if (!row) return false;
  if (row.code_hash !== hashValue(code)) {
    await pool.execute(
      'UPDATE user_email_verification_challenges SET attempts = attempts + 1 WHERE id = ?',
      [row.id]
    );
    return false;
  }
  await pool.execute(
    'UPDATE user_email_verification_challenges SET is_consumed = 1, attempts = attempts + 1 WHERE id = ?',
    [row.id]
  );
  return true;
}

async function setPasswordResetNonce(userId) {
  const nonce = crypto.randomBytes(32).toString('hex');
  await pool.execute(
    'UPDATE users SET password_reset_nonce = ?, updated_at = NOW() WHERE id = ?',
    [nonce, userId]
  );
  return nonce;
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
  async listSsoProviders(_req, res) {
    try {
      const authUser = decodeOptionalAuthToken(_req);
      const requestedOrgId = parsePositiveInt(_req.query.org_id) || parsePositiveInt(authUser?.orgId);
      if (!requestedOrgId) return res.status(200).json({ providers: [] });
      const providers = await listEnabledProviders(requestedOrgId);
      return res.status(200).json({ providers });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to load SSO providers.' });
    }
  },

  async listLoginOrgs(_req, res) {
    try {
      const orgs = await getPublicLoginOrgs();
      return res.status(200).json({ orgs });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to load organisations.' });
    }
  },

  async getLoginOptions(req, res) {
    try {
      const orgId = parsePositiveInt(req.query.org_id);
      if (!orgId) return res.status(400).json({ error: 'org_id is required.' });
      const options = await getPublicLoginOptions(orgId);
      if (!options) return res.status(404).json({ error: 'Organisation not found or inactive.' });
      return res.status(200).json(options);
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to load login options.' });
    }
  },

  async startLogin(req, res) {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const returnTo = sanitizeReturnTo(req.body?.return_to, '/auth/sso-complete');
    const genericError = 'Unable to start sign in. Contact your administrator.';
    const auditMeta = { emailHash: hashLoginIdentifier(email) };

    try {
      if (!email) {
        return res.status(400).json({ outcome: 'denied', error: 'Email is required.' });
      }

      const user = await findUserByLoginIdentifier(email);
      if (!user || !user.is_active || user.is_disabled) {
        await logLoginAudit({
          status: 'failed',
          failReason: 'Email-first login denied.',
          authEvent: 'login_start_denied',
          metadata: { ...auditMeta, reason: !user ? 'not_found' : !user.is_active ? 'inactive' : 'disabled' },
          req,
        });
        return res.status(200).json({ outcome: 'denied', error: genericError });
      }

      if (user.role === 'superadmin') {
        await logLoginAudit({
          userId: user.id,
          role: user.role,
          status: 'failed',
          failReason: 'Superadmin attempted app login start.',
          authEvent: 'login_start_denied',
          metadata: { ...auditMeta, reason: 'superadmin_uses_dedicated_login' },
          req,
        });
        return res.status(200).json({ outcome: 'denied', error: genericError });
      }

      const profiles = await getLoginProfilesForUser(user);
      if (profiles.length === 0) {
        await logLoginAudit({
          userId: user.id,
          role: user.role,
          status: 'failed',
          failReason: 'No active organisation access.',
          authEvent: 'login_start_denied',
          metadata: { ...auditMeta, reason: 'no_org_access' },
          req,
        });
        return res.status(200).json({ outcome: 'denied', error: genericError });
      }

      const ssoProfiles = profiles
        .map((profile) => ({
          ...profile,
          eligibleProviders: Array.isArray(profile.options?.providers)
            ? profile.options.providers.filter((provider) => providerAllowsEmail(provider, email))
            : [],
        }))
        .filter((profile) => profile.options?.sso_login_allowed && profile.eligibleProviders.length > 0);

      if (ssoProfiles.length > 0) {
        const selected = ssoProfiles[0];
        const provider = selectProviderForEmail(selected.eligibleProviders, email);
        if (!provider?.key) {
          return res.status(200).json({ outcome: 'choice_required', options: [] });
        }

        const redirectUrl = await buildLoginStartSsoRedirect({
          orgId: selected.row.org_id,
          providerKey: provider.key,
          returnTo,
        });
        await logLoginAudit({
          userId: user.id,
          role: user.role,
          status: 'pending',
          authEvent: 'login_start_sso_redirect',
          metadata: {
            ...auditMeta,
            orgId: selected.row.org_id,
            provider: provider.key,
          },
          req,
        });
        return res.status(200).json({
          outcome: 'sso_redirect',
          redirect_url: redirectUrl,
          org: {
            id: selected.row.org_id,
            name: selected.row.org_name,
          },
          provider: {
            key: provider.key,
            label: provider.label,
          },
        });
      }

      const localProfile = profiles.find((profile) => profile.options?.local_login_allowed);
      if (localProfile) {
        await logLoginAudit({
          userId: user.id,
          role: user.role,
          status: 'pending',
          authEvent: 'login_start_local_password',
          metadata: { ...auditMeta, orgId: localProfile.row.org_id },
          req,
        });
        return res.status(200).json({ outcome: 'local_password' });
      }

      await logLoginAudit({
        userId: user.id,
        role: user.role,
        status: 'failed',
        failReason: 'No login method configured.',
        authEvent: 'login_start_denied',
        metadata: { ...auditMeta, reason: 'no_login_method' },
        req,
      });
      return res.status(200).json({ outcome: 'denied', error: genericError });
    } catch (err) {
      console.error('Login start error:', err);
      await logLoginAudit({
        status: 'failed',
        failReason: 'Login start failed.',
        authEvent: 'login_start_failed',
        metadata: auditMeta,
        req,
      }).catch(() => {});
      return res.status(500).json({ outcome: 'denied', error: 'Server error. Please try again.' });
    }
  },

  async startSso(req, res) {
    const providerKey = String(req.params.provider || '').trim().toLowerCase();
    const returnTo = sanitizeReturnTo(req.query.return_to, '/auth/sso-complete');
    try {
      const orgId = parsePositiveInt(req.query.org_id);
      if (!orgId) {
        return res.redirect(buildSsoErrorRedirect(returnTo, providerKey, 'org_required'));
      }
      const options = await getPublicLoginOptions(orgId);
      if (!options?.sso_login_allowed) {
        return res.redirect(buildSsoErrorRedirect(returnTo, providerKey, 'sso_not_allowed'));
      }
      const state = issueSsoState({
        orgId,
        provider: providerKey,
        intent: 'login',
        returnTo,
        nonce: crypto.randomBytes(16).toString('hex'),
      });
      const { url } = await buildAuthorizationUrl(orgId, providerKey, state, returnTo);
      return res.redirect(url);
    } catch (err) {
      return res.redirect(buildSsoErrorRedirect(returnTo, providerKey, 'provider_not_configured'));
    }
  },

  async startSsoLink(req, res) {
    const providerKey = String(req.params.provider || '').trim().toLowerCase();
    const returnTo = sanitizeReturnTo(req.query.return_to, '/session-management');
    try {
      const orgId = parsePositiveInt(req.user?.orgId);
      if (!orgId) {
        return res.redirect(buildSsoErrorRedirect(returnTo, providerKey, 'org_required'));
      }
      const state = issueSsoState({
        orgId,
        provider: providerKey,
        intent: 'link',
        userId: req.user.userId,
        returnTo,
        nonce: crypto.randomBytes(16).toString('hex'),
      });
      const { url } = await buildAuthorizationUrl(orgId, providerKey, state, returnTo);
      return res.redirect(url);
    } catch (_) {
      return res.redirect(buildSsoErrorRedirect(returnTo, providerKey, 'provider_not_configured'));
    }
  },

  async ssoCallback(req, res) {
    const providerKey = String(req.params.provider || '').trim().toLowerCase();
    let state = null;
    let returnTo = sanitizeReturnTo(null, '/auth/sso-complete');

    try {
      state = parseSsoState(req.query.state);
      returnTo = sanitizeReturnTo(state.returnTo, state.intent === 'link' ? '/session-management' : '/auth/sso-complete');
    } catch (_) {
      return res.redirect(buildSsoErrorRedirect(returnTo, providerKey, 'invalid_state'));
    }

    if (state.provider !== providerKey) {
      return res.redirect(buildSsoErrorRedirect(returnTo, providerKey, 'invalid_state'));
    }

    if (req.query.error) {
      return res.redirect(buildSsoErrorRedirect(returnTo, providerKey, 'provider_declined'));
    }

    try {
      const orgId = parsePositiveInt(state.orgId);
      if (!orgId) {
        return res.redirect(buildSsoErrorRedirect(returnTo, providerKey, 'org_required'));
      }
      const tokens = await exchangeCodeForTokens(orgId, providerKey, req.query.code);
      const claims = await verifyIdToken(orgId, providerKey, tokens.id_token, state.nonce);

      if (state.intent === 'link') {
        const currentUser = await userModel.findById(state.userId);
        if (!currentUser) {
          return res.redirect(buildSsoErrorRedirect(returnTo, providerKey, 'user_not_found'));
        }
        await upsertExternalIdentity({ userId: currentUser.id, claims, linkedBy: currentUser.id });
        const target = new URL(returnTo);
        target.searchParams.set('sso', 'linked');
        target.searchParams.set('provider', providerKey);
        return res.redirect(target.toString());
      }

      const existingIdentity = await findExternalIdentity(providerKey, claims.subject);
      const user = existingIdentity
        ? await userModel.findById(existingIdentity.user_id)
        : await findUserByLoginIdentifier(claims.email);

      if (!user) {
        return res.redirect(buildSsoErrorRedirect(returnTo, providerKey, 'no_account'));
      }
      if (!user.is_active) {
        return res.redirect(buildSsoErrorRedirect(returnTo, providerKey, 'inactive_account'));
      }

      await upsertExternalIdentity({ userId: user.id, claims, linkedBy: user.id });
      if (claims.emailVerified) {
        await pool.execute(
          'UPDATE users SET email_verified = 1, email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW() WHERE id = ?',
          [user.id]
        ).catch(() => {});
      }

      if (user.role === 'superadmin') {
        const token = issueSessionToken({ userId: user.id, email: user.email, role: user.role, orgId: null, siteId: null });
        await trackSessionToken(user.id, token);
        const [distRows] = await pool.execute('SELECT DISTINCT module FROM role_permissions');
        const config = await getSystemConfig();
        const sessionTimeout = parseInt(config.superadmin_session_timeout_minutes || '60', 10);
        attachAuthCookie(res, token, sessionTimeout * 60 * 1000);
        await logLoginAudit({
          userId: user.id,
          userName: user.email,
          role: user.role,
          status: 'success',
          authEvent: `sso_${providerKey}_login_success`,
          req,
        });
        return res.redirect(returnTo);
      }

      const context = await resolveRegularLoginContext(user, orgId);
      if (context.noOrgAccess) {
        return res.redirect(buildSsoErrorRedirect(returnTo, providerKey, 'no_org_access'));
      }

      await establishRegularSession({
        res,
        req,
        user,
        context,
        authEvent: `sso_${providerKey}_login_success`,
      });
      return res.redirect(returnTo);
    } catch (err) {
      console.error('SSO callback error:', {
        provider: providerKey,
        intent: state.intent,
        orgId: state.orgId,
        message: err.message,
        code: err.code || null,
      });
      return res.redirect(buildSsoErrorRedirect(returnTo, providerKey, 'sso_failed'));
    }
  },

  async linkedSsoAccounts(req, res) {
    try {
      const linkedAccounts = await listExternalIdentitiesForUser(req.user.userId);
      return res.status(200).json({ linkedAccounts });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to load linked accounts.' });
    }
  },

  async unlinkSsoAccount(req, res) {
    try {
      const providerKey = String(req.params.provider || '').trim().toLowerCase();
      await pool.execute(
        'DELETE FROM user_external_identities WHERE user_id = ? AND provider_key = ?',
        [req.user.userId, providerKey]
      );
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to unlink external account.' });
    }
  },

  async register(req, res) {
    try {
      return res.status(403).json({
        error: 'Self-registration is disabled. Contact your administrator for account access.',
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

      // Check if account is locked (AC-E6)
      const [lockCheck] = await pool.execute(
        'SELECT locked_until, failed_login_attempts FROM users WHERE email = ?',
        [identity]
      );
      if (lockCheck.length > 0 && lockCheck[0].locked_until) {
        const lockedUntil = new Date(lockCheck[0].locked_until);
        if (lockedUntil > new Date()) {
          return res.status(423).json({
            error: 'Account locked',
            message: `Account is locked due to too many failed login attempts. Try again after ${lockedUntil.toISOString()}.`,
            locked_until: lockedUntil.toISOString()
          });
        }
      }

      const user = await userModel.findByEmail(identity);
      if (!user) {
        await logLoginAudit({ userName: email, status: 'failed', failReason: 'User not found', authEvent: 'password_login_failed', req });
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
      if (!user.is_active) {
        await logLoginAudit({ userId: user.id, userName: user.email, role: user.role, status: 'failed', failReason: 'Account deactivated', authEvent: 'password_login_failed', req });
        return res.status(403).json({ error: 'Your account has been deactivated. Contact your administrator.' });
      }

      let requestedOrgId = null;
      let loginOptions = null;
      if (user.role !== 'superadmin') {
        requestedOrgId = await resolvePasswordOrgIdForUser(user, parsePositiveInt(req.body?.org_id));
        if (!requestedOrgId) {
          await logLoginAudit({ userId: user.id, userName: user.email, role: user.role, status: 'failed', failReason: 'No org assigned', authEvent: 'password_login_failed', req });
          return res.status(200).json({ noOrgAccess: true });
        }
        loginOptions = await getPublicLoginOptions(requestedOrgId);
        if (!loginOptions) {
          return res.status(403).json({ error: 'Selected organisation is inactive or unavailable.' });
        }
        if (!loginOptions.local_login_allowed) {
          return res.status(403).json({ error: 'This organisation requires SSO sign-in. Use Google or Microsoft sign-in instead.' });
        }
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        await logLoginAudit({ userId: user.id, userName: user.email, role: user.role, status: 'failed', failReason: 'Wrong password', authEvent: 'password_login_failed', req });

        // Get lockout threshold from system_config (default 5)
        let lockoutThreshold = 5;
        try {
          const [cfg] = await pool.execute(
            `SELECT config_value FROM system_config WHERE config_key = 'login_lockout_threshold' LIMIT 1`
          );
          if (cfg.length > 0) lockoutThreshold = parseInt(cfg[0].config_value) || 5;
        } catch (_) {}

        const newAttempts = (lockCheck[0]?.failed_login_attempts || 0) + 1;
        let lockedUntilVal = null;
        if (newAttempts >= lockoutThreshold) {
          // Lock for 30 minutes (configurable via system_config login_lockout_minutes)
          let lockMinutes = 30;
          try {
            const [lcfg] = await pool.execute(
              `SELECT config_value FROM system_config WHERE config_key = 'login_lockout_minutes' LIMIT 1`
            );
            if (lcfg.length > 0) lockMinutes = parseInt(lcfg[0].config_value) || 30;
          } catch (_) {}
          lockedUntilVal = new Date(Date.now() + lockMinutes * 60 * 1000);
        }
        await pool.execute(
          `UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE email = ?`,
          [newAttempts, lockedUntilVal, identity]
        );

        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      // Successful password match — reset failed login counter
      await pool.execute(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE email = ?`,
        [identity]
      );

      if (!Number(user.email_verified)) {
        const challenge = await createEmailVerificationChallenge(user).catch(() => null);
        await logLoginAudit({
          userId: user.id,
          userName: user.email,
          role: user.role,
          status: 'failed',
          failReason: 'Email address not verified.',
          authEvent: 'email_verification_required',
          req,
        });
        return res.status(403).json({
          error: 'Email verification required.',
          emailVerificationRequired: true,
          verificationCodeSent: !!challenge,
          maskedEmail: challenge?.maskedEmail || maskEmail(user.email),
        });
      }

      if (user.password_reset_required) {
        const resetToken = issueToken({ userId: user.id, email: user.email, role: user.role, passwordResetRequired: true });
        attachAuthCookie(res, resetToken, 10 * 60 * 1000);
        return res.status(200).json({
          passwordResetRequired: true,
          token: resetToken,
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
        });
      }

      if (user.role === 'superadmin') {
        const token = issueSessionToken({ userId: user.id, email: user.email, role: user.role, orgId: null, siteId: null });
        await trackSessionToken(user.id, token);
        const [distRows] = await pool.execute('SELECT DISTINCT module FROM role_permissions');
        const config = await getSystemConfig();
        const sessionTimeout = parseInt(config.superadmin_session_timeout_minutes || '60', 10);
        attachAuthCookie(res, token, sessionTimeout * 60 * 1000);
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

      const context = await resolveRegularLoginContext(user, requestedOrgId);
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

  async sendEmailVerificationCode(req, res) {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
      }

      const user = await findUserByLoginIdentifier(email);
      if (!user) return res.status(404).json({ error: 'User not found.' });
      if (!user.is_active) return res.status(403).json({ error: 'This account is inactive.' });
      if (Number(user.email_verified)) {
        return res.json({ alreadyVerified: true, message: 'Email already verified.' });
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        await logLoginAudit({
          userId: user.id,
          userName: user.email,
          role: user.role,
          status: 'failed',
          failReason: 'Invalid password for email verification code request.',
          authEvent: 'email_verification_code_send_failed',
          req,
        });
        return res.status(401).json({ error: 'Invalid email or password.' });
      }

      const challenge = await createEmailVerificationChallenge(user);
      await logLoginAudit({
        userId: user.id,
        userName: user.email,
        role: user.role,
        status: 'success',
        authEvent: 'email_verification_code_sent',
        req,
      });
      return res.json(challenge);
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Could not send verification code.' });
    }
  },

  async verifyEmailCode(req, res) {
    try {
      const { email, code } = req.body || {};
      if (!email || !code) {
        return res.status(400).json({ error: 'Email and code are required.' });
      }

      const user = await findUserByLoginIdentifier(email);
      if (!user) return res.status(404).json({ error: 'User not found.' });
      if (Number(user.email_verified)) {
        return res.json({ alreadyVerified: true, message: 'Email already verified.' });
      }

      const verified = await verifyEmailVerificationChallenge(user.id, String(code).trim());
      if (!verified) {
        await logLoginAudit({
          userId: user.id,
          userName: user.email,
          role: user.role,
          status: 'failed',
          failReason: 'Invalid email verification code.',
          authEvent: 'email_verification_failed',
          req,
        });
        return res.status(401).json({ error: 'Invalid verification code.' });
      }

      await pool.execute(
        'UPDATE users SET email_verified = 1, email_verified_at = NOW(), updated_at = NOW() WHERE id = ?',
        [user.id]
      );
      await logLoginAudit({
        userId: user.id,
        userName: user.email,
        role: user.role,
        status: 'success',
        authEvent: 'email_verification_completed',
        req,
      });
      return res.json({ message: 'Email verified successfully. You can now sign in.' });
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Could not verify email.' });
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
      const token = issueSessionToken({
        userId: pending.userId,
        email: pending.email,
        role: pending.role,
        orgId: pending.orgId,
        siteId: pending.siteId,
      });
      await trackSessionToken(pending.userId, token);
      attachAuthCookie(res, token, Number(pending.sessionTimeout || 30) * 60 * 1000);
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
    res.set('Cache-Control', 'no-store');
    const user = await userModel.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.role === 'superadmin') {
      const [distRows] = await pool.execute('SELECT DISTINCT module FROM role_permissions');
      const config = await getSystemConfig();
      return res.status(200).json({
        user,
        token: req.user.token,
        modules: distRows.map((row) => row.module),
        allOrgs: [],
        orgId: null,
        siteId: null,
        orgName: null,
        siteName: null,
        sessionTimeout: parseInt(config.superadmin_session_timeout_minutes || '60', 10),
      });
    }

    const orgRows = await getActiveOrgRowsForUser(user.id);
    const allOrgs = orgRows.map(o => ({
      orgId: o.org_id,
      orgName: o.org_name,
      siteId: o.primary_site_id,
      siteName: o.site_name,
      roleAtOrg: o.role_at_org || user.role,
    }));
    const modules = await getUserModules(user.id);
    const current = allOrgs.find(o => Number(o.orgId) === Number(req.user.orgId)) || allOrgs[0] || null;
    return res.status(200).json({
      user,
      token: req.user.token,
      modules,
      allOrgs,
      orgId: current?.orgId ?? null,
      siteId: current?.siteId ?? null,
      orgName: current?.orgName ?? null,
      siteName: current?.siteName ?? null,
      sessionTimeout: (orgRows.find((row) => Number(row.org_id) === Number(current?.orgId))?.session_timeout_minutes) ?? 30,
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
      // Preserve original login time across org switch so the 12h cap is unaffected.
      const priorOriginalIat = jwt.decode(req.user.token)?.originalIat;
      const token = issueSessionToken({
        userId: req.user.userId,
        email: req.user.email,
        role: roleForOrg,
        orgId: Number(orgId),
        siteId,
        originalIat: priorOriginalIat,
      });
      await trackSessionToken(req.user.userId, token);
      attachAuthCookie(res, token, Number(access.session_timeout_minutes || 30) * 60 * 1000);

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
      if (result.invalid) {
        return res.status(400).json({ error: result.error });
      }
      if (result.reused) {
        const { history_count } = await passwordPolicy.getPolicy();
        await logLoginAudit({
          userId: req.user.userId,
          userName: dbUser.email || req.user.email,
          role: dbUser.role || req.user.role,
          status: 'failed',
          failReason: 'Password reuse blocked.',
          authEvent: 'password_reuse_blocked',
        });
        return res.status(400).json({ error: `You cannot reuse your current password or last ${history_count} passwords.` });
      }

      return res.status(200).json({ message: 'Password updated. Please log in again.' });
    } catch (err) {
      console.error('Reset-password error:', err);
      return res.status(500).json({ error: 'Server error.' });
    }
  },

  /**
   * refreshSession — issues a fresh 8h session token for an authenticated user
   * who is approaching JWT expiry, so they can keep working without losing state.
   *
   * Guards:
   *  - Window guard: only refresh in the last 15 min before expiry (blocks early
   *    refresh of a long-lived stolen token).
   *  - 12h absolute cap: measured from `originalIat` (original login). Past the
   *    cap, refusal forces a real re-login.
   *
   * On success: rotates the session row, invalidates the old Redis cache entry,
   * re-attaches the cookie, audits `session_refreshed`, and returns the new token.
   */
  async refreshSession(req, res) {
    try {
      const currentToken = req.user.token;
      const decoded = jwt.decode(currentToken) || {};
      const nowSec = Math.floor(Date.now() / 1000);

      const exp = Number(decoded.exp || 0);
      if (!exp) {
        return res.status(400).json({
          error: 'Session not eligible for refresh.',
          error_code: 'REFRESH_NOT_ELIGIBLE',
        });
      }

      // Window guard — refuse refresh until within 15 minutes of expiry.
      if (exp - nowSec > 15 * 60) {
        return res.status(400).json({
          error: 'Session not eligible for refresh yet.',
          error_code: 'REFRESH_NOT_ELIGIBLE',
        });
      }

      // 12-hour absolute cap, measured from the original login.
      const originalIat = Number(decoded.originalIat || decoded.iat || nowSec);
      if (nowSec - originalIat >= 12 * 60 * 60) {
        return res.status(403).json({
          error: 'You have been signed in for 12 hours. For security, please sign in again.',
          error_code: 'session_cap_reached',
        });
      }

      const newToken = issueSessionToken({
        userId: req.user.userId,
        email: req.user.email,
        role: req.user.role,
        orgId: req.user.orgId,
        siteId: req.user.siteId,
        originalIat,
      });

      // Rotate: track the new token, drop the old session row, clear stale cache.
      await trackSessionToken(req.user.userId, newToken);
      await pool.execute('DELETE FROM sessions WHERE token = ?', [currentToken]).catch(() => {});
      await sessionCacheInvalidate(currentToken).catch(() => {});

      attachAuthCookie(res, newToken);

      await logLoginAudit({
        userId: req.user.userId,
        userName: req.user.email,
        role: req.user.role,
        status: 'success',
        authEvent: 'session_refreshed',
        metadata: { orgId: req.user.orgId },
        req,
      });

      return res.status(200).json({ token: newToken });
    } catch (err) {
      console.error('refreshSession error:', err);
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

      const passwordResetNonce = await setPasswordResetNonce(user.id);
      const resetToken = issuePasswordResetToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        passwordResetNonce,
      });
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
      const [[user]] = await pool.execute(
        `SELECT id, email, role, password, password_reset_nonce
         FROM users
         WHERE id = ? LIMIT 1`,
        [pending.userId]
      );
      if (!user) return res.status(404).json({ error: 'User not found.' });
      if (!user.password_reset_nonce || user.password_reset_nonce !== pending.passwordResetNonce) {
        return res.status(401).json({ error: 'Reset token is invalid or already used.' });
      }

      const result = await updatePasswordWithHistory(pending.userId, user.password, newPassword);
      if (result.invalid) {
        return res.status(400).json({ error: result.error });
      }
      if (result.reused) {
        const { history_count } = await passwordPolicy.getPolicy();
        await logLoginAudit({
          userId: pending.userId,
          userName: user.email,
          role: user.role,
          status: 'failed',
          failReason: 'Password reuse blocked.',
          authEvent: 'password_reuse_blocked',
        });
        return res.status(400).json({ error: `You cannot reuse your current password or last ${history_count} passwords.` });
      }

      await logLoginAudit({
        userId: pending.userId,
        userName: user.email,
        role: user.role,
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
      if (result.invalid) {
        return res.status(400).json({ error: result.error });
      }
      if (result.reused) {
        const { history_count } = await passwordPolicy.getPolicy();
        await logLoginAudit({
          userId: user.id,
          userName: user.email,
          role: user.role,
          status: 'failed',
          failReason: 'Password reuse blocked.',
          authEvent: 'password_reuse_blocked',
        });
        return res.status(400).json({ error: `You cannot reuse your current password or last ${history_count} passwords.` });
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
