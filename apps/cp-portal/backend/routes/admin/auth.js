/**
 * Admin Auth — /api/admin/auth
 * Login, two-step sign-in, logout, profile for CP Portal admin users
 */

const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
// qrcode: draws the authenticator set-up code on our server, so the secret never
// leaves it. Pure JavaScript, no network. (Rohith's sign-in Tier 1, 12 Oct 2026.)
const QRCode  = require('qrcode');
const log     = require('../../utils/logger');
const { canChangeByArea } = require('../../middleware/adminWritePolicy'); // CPPM-60
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, ADMIN_SECRET } = require('../../middleware/auth');
const { audit } = require('../../utils/audit');
const lockout = require('../../utils/loginLockout');
const passwordRules = require('../../utils/passwordRules');
const sessions = require('../../utils/sessions');
const twoFactor = require('../../utils/twoFactor');
const { encryptSecret, decryptSecret } = require('../../utils/secretCrypto');
const { queueEmail } = require('../../utils/emailOutbox');
const { getEmailConfig } = require('../../utils/mailer');
const passkeys = require('../../utils/passkeys');

// SEC: admin console is same-origin only and never linked cross-site, so Strict
// SameSite is safe here and gives full CSRF protection on the admin surface.
const COOKIE_OPTS = { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' }
const SESSION_HOURS = 12;
const TRUSTED_DAYS = 7;
const TRUSTED_COOKIE = 'cp_admin_device';
const TWO_FACTOR_LOCK_AFTER = 3;

// SEC: constant dummy hash so login timing is identical whether or not the email
// exists — otherwise the missing-user path returns faster (no bcrypt) and leaks
// which admin emails are registered.
const DUMMY_HASH = bcrypt.hashSync('cp-timing-equalizer', 12);

function adminPayload(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, clientId: user.client_id ?? null, can_change: canChangeByArea(user.role) };
}

// The full sign-in: token, session row, cookie, audit. Used once the password
// and, from Tier 1, the second step have both passed.
async function establishSession(req, res, user, extra = {}) {
  const token = jwt.sign(
    // CP-26: embed token_version for revocation on password change.
    { adminId: user.id, email: user.email, name: user.name, role: user.role, clientId: user.client_id ?? null, tv: user.token_version ?? 0 },
    ADMIN_SECRET,
    { expiresIn: `${SESSION_HOURS}h` }
  );
  await sessions.createSession('admin', user.id, token, req.headers['user-agent']);
  await pool.execute(`UPDATE cp_admin_users SET updated_at = NOW() WHERE id = ?`, [user.id]);
  await audit({ adminId: user.id, name: user.name }, user.client_id, 'LOGIN', 'admin_user', user.id, { email: user.email, role: user.role, ...extra.auditDetails });
  // SEC: token is delivered only via the httpOnly cookie, never in the body.
  res.cookie('cp_admin_token', token, { ...COOKIE_OPTS, maxAge: SESSION_HOURS * 60 * 60 * 1000 })
     .json({ admin: adminPayload(user), ...extra.body });
}

// ── Two-step sign-in (Rohith's sign-in Tier 1, 12 Oct 2026) ─────────────────
// After the password, a short-lived challenge token stands for "password passed,
// second step pending". Email codes go through the client's own mail set-up, so
// an admin with no client (a Pharaxis superadmin) or a client with no mail uses
// the authenticator app. Backup codes cover a lost phone or mailbox.

function issueChallenge(user, mode) {
  return jwt.sign({ stage: '2fa', adminId: user.id, mode }, ADMIN_SECRET, { expiresIn: '10m' });
}

async function readChallenge(req) {
  const token = String(req.body?.challengeToken || '');
  let decoded;
  try { decoded = jwt.verify(token, ADMIN_SECRET, { algorithms: ['HS256'] }); } catch { return null; }
  if (decoded.stage !== '2fa') return null;
  const [[user]] = await pool.execute('SELECT * FROM cp_admin_users WHERE id = ? AND is_active = 1', [decoded.adminId]);
  if (!user) return null;
  return { user, mode: decoded.mode };
}

async function getTwoFactor(adminId) {
  const [[row]] = await pool.execute('SELECT * FROM cp_admin_2fa WHERE admin_id = ?', [adminId]);
  return row || null;
}

async function availableMethods(user) {
  const canEmail = user.client_id ? !!(await getEmailConfig(user.client_id).catch(() => null)) : false;
  return canEmail ? ['email', 'totp'] : ['totp'];
}

function challengeResponse(user, settings, methods) {
  const enrolled = !!settings?.is_enabled;
  return {
    twoFactorRequired: enrolled,
    twoFactorSetupRequired: !enrolled,
    challengeToken: issueChallenge(user, enrolled ? 'verify' : 'setup'),
    availableMethods: methods,
    preferredMethod: settings?.preferred_method && methods.includes(settings.preferred_method) ? settings.preferred_method : methods[0],
    maskedEmail: twoFactor.maskEmail(user.email),
    rememberDays: TRUSTED_DAYS,
  };
}

async function isTrustedDevice(adminId, rawToken) {
  if (!rawToken) return false;
  const [[row]] = await pool.execute(
    'SELECT id FROM cp_admin_trusted_devices WHERE admin_id = ? AND device_token_hash = ? AND expires_at > NOW()',
    [adminId, twoFactor.hashValue(rawToken)]
  );
  if (!row) return false;
  await pool.execute('UPDATE cp_admin_trusted_devices SET last_used_at = NOW() WHERE id = ?', [row.id]);
  return true;
}

async function replaceBackupCodes(adminId) {
  const codes = twoFactor.generateBackupCodes();
  await pool.execute('DELETE FROM cp_admin_2fa_backup_codes WHERE admin_id = ?', [adminId]);
  for (const code of codes) {
    await pool.execute('INSERT INTO cp_admin_2fa_backup_codes (admin_id, code_hash) VALUES (?, ?)', [adminId, twoFactor.hashValue(code)]);
  }
  return codes;
}

async function consumeBackupCode(adminId, code) {
  const given = twoFactor.hashValue(String(code || '').trim().toUpperCase());
  const [rows] = await pool.execute('SELECT id, code_hash FROM cp_admin_2fa_backup_codes WHERE admin_id = ? AND is_used = 0', [adminId]);
  const match = rows.find(r => twoFactor.timingSafeEqualStr(r.code_hash, given));
  if (!match) return false;
  await pool.execute('UPDATE cp_admin_2fa_backup_codes SET is_used = 1, used_at = NOW() WHERE id = ?', [match.id]);
  return true;
}

// The latest live challenge of a type; a wrong guess counts against it, five end it.
async function verifyChallengeCode(adminId, type, code, check) {
  const [[row]] = await pool.execute(
    `SELECT * FROM cp_admin_2fa_challenges
     WHERE admin_id = ? AND challenge_type = ? AND is_consumed = 0 AND attempts < 5 AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [adminId, type]
  );
  if (!row) return { ok: false, row: null };
  if (!check(row)) {
    await pool.execute('UPDATE cp_admin_2fa_challenges SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    return { ok: false, row };
  }
  await pool.execute('UPDATE cp_admin_2fa_challenges SET is_consumed = 1 WHERE id = ?', [row.id]);
  return { ok: true, row };
}

async function recordFailure(user) {
  const settings = await getTwoFactor(user.id);
  if (!settings?.is_enabled) return { locked: false };
  const attempts = (settings.failed_attempts || 0) + 1;
  const locked = attempts >= TWO_FACTOR_LOCK_AFTER;
  await pool.execute('UPDATE cp_admin_2fa SET failed_attempts = ?, is_locked = ? WHERE admin_id = ?', [attempts, locked ? 1 : 0, user.id]);
  await audit({ adminId: user.id, name: user.name }, user.client_id, locked ? '2FA_LOCKED' : '2FA_FAILED', 'admin_user', user.id, { email: user.email });
  return { locked };
}

const LOCKED_2FA = 'Two-step sign-in is locked after 3 wrong codes. Ask another administrator to reset it.';

// POST /api/admin/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

    const [[user]] = await pool.execute('SELECT * FROM cp_admin_users WHERE email = ? AND is_active = 1', [email]);
    // CPPM-49: five wrong passwords in a row lock this sign-in. While locked it is
    // refused before the password is checked, so the right password is refused too.
    const who = user ? { adminId: user.id, name: user.name } : { adminId: null, name: email };
    const lockKey = lockout.loginKey('admin', null, email);
    if (await lockout.isLocked(lockKey)) {
      await audit(who, user?.client_id ?? null, 'LOGIN_FAILED', 'admin_user', user?.id ?? null, { email, reason: 'locked' });
      return res.status(423).json({ error: lockout.LOCKED_MESSAGE });
    }
    const refuse = async () => {
      if (await lockout.recordFailure(lockKey)) {
        await audit(who, user?.client_id ?? null, 'LOGIN_LOCKED', 'admin_user', user?.id ?? null, { email, minutes: lockout.LOCK_MINUTES });
        return res.status(423).json({ error: lockout.LOCKED_MESSAGE });
      }
      return res.status(401).json({ error: 'Invalid credentials.' });
    };

    // CPPM-10: sign-in attempts are recorded. The email identifies the attempt;
    // the password and the issued token are never written to the trail.
    if (!user) {
      bcrypt.compareSync(password, DUMMY_HASH); // equalize timing with the valid-user path
      await audit({ adminId: null, name: email }, null, 'LOGIN_FAILED', 'admin_user', null, { email, reason: 'unknown_or_inactive_email' });
      return refuse();
    }

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) {
      await audit({ adminId: user.id, name: user.name }, user.client_id, 'LOGIN_FAILED', 'admin_user', user.id, { email: user.email, reason: 'wrong_password' });
      return refuse();
    }
    await lockout.clearAttempts(lockKey);

    // Second step for every admin (Rohith's sign-in Tier 1, 12 Oct 2026).
    const settings = await getTwoFactor(user.id);
    if (settings?.is_enabled && settings.is_locked) {
      await audit(who, user.client_id, 'LOGIN_FAILED', 'admin_user', user.id, { email: user.email, reason: '2fa_locked' });
      return res.status(423).json({ error: LOCKED_2FA });
    }
    if (settings?.is_enabled && await isTrustedDevice(user.id, req.cookies?.[TRUSTED_COOKIE])) {
      return establishSession(req, res, user, { auditDetails: { second_step: 'remembered_device' } });
    }
    const methods = await availableMethods(user);
    await audit(who, user.client_id, settings?.is_enabled ? '2FA_CHALLENGE' : '2FA_SETUP_REQUIRED', 'admin_user', user.id, { email: user.email, methods });
    return res.json(challengeResponse(user, settings, methods));
  } catch (err) {
    // SEC: log the error only — `password` is in scope here and must never reach
    // the logs. logger.js serializes an Error to name/message/stack, so mysql2's
    // `err.sql` (which can carry interpolated values) is dropped too.
    log.error('admin.auth.error', { err, route: 'POST /login', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/auth/2fa/send-email-code — a six-digit code to the admin's own address
router.post('/2fa/send-email-code', async (req, res) => {
  try {
    const pending = await readChallenge(req);
    if (!pending) return res.status(401).json({ error: 'Start again from the password.' });
    const { user } = pending;
    if (!user.client_id || !(await availableMethods(user)).includes('email')) {
      return res.status(400).json({ error: 'Email codes are not available for this account. Use the authenticator app.' });
    }
    const code = twoFactor.generateEmailCode();
    await pool.execute(
      `INSERT INTO cp_admin_2fa_challenges (admin_id, challenge_type, code_hash, expires_at)
       VALUES (?, 'email', ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
      [user.id, twoFactor.hashValue(code), twoFactor.EMAIL_CODE_MINUTES]
    );
    await queueEmail(user.client_id, {
      to: user.email,
      subject: 'Your CP Portal sign-in code',
      text: `Hello ${user.name}, your CP Portal sign-in code is ${code}. It expires in ${twoFactor.EMAIL_CODE_MINUTES} minutes. If you did not try to sign in, tell your administrator.`,
      html: `<p>Hello ${user.name},</p><p>Your CP Portal sign-in code is <strong style="font-size:20px;letter-spacing:3px">${code}</strong>.</p><p>It expires in ${twoFactor.EMAIL_CODE_MINUTES} minutes. If you did not try to sign in, tell your administrator.</p>`,
    }, { kind: 'admin_2fa_code', relatedType: 'admin_user', relatedId: user.id, sensitive: true });
    res.json({ sent: true, maskedEmail: twoFactor.maskEmail(user.email), expiresInMinutes: twoFactor.EMAIL_CODE_MINUTES });
  } catch (err) {
    log.error('admin.auth.error', { err, route: 'POST /2fa/send-email-code', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/auth/2fa/setup/totp — a fresh secret and its QR code, drawn here
router.post('/2fa/setup/totp', async (req, res) => {
  try {
    const pending = await readChallenge(req);
    if (!pending) return res.status(401).json({ error: 'Start again from the password.' });
    if (pending.mode !== 'setup') return res.status(400).json({ error: 'Two-step sign-in is already set up for this account.' });
    const { user } = pending;
    const secret = twoFactor.generateTotpSecret();
    await pool.execute(
      `INSERT INTO cp_admin_2fa_challenges (admin_id, challenge_type, totp_secret, expires_at)
       VALUES (?, 'setup_totp', ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
      [user.id, encryptSecret(secret)]
    );
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(`CP Portal:${user.email}`)}?secret=${secret}&issuer=${encodeURIComponent('CP Portal')}`;
    const qrSvg = await QRCode.toString(otpauthUrl, { type: 'svg', margin: 1, width: 220 });
    res.json({ secret, otpauthUrl, qrUrl: `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}` });
  } catch (err) {
    log.error('admin.auth.error', { err, route: 'POST /2fa/setup/totp', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/auth/2fa/verify — the code (or a backup code); on success, the real sign-in
router.post('/2fa/verify', async (req, res) => {
  try {
    const pending = await readChallenge(req);
    if (!pending) return res.status(401).json({ error: 'Start again from the password.' });
    const { user, mode } = pending;
    const { method, code, backupCode, rememberDevice } = req.body || {};
    const settings = await getTwoFactor(user.id);
    if (settings?.is_enabled && settings.is_locked) return res.status(423).json({ error: LOCKED_2FA });

    let verified = false;
    let backupCodes = null;
    let secondStep = method;
    if (mode === 'verify' && backupCode) {
      verified = await consumeBackupCode(user.id, backupCode);
      secondStep = 'backup_code';
    } else if (method === 'email') {
      const given = twoFactor.hashValue(String(code || '').trim());
      const result = await verifyChallengeCode(user.id, 'email', code, row => twoFactor.timingSafeEqualStr(row.code_hash, given));
      verified = result.ok;
      if (verified && mode === 'setup') {
        await pool.execute(
          `INSERT INTO cp_admin_2fa (admin_id, is_enabled, preferred_method) VALUES (?, 1, 'email')
           ON DUPLICATE KEY UPDATE is_enabled = 1, preferred_method = 'email', failed_attempts = 0, is_locked = 0`,
          [user.id]
        );
        backupCodes = await replaceBackupCodes(user.id);
      }
    } else if (method === 'totp') {
      if (mode === 'verify') {
        verified = !!settings?.totp_secret && twoFactor.verifyTotpToken(decryptSecret(settings.totp_secret), code);
      } else {
        const result = await verifyChallengeCode(user.id, 'setup_totp', code, row => twoFactor.verifyTotpToken(decryptSecret(row.totp_secret), code));
        verified = result.ok;
        if (verified) {
          await pool.execute(
            `INSERT INTO cp_admin_2fa (admin_id, is_enabled, preferred_method, totp_secret) VALUES (?, 1, 'totp', ?)
             ON DUPLICATE KEY UPDATE is_enabled = 1, preferred_method = 'totp', totp_secret = VALUES(totp_secret), failed_attempts = 0, is_locked = 0`,
            [user.id, result.row.totp_secret]
          );
          backupCodes = await replaceBackupCodes(user.id);
        }
      }
    }

    if (!verified) {
      const { locked } = await recordFailure(user);
      return res.status(locked ? 423 : 401).json({ error: locked ? LOCKED_2FA : 'That code is not right. Check it and try again.' });
    }

    await pool.execute('UPDATE cp_admin_2fa SET failed_attempts = 0, is_locked = 0, last_verified_at = NOW() WHERE admin_id = ?', [user.id]);
    if (rememberDevice) {
      const raw = twoFactor.generateDeviceToken();
      await pool.execute(
        `INSERT INTO cp_admin_trusted_devices (admin_id, device_token_hash, user_agent, expires_at, last_used_at)
         VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), NOW())`,
        [user.id, twoFactor.hashValue(raw), String(req.headers['user-agent'] || '').slice(0, 500), TRUSTED_DAYS]
      );
      res.cookie(TRUSTED_COOKIE, raw, { ...COOKIE_OPTS, path: '/', maxAge: TRUSTED_DAYS * 24 * 60 * 60 * 1000 });
    }
    await audit({ adminId: user.id, name: user.name }, user.client_id, mode === 'setup' ? '2FA_SETUP' : '2FA_VERIFIED', 'admin_user', user.id,
      { email: user.email, method: secondStep, remembered_device: !!rememberDevice });
    return establishSession(req, res, user, {
      auditDetails: { second_step: secondStep },
      body: backupCodes ? { backupCodes } : {},
    });
  } catch (err) {
    log.error('admin.auth.error', { err, route: 'POST /2fa/verify', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/auth/me
// ── Passkeys (Rohith's sign-in Tier 2, 12 Oct 2026) ─────────────────────────
// A registered device signs in with Touch ID, Face ID or Windows Hello in place
// of the password and the code: the device itself is the second step. The
// lock on the password sign-in still applies, and a deactivated account is
// refused as everywhere else.

// POST /api/admin/auth/passkeys/login/start — the challenge for this email's passkeys
router.post('/passkeys/login/start', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    if (!email) return res.status(400).json({ error: 'Enter your email first.' });
    const [[user]] = await pool.execute('SELECT id FROM cp_admin_users WHERE email = ? AND is_active = 1', [email]);
    // The same answer for an unknown email and one with no passkey, so this route lists nobody.
    const options = user ? await passkeys.authenticationOptions(user.id) : null;
    if (!options) return res.json({ available: false });
    res.json({ available: true, options });
  } catch (err) {
    log.error('admin.auth.error', { err, route: 'POST /passkeys/login/start', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/auth/passkeys/login/finish — the signed challenge; signs in on success
router.post('/passkeys/login/finish', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    const { authenticationResponse } = req.body || {};
    if (!email || !authenticationResponse) return res.status(400).json({ error: 'Email and passkey response are required.' });
    const [[user]] = await pool.execute('SELECT * FROM cp_admin_users WHERE email = ? AND is_active = 1', [email]);
    if (!user) return res.status(401).json({ error: 'The passkey could not be verified.' });
    const who = { adminId: user.id, name: user.name };
    if (await lockout.isLocked(lockout.loginKey('admin', null, email))) {
      await audit(who, user.client_id, 'LOGIN_FAILED', 'admin_user', user.id, { email, reason: 'locked', method: 'passkey' });
      return res.status(423).json({ error: lockout.LOCKED_MESSAGE });
    }
    try {
      await passkeys.finishAuthentication(user.id, authenticationResponse);
    } catch (err) {
      await audit(who, user.client_id, 'LOGIN_FAILED', 'admin_user', user.id, { email, reason: 'passkey_failed', method: 'passkey' });
      return res.status(err.code === 'CHALLENGE_EXPIRED' ? 400 : 401).json({ error: err.message });
    }
    return establishSession(req, res, user, { auditDetails: { second_step: 'passkey' } });
  } catch (err) {
    log.error('admin.auth.error', { err, route: 'POST /passkeys/login/finish', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/auth/passkeys — the signed-in admin's own devices
router.get('/passkeys', authenticateAdmin, async (req, res) => {
  try {
    res.json({ passkeys: await passkeys.listPasskeys(req.admin.adminId) });
  } catch (err) {
    log.error('admin.auth.error', { err, route: 'GET /passkeys', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/auth/passkeys/register/start
router.post('/passkeys/register/start', authenticateAdmin, async (req, res) => {
  try {
    const [[user]] = await pool.execute('SELECT id, name, email FROM cp_admin_users WHERE id = ?', [req.admin.adminId]);
    res.json({ options: await passkeys.registrationOptions(user) });
  } catch (err) {
    log.error('admin.auth.error', { err, route: 'POST /passkeys/register/start', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/auth/passkeys/register/finish
router.post('/passkeys/register/finish', authenticateAdmin, async (req, res) => {
  try {
    const { registrationResponse, deviceName } = req.body || {};
    if (!registrationResponse) return res.status(400).json({ error: 'Registration response is required.' });
    const [[user]] = await pool.execute('SELECT id, name, email, client_id FROM cp_admin_users WHERE id = ?', [req.admin.adminId]);
    let row;
    try {
      row = await passkeys.finishRegistration(user, registrationResponse, deviceName);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    await audit(req.admin, user.client_id, 'PASSKEY_ADDED', 'admin_user', user.id, { passkey_id: row.id, device_name: deviceName || null });
    res.json({ passkey: row });
  } catch (err) {
    log.error('admin.auth.error', { err, route: 'POST /passkeys/register/finish', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/admin/auth/passkeys/:id
router.delete('/passkeys/:id', authenticateAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await passkeys.removePasskey(req.admin.adminId, id)) return res.status(404).json({ error: 'Passkey not found.' });
    await audit(req.admin, req.admin.clientId ?? null, 'PASSKEY_REMOVED', 'admin_user', req.admin.adminId, { passkey_id: id });
    res.json({ message: 'Passkey removed.' });
  } catch (err) {
    log.error('admin.auth.error', { err, route: 'DELETE /passkeys/:id', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/me', authenticateAdmin, async (req, res) => {
  try {
    const [[user]] = await pool.execute('SELECT id, name, email, role, client_id, created_at FROM cp_admin_users WHERE id = ?', [req.admin.adminId]);
    if (!user) return res.status(404).json({ error: 'Admin user not found.' });
    res.json({ admin: { ...user, clientId: user.client_id ?? null, can_change: canChangeByArea(user.role) } });
  } catch (err) {
    log.error('admin.auth.error', { err, route: 'GET /me', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/admin/auth/password
router.patch('/password', authenticateAdmin, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords are required.' });

    const [[user]] = await pool.execute('SELECT * FROM cp_admin_users WHERE id = ?', [req.admin.adminId]);
    if (!bcrypt.compareSync(current_password, user.password)) return res.status(401).json({ error: 'Current password incorrect.' });
    // Rohith's sign-in Tier 1 (12 Oct 2026): 12 characters, not a common password, not one of the last five.
    const problem = passwordRules.checkPassword(new_password, { email: user.email });
    if (problem) return res.status(400).json({ error: problem });
    if (await passwordRules.isRecentPassword('admin', user.id, new_password) || bcrypt.compareSync(new_password, user.password)) {
      return res.status(400).json({ error: passwordRules.RECENT_MESSAGE });
    }

    const hash = bcrypt.hashSync(new_password, 12);
    await pool.execute(`UPDATE cp_admin_users SET password = ?, token_version = token_version + 1, updated_at = NOW() WHERE id = ?`, [hash, user.id]);
    await passwordRules.rememberPassword('admin', user.id, hash);
    await audit(req.admin, req.admin.clientId ?? null, 'PASSWORD_CHANGED', 'admin_user', user.id, {});
    // The version bump ends every session this person holds, including this one.
    // Re-issue this session's cookie so the person who changed the password stays
    // signed in; any other browser they were signed in on is signed out (CP walk, 4 Oct 2026).
    const tv = (user.token_version ?? 0) + 1;
    const token = jwt.sign(
      { adminId: user.id, email: user.email, name: user.name, role: user.role, clientId: user.client_id ?? null, tv },
      ADMIN_SECRET, { expiresIn: `${SESSION_HOURS}h` }
    );
    await sessions.endSession(req.cookies?.cp_admin_token, 'reissued');
    await sessions.createSession('admin', user.id, token, req.headers['user-agent']);
    res.cookie('cp_admin_token', token, { ...COOKIE_OPTS, maxAge: SESSION_HOURS * 60 * 60 * 1000 })
       .json({ message: 'Password updated.' });
  } catch (err) {
    // SEC: as in /login — `current_password` and `new_password` are in scope and
    // are never passed to the logger.
    log.error('admin.auth.error', { err, route: 'PATCH /password', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/auth/logout — clear auth cookie and end the session row
router.post('/logout', async (req, res) => {
  try {
    await sessions.endSession(req.cookies?.cp_admin_token, 'logout');
    res.clearCookie('cp_admin_token', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' })
       .json({ message: 'Logged out.' });
  } catch (err) {
    log.error('admin.auth.error', { err, route: 'POST /logout', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
