/**
 * Portal Auth — /api/portal/auth
 * Registration, login, profile, and gate confirmation for portal users
 */

const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const router  = express.Router();
const { pool } = require('../../database/db');
const { requirePortalAuth, authenticatePortal, PORTAL_SECRET } = require('../../middleware/auth');
const { queueEmail } = require('../../utils/emailOutbox');
const sso = require('../../services/ssoService');
const log = require('../../utils/logger');
const { systemAudit } = require('../../utils/audit');
const knownDevices = require('../../utils/knownDevices');
const lockout = require('../../utils/loginLockout');
const { raiseAlert, releaseResolved } = require('../../services/adminAlerts');
const passwordRules = require('../../utils/passwordRules');
const sessions = require('../../utils/sessions');
const twoFactor = require('../../utils/twoFactor');
const { verifyDoctorCredentials } = require('../../services/credentialVerificationService');

const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' };
// E5: a browser the doctor asked us to remember skips the sign-in code for this long.
const TRUSTED_DAYS = 7;
const TRUSTED_COOKIE = 'cp_portal_device';

// CPPM-49: compared against when the email has no account, so a wrong address takes
// as long as a wrong password and the timing does not reveal who is registered.
const DUMMY_HASH = bcrypt.hashSync('cp-timing-equalizer', 12);

const DEFAULT_TYPES = ['hcp', 'physician', 'patient', 'non_hcp', 'other'];

async function getValidTypes(clientId) {
  const [gateTypes] = await pool.execute('SELECT type_key FROM cp_gate_user_types WHERE client_id = ? AND is_enabled = 1', [clientId]);
  const keys = gateTypes.map(r => r.type_key);
  return keys.length > 0 ? [...new Set([...DEFAULT_TYPES, ...keys])] : DEFAULT_TYPES;
}

function makeToken(user, clientId) {
  return jwt.sign(
    // CP-26: embed token_version so a password change/reset can revoke old tokens.
    // jti: two sign-ins in the same second otherwise produce the same token, which
    // the session row's unique key refuses (Tier 2 walk, 12 Oct 2026).
    { userId: user.id, clientId, email: user.email, name: `${user.first_name} ${user.last_name}`, user_type: user.user_type, tv: user.token_version ?? 0, jti: crypto.randomBytes(8).toString('hex') },
    PORTAL_SECRET,
    { expiresIn: '24h' }
  );
}

function buildVerifyUrl(origin, clientCode, token) {
  return `${origin}/portal/${clientCode}/verify-email#token=${encodeURIComponent(token)}`;
}

// POST /api/portal/auth/register
// New device (Rohith's sign-in Tier 2, 12 Oct 2026): a browser not seen before
// is recorded and, unless it is this person's first, emailed through the
// client's mail set-up. Called on every path that signs a portal user in.
async function noteNewDevice(req, res, user, clientId) {
  const device = await knownDevices.noteDevice(req, res, 'portal', user.id);
  if (!device.isNew) return;
  await systemAudit('portal sign-in', clientId, 'NEW_DEVICE', 'portal_user', user.id, { first_ever: device.firstEver, emailed: !device.firstEver });
  if (!device.firstEver) await knownDevices.sendNewDeviceEmail(clientId, { to: user.email, name: user.first_name, req, securityHint: 'sign out everywhere else under My Account' });
}

router.post('/register', async (req, res) => {
  try {
    return res.status(403).json({
      error: 'Self-registration is disabled. Contact your administrator for account access.',
    });
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'POST /register', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/portal/auth/verify-license — Feature 7: Doctor credential verification
router.post('/verify-license', async (req, res) => {
  try {
    const { license_number, registry_type, country } = req.body || {};
    const result = await verifyDoctorCredentials({ licenseNumber: license_number, registryType: registry_type, country });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/portal/auth/request-access — CPPM-113. A doctor with no account asks for
// one: name, email, role and country. Nothing can sign in until the client's admin
// approves it, which sends the same set-password invitation an admin-created account
// gets. The answer is the same whether or not the email is new, so this cannot be
// used to find out who has an account.
router.post('/request-access', async (req, res) => {
  try {
    const { client_code, first_name, last_name, email, user_type, country, weekly_email, license_number, registry_type } = req.body || {};
    const f = String(first_name || '').trim(), l = String(last_name || '').trim();
    const e = String(email || '').trim().toLowerCase(), c = String(country || '').trim();
    if (!client_code || !f || !l || !e || !c || !user_type) {
      return res.status(400).json({ error: 'Please fill in your first name, last name, email, role and country.' });
    }
    if (e.length > 254 || f.length > 255 || l.length > 255 || c.length > 100) return res.status(400).json({ error: 'Input exceeds maximum length.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return res.status(400).json({ error: 'Please enter a valid email address.' });

    // Feature 7: Validate doctor credentials before accepting access request
    let licenseVerified = 0;
    if (['doctor', 'healthcare_professional', 'hcp'].includes(user_type)) {
      const v = await verifyDoctorCredentials({ licenseNumber: license_number, registryType: registry_type, country: c });
      if (!v.valid) {
        return res.status(422).json({
          error: v.error || 'Medical professional registration requires a valid, active medical license number.',
          status: v.status,
        });
      }
      licenseVerified = 1;
    }

    const [[client]] = await pool.execute('SELECT id, code, login_mode FROM cp_clients WHERE code = ? AND is_active = 1', [client_code]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    // A single-sign-on-only portal has no passwords to set, so an approval could not be used.
    if (sso.normalizeLoginMode(client.login_mode) === 'sso_only') {
      return res.status(403).json({ error: 'This portal uses single sign-on. Ask your organisation for access.' });
    }
    const validTypes = await getValidTypes(client.id);
    if (!validTypes.includes(user_type)) return res.status(400).json({ error: 'Please choose your role from the list.' });

    const unusablePassword = `!request:${crypto.randomBytes(24).toString('hex')}`;
    // CPPM-101: the weekly email goes only to a reader who ticked the box; unticked is no.
    const weeklyEmail = weekly_email === true;
    const prefs = JSON.stringify({ news: true, documents: true, safety: true, weekly_email: weeklyEmail });
    try {
      let info;
      try {
        const [resIns] = await pool.execute(
          `INSERT INTO cp_portal_users
             (client_id, first_name, last_name, email, password, user_type, country,
              is_active, is_verified, user_type_confirmed, email_verified, token_version,
              access_status, access_requested_at, notif_prefs_json,
              license_number, registry_type, license_verified, license_verified_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 1, 0, 'requested', UTC_TIMESTAMP(), ?, ?, ?, ?, IF(?=1, UTC_TIMESTAMP(), NULL))`,
          [client.id, f, l, e, unusablePassword, user_type, c, prefs, license_number || null, registry_type || null, licenseVerified, licenseVerified]
        );
        info = resIns;
      } catch (colErr) {
        const [resIns] = await pool.execute(
          `INSERT INTO cp_portal_users
             (client_id, first_name, last_name, email, password, user_type, country,
              is_active, is_verified, user_type_confirmed, email_verified, token_version,
              access_status, access_requested_at, notif_prefs_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 1, 0, 'requested', UTC_TIMESTAMP(), ?)`,
          [client.id, f, l, e, unusablePassword, user_type, c, prefs]
        );
        info = resIns;
      }
      await systemAudit('portal access request', client.id, 'ACCESS_REQUESTED', 'portal_user', info.insertId, { user_type, weekly_email: weeklyEmail });
      // Tell the client's admins. One open alert per portal, however many requests
      // arrive, so a burst of requests cannot become a burst of emails. It carries no
      // personal detail; names and emails are read in the admin console.
      // CPPM-140: a new request is new news, so an alert an admin resolved by hand
      // does not keep it quiet.
      await releaseResolved(client.id, 'access_requested');
      raiseAlert(client.id, {
        kind: 'access_requested', audience: 'admin',
        title: 'Doctors have asked for portal access',
        body: 'Open Inbox › Access Requests to approve or decline them.', // CPPM-139
        linkPath: `/admin/clients/${client.id}/access-requests`,
        dedupeKey: 'access_requested',
      });
    } catch (err) {
      // uq_portal_users is UNIQUE(client_id, email): an account or an earlier request.
      // CPPM-151 walk: answered the same as a new request, so the form cannot be
      // used to learn whether an email is registered — sign-in and forgot-password
      // already give nothing away. The admins see the earlier request or account;
      // nothing is created twice.
      if (err && err.code === 'ER_DUP_ENTRY') {
        await systemAudit('portal access request', client.id, 'ACCESS_REQUEST_REPEATED', 'portal_user', null, { user_type });
        return res.status(201).json({ message: 'Thank you. Your request has been sent to the portal team. You will get an email to set your password once it is approved.' });
      }
      throw err;
    }
    res.status(201).json({ message: 'Thank you. Your request has been sent to the portal team. You will get an email to set your password once it is approved.' });
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'POST /request-access', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/portal/auth/login
router.post('/login', async (req, res) => {
  try {
    const { client_code, email, password } = req.body;
    if (!client_code || !email || !password) return res.status(400).json({ error: 'client_code, email and password are required.' });

    // API-07: Input length validation
    if (email.length    > 254) return res.status(400).json({ error: 'Input exceeds maximum length.' });
    if (password.length > 128) return res.status(400).json({ error: 'Input exceeds maximum length.' });

    const [[client]] = await pool.execute('SELECT id, login_mode, portal_two_step FROM cp_clients WHERE code = ? AND is_active = 1', [client_code]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    // CPPM-50: the sign-in page hides the password form for a single-sign-on-only
    // portal; refuse the password itself too, before it is checked, so a password
    // set before the switch cannot be used by posting here directly.
    if (sso.normalizeLoginMode(client.login_mode) === 'sso_only') {
      return res.status(403).json({ error: 'This portal uses single sign-on. Use the sign-on button to sign in.' });
    }

    // CPPM-49: while locked, refuse before the password is checked, so the right
    // password is refused too.
    const lockKey = lockout.loginKey('portal', client.id, email);
    if (await lockout.isLocked(lockKey)) return res.status(423).json({ error: lockout.LOCKED_MESSAGE });

    const [[user]] = await pool.execute('SELECT * FROM cp_portal_users WHERE client_id = ? AND email = ? AND is_active = 1', [client.id, email]);
    const valid = bcrypt.compareSync(password, user ? user.password : DUMMY_HASH);
    if (!user || !valid) {
      if (await lockout.recordFailure(lockKey)) {
        if (user) await systemAudit('portal sign-in', client.id, 'LOGIN_LOCKED', 'portal_user', user.id, { minutes: lockout.LOCK_MINUTES });
        return res.status(423).json({ error: lockout.LOCKED_MESSAGE });
      }
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    await lockout.clearAttempts(lockKey);
    if (!user.email_verified) return res.status(403).json({ error: 'Please verify your email address before signing in. Check your inbox for the verification link.', unverified: true });

    // Row 6 of the 27 Oct review: when the client asks for it, the password is step
    // one and a code emailed to the doctor is step two. No session exists until then.
    if (client.portal_two_step && await isTrustedBrowser(user.id, req.cookies?.[TRUSTED_COOKIE])) {
      await systemAudit('portal sign-in', client.id, 'LOGIN', 'portal_user', user.id, { second_step: 'remembered_browser' });
      return await finishSignIn(req, res, user, client.id);
    }
    if (client.portal_two_step) {
      await sendSignInCode(user, client.id);
      return res.json({ twoStep: true, challengeToken: makeChallenge(user, client.id), maskedEmail: twoFactor.maskEmail(user.email), expiresInMinutes: twoFactor.EMAIL_CODE_MINUTES });
    }
    await finishSignIn(req, res, user, client.id);
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'POST /login', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

async function finishSignIn(req, res, user, clientId) {
  await pool.execute(`UPDATE cp_portal_users SET last_login_at = NOW() WHERE id = ?`, [user.id]);
  const safe = { id: user.id, first_name: user.first_name, last_name: user.last_name, email: user.email, user_type: user.user_type, user_type_confirmed: user.user_type_confirmed, specialty: user.specialty };
  const token = makeToken(user, clientId);
  await sessions.createSession('portal', user.id, token, req.headers['user-agent']);
  await noteNewDevice(req, res, user, clientId);
  res.cookie('cp_portal_token', token, { ...COOKIE_OPTS, maxAge: 24 * 60 * 60 * 1000 })
     .json({ user: safe });
}

async function isTrustedBrowser(userId, rawToken) {
  if (!rawToken) return false;
  const [[row]] = await pool.execute(
    'SELECT id FROM cp_portal_trusted_devices WHERE portal_user_id = ? AND device_token_hash = ? AND expires_at > NOW()',
    [userId, twoFactor.hashValue(rawToken)]);
  if (!row) return false;
  await pool.execute('UPDATE cp_portal_trusted_devices SET last_used_at = NOW() WHERE id = ?', [row.id]);
  return true;
}

// A new password means every remembered browser must prove itself again.
async function forgetBrowsers(userId) {
  await pool.execute('DELETE FROM cp_portal_trusted_devices WHERE portal_user_id = ?', [userId]);
}

// The proof that step one passed: short-lived, and good only for the code routes.
function makeChallenge(user, clientId) {
  return jwt.sign({ stage: 'portal_2fa', userId: user.id, clientId }, PORTAL_SECRET, { expiresIn: `${twoFactor.EMAIL_CODE_MINUTES}m` });
}

async function readChallenge(req) {
  let decoded;
  try { decoded = jwt.verify(String(req.body?.challengeToken || ''), PORTAL_SECRET, { algorithms: ['HS256'] }); } catch { return null; }
  if (decoded.stage !== 'portal_2fa') return null;
  const [[user]] = await pool.execute('SELECT * FROM cp_portal_users WHERE id = ? AND client_id = ? AND is_active = 1', [decoded.userId, decoded.clientId]);
  return user ? { user, clientId: decoded.clientId } : null;
}

// A new code replaces any earlier one still waiting.
async function sendSignInCode(user, clientId) {
  const code = twoFactor.generateEmailCode();
  await pool.execute('UPDATE cp_portal_2fa_codes SET is_consumed = 1 WHERE portal_user_id = ? AND is_consumed = 0', [user.id]);
  await pool.execute(
    `INSERT INTO cp_portal_2fa_codes (portal_user_id, client_id, code_hash, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE))`,
    [user.id, clientId, twoFactor.hashValue(code), twoFactor.EMAIL_CODE_MINUTES]);
  await queueEmail(clientId, {
    to: user.email,
    subject: 'Your sign-in code',
    text: `Hello ${user.first_name}, your sign-in code is ${code}. It expires in ${twoFactor.EMAIL_CODE_MINUTES} minutes. If you did not try to sign in, change your password.`,
    html: `<p>Hello ${user.first_name},</p><p>Your sign-in code is <strong style="font-size:20px;letter-spacing:3px">${code}</strong>.</p><p>It expires in ${twoFactor.EMAIL_CODE_MINUTES} minutes. If you did not try to sign in, change your password.</p>`,
  }, { kind: 'portal_2fa_code', relatedType: 'portal_user', relatedId: user.id, sensitive: true });
}

// POST /api/portal/auth/login/verify — step two: the emailed code, then the real sign-in.
router.post('/login/verify', async (req, res) => {
  try {
    const pending = await readChallenge(req);
    if (!pending) return res.status(401).json({ error: 'Your sign-in timed out. Enter your password again.', restart: true });
    const { user, clientId } = pending;
    const [[row]] = await pool.execute(
      `SELECT id, code_hash, attempts FROM cp_portal_2fa_codes
        WHERE portal_user_id = ? AND is_consumed = 0 AND expires_at > NOW() ORDER BY id DESC LIMIT 1`, [user.id]);
    if (!row) return res.status(401).json({ error: 'That code has expired. Send a new code.' });
    if (row.attempts >= 5) return res.status(423).json({ error: 'Too many wrong codes. Send a new code.' });
    const given = twoFactor.hashValue(String(req.body?.code || '').trim());
    if (!twoFactor.timingSafeEqualStr(given, row.code_hash)) {
      await pool.execute('UPDATE cp_portal_2fa_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
      await systemAudit('portal sign-in', clientId, 'LOGIN_FAILED', 'portal_user', user.id, { reason: 'wrong_code' });
      return res.status(401).json({ error: row.attempts + 1 >= 5 ? 'Too many wrong codes. Send a new code.' : 'That code is not right. Check the email and try again.' });
    }
    await pool.execute('UPDATE cp_portal_2fa_codes SET is_consumed = 1 WHERE id = ?', [row.id]);
    if (req.body?.rememberBrowser) {
      const raw = twoFactor.generateDeviceToken();
      await pool.execute(
        `INSERT INTO cp_portal_trusted_devices (portal_user_id, device_token_hash, user_agent, expires_at, last_used_at)
         VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), NOW())`,
        [user.id, twoFactor.hashValue(raw), String(req.headers['user-agent'] || '').slice(0, 500), TRUSTED_DAYS]);
      res.cookie(TRUSTED_COOKIE, raw, { ...COOKIE_OPTS, path: '/', maxAge: TRUSTED_DAYS * 24 * 60 * 60 * 1000 });
    }
    await systemAudit('portal sign-in', clientId, 'LOGIN', 'portal_user', user.id, { second_step: 'email_code', remembered_browser: !!req.body?.rememberBrowser });
    await finishSignIn(req, res, user, clientId);
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'POST /login/verify', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/portal/auth/login/resend — a fresh code for the same step-one pass.
router.post('/login/resend', async (req, res) => {
  try {
    const pending = await readChallenge(req);
    if (!pending) return res.status(401).json({ error: 'Your sign-in timed out. Enter your password again.', restart: true });
    const [[recent]] = await pool.execute(
      'SELECT id FROM cp_portal_2fa_codes WHERE portal_user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 30 SECOND) LIMIT 1', [pending.user.id]);
    if (recent) return res.status(429).json({ error: 'A code was sent a moment ago. Wait 30 seconds before asking for another.' });
    await sendSignInCode(pending.user, pending.clientId);
    res.json({ sent: true });
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'POST /login/resend', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/auth/me — current user profile + submission history
router.get('/me', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const [[user]] = await pool.execute('SELECT id, first_name, last_name, email, user_type, user_type_confirmed, specialty, country, created_at FROM cp_portal_users WHERE id = ?', [req.portalUser.userId]);
    const [submissions] = await pool.execute('SELECT id, submission_type, status, external_ref, submitted_at FROM cp_submissions WHERE user_id = ? ORDER BY submitted_at DESC', [req.portalUser.userId]);
    res.json({ user, submissions });
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'GET /me', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/portal/auth/confirm-type — one-time gate confirmation (sets user_type_confirmed = 1)
router.patch('/confirm-type', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const { user_type } = req.body;
    const validTypes = await getValidTypes(req.portalUser.clientId);
    if (!user_type || !validTypes.includes(user_type)) return res.status(400).json({ error: 'Invalid user_type.' });

    // The role is set when the person asks for access (or an admin adds them), and the
    // portal team approves it. This gate confirms it; it must not change it. Before, a
    // user approved as a patient could pick "Healthcare Professional" here and see
    // HCP-only content. Only the portal team changes a role (Portal Users).
    const [[current]] = await pool.execute('SELECT user_type FROM cp_portal_users WHERE id = ?', [req.portalUser.userId]);
    if (current && validTypes.includes(current.user_type) && current.user_type !== user_type) {
      return res.status(403).json({ error: 'Your role was set when your access was approved. To change it, please contact the portal team.' });
    }

    await pool.execute(`UPDATE cp_portal_users SET user_type = ?, user_type_confirmed = 1 WHERE id = ?`, [user_type, req.portalUser.userId]);
    // Rohith, 10 Nov 2026: the confirmation is recorded, so a role is always traceable.
    await systemAudit('portal first sign-in', req.portalUser.clientId, 'ROLE_CONFIRMED', 'portal_user', req.portalUser.userId,
      { user_type, role_before: current?.user_type ?? null });

    const [[updated]] = await pool.execute('SELECT id, first_name, last_name, email, user_type, user_type_confirmed, specialty, token_version FROM cp_portal_users WHERE id = ?', [req.portalUser.userId]);
    const newToken = makeToken(updated, req.portalUser.clientId);
    await sessions.endSession(req.cookies?.cp_portal_token, 'reissued');
    await sessions.createSession('portal', updated.id, newToken, req.headers['user-agent']);
    res.cookie('cp_portal_token', newToken, { ...COOKIE_OPTS, maxAge: 24 * 60 * 60 * 1000 })
       .json({ message: 'Type confirmed.', user: updated });
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'PATCH /confirm-type', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/portal/auth/profile — user updates their own profile details.
// SEC: user_type is intentionally NOT editable here. It gates access to
// HCP-only clinical content, so allowing self-service changes would let a
// patient-tier user escalate to HCP. Type is set only via the one-time gate
// confirmation flow (PATCH /confirm-type), which applies the required disclaimer.
router.patch('/profile', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const { first_name, last_name, country, specialty } = req.body;
    const updates = [], params = [];
    if (first_name !== undefined) { updates.push('first_name = ?'); params.push(first_name); }
    if (last_name  !== undefined) { updates.push('last_name = ?');  params.push(last_name); }
    if (country    !== undefined) { updates.push('country = ?');    params.push(country); }
    if (specialty  !== undefined) { updates.push('specialty = ?');  params.push(specialty); }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
    params.push(req.portalUser.userId);
    await pool.execute(`UPDATE cp_portal_users SET ${updates.join(', ')} WHERE id = ?`, params);

    const [[updated]] = await pool.execute('SELECT id, first_name, last_name, email, user_type, user_type_confirmed, specialty, token_version FROM cp_portal_users WHERE id = ?', [req.portalUser.userId]);
    // SEC: do not echo the JWT in the response body — it lives only in the httpOnly cookie.
    res.json({ message: 'Profile updated.', user: updated });
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'PATCH /profile', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// PATCH /api/portal/auth/password — user changes their own password (requires current password)
router.patch('/password', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Current and new password are required.' });

    const [[user]] = await pool.execute('SELECT * FROM cp_portal_users WHERE id = ?', [req.portalUser.userId]);
    if (!user || !bcrypt.compareSync(current_password, user.password)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    if (bcrypt.compareSync(new_password, user.password)) {
      return res.status(400).json({ error: 'New password must be different from your current password.' });
    }
    // Rohith's sign-in Tier 1 (12 Oct 2026): 12 characters, not a common password, not one of the last five.
    const problem = passwordRules.checkPassword(new_password, { email: user.email });
    if (problem) return res.status(400).json({ error: problem });
    if (await passwordRules.isRecentPassword('portal', user.id, new_password)) return res.status(400).json({ error: passwordRules.RECENT_MESSAGE });

    const hash = await bcrypt.hash(new_password, 12);
    await pool.execute('UPDATE cp_portal_users SET password = ?, token_version = token_version + 1 WHERE id = ?', [hash, req.portalUser.userId]);
    await forgetBrowsers(req.portalUser.userId);
    await passwordRules.rememberPassword('portal', user.id, hash);
    // CP walk 2026-10-04: re-issue this browser's cookie with the new token version, so the
    // person who changed the password stays signed in; every other browser is signed out.
    // Before, the next page load after a change showed the sign-in page.
    const token = makeToken({ ...user, token_version: (user.token_version ?? 0) + 1 }, req.portalUser.clientId ?? user.client_id);
    await sessions.endSession(req.cookies?.cp_portal_token, 'reissued');
    await sessions.createSession('portal', user.id, token, req.headers['user-agent']);
    res.cookie('cp_portal_token', token, { ...COOKIE_OPTS, maxAge: 24 * 60 * 60 * 1000 })
       .json({ message: 'Password updated successfully.' });
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'PATCH /password', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/portal/auth/verify-email - confirm email + auto-login
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Verification token is required.' });

    const [[user]] = await pool.execute(`
      SELECT * FROM cp_portal_users
      WHERE verification_token = ? AND email_verified = 0
    `, [token]);

    if (!user) return res.status(400).json({ error: 'Invalid or already used verification link.' });
    if (user.verification_token_expires_at && new Date(user.verification_token_expires_at) < new Date()) {
      return res.status(400).json({ error: 'Verification link has expired. Please request a new one.', expired: true });
    }

    await pool.execute(`UPDATE cp_portal_users SET email_verified=1, verification_token=NULL, verification_token_expires_at=NULL WHERE id=?`, [user.id]);

    const authToken = makeToken(user, user.client_id);
    await sessions.createSession('portal', user.id, authToken, req.headers['user-agent']);
    await noteNewDevice(req, res, user, user.client_id);
    res.cookie('cp_portal_token', authToken, { ...COOKIE_OPTS, maxAge: 24 * 60 * 60 * 1000 })
       .json({ message: 'Email verified successfully.', user: { id: user.id, first_name: user.first_name, last_name: user.last_name, email: user.email, user_type: user.user_type, user_type_confirmed: user.user_type_confirmed, specialty: user.specialty } });
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'POST /verify-email', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/portal/auth/resend-verification — resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { client_code, email } = req.body;
    if (!client_code || !email) return res.status(400).json({ error: 'client_code and email are required.' });

    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [client_code]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });

    const [[user]] = await pool.execute('SELECT * FROM cp_portal_users WHERE client_id = ? AND email = ? AND email_verified = 0 AND is_active = 1', [client.id, email]);
    // Return same message regardless — prevents email enumeration
    if (!user) return res.json({ message: 'If that email is registered and unverified, a new link has been sent.' });

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
    await pool.execute(`UPDATE cp_portal_users SET verification_token=?, verification_token_expires_at=? WHERE id=?`, [token, expires, user.id]);

    const origin = req.headers.origin || `http://localhost:5174`;
    const verifyUrl = buildVerifyUrl(origin, client_code, token);
    queueEmail(client.id, {
      to: email,
      subject: 'Verify your email address',
      html: `<p>Hi ${user.first_name},</p><p>Here is your new verification link:</p><p><a href="${verifyUrl}" style="background:#6B3FA0;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Verify Email</a></p><p>This link expires in 24 hours.</p>`,
      text: `Hi ${user.first_name}, verify your email: ${verifyUrl}`,
    }, { kind: 'email_verification', relatedType: 'portal_user', relatedId: user.id, sensitive: true });

    res.json({ message: 'If that email is registered and unverified, a new link has been sent.' });
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'POST /resend-verification', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/portal/auth/forgot-password — issue a password reset link (CP-37)
router.post('/forgot-password', async (req, res) => {
  try {
    const { client_code, email } = req.body;
    if (!client_code || !email) return res.status(400).json({ error: 'client_code and email are required.' });
    if (email.length > 254) return res.status(400).json({ error: 'Input exceeds maximum length.' });

    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [client_code]);
    if (client) {
      const [[user]] = await pool.execute(
        'SELECT id, first_name FROM cp_portal_users WHERE client_id = ? AND email = ? AND is_active = 1 AND email_verified = 1',
        [client.id, email]
      );
      if (user) {
        // Store only a SHA-256 hash of the token; email the raw token. 1h expiry.
        const rawToken  = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expires   = new Date(Date.now() + 60 * 60 * 1000).toISOString().replace('T', ' ').substring(0, 19);
        await pool.execute('UPDATE cp_portal_users SET reset_token = ?, reset_token_expires_at = ? WHERE id = ?', [tokenHash, expires, user.id]);

        const origin   = req.headers.origin || 'http://localhost:5174';
        const resetUrl = `${origin}/portal/${client_code}/reset-password#token=${encodeURIComponent(rawToken)}`;
        queueEmail(client.id, {
          to: email,
          subject: 'Reset your password',
          html: `<p>Hi ${user.first_name},</p><p>We received a request to reset your password.</p><p><a href="${resetUrl}" style="background:#6B3FA0;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Reset Password</a></p><p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>`,
          text: `Hi ${user.first_name}, reset your password: ${resetUrl} (expires in 1 hour)`,
        }, { kind: 'password_reset', relatedType: 'portal_user', relatedId: user.id, sensitive: true });
      }
    }
    // Generic response regardless of whether the account exists — prevents enumeration.
    res.json({ message: 'If that email is registered, a password reset link has been sent.' });
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'POST /forgot-password', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/portal/auth/reset-password — complete the reset with a valid token (CP-37)
router.post('/reset-password', async (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) return res.status(400).json({ error: 'token and new_password are required.' });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [[user]] = await pool.execute(
      'SELECT id, email FROM cp_portal_users WHERE reset_token = ? AND reset_token_expires_at > UTC_TIMESTAMP()',
      [tokenHash]
    );
    if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    // Rohith's sign-in Tier 1 (12 Oct 2026): 12 characters, not a common password, not one of the last five.
    const problem = passwordRules.checkPassword(new_password, { email: user.email });
    if (problem) return res.status(400).json({ error: problem });
    if (await passwordRules.isRecentPassword('portal', user.id, new_password)) return res.status(400).json({ error: passwordRules.RECENT_MESSAGE });

    const hash = await bcrypt.hash(new_password, 12);
    await pool.execute(
      'UPDATE cp_portal_users SET password = ?, token_version = token_version + 1, reset_token = NULL, reset_token_expires_at = NULL WHERE id = ?',
      [hash, user.id]
    );
    await forgetBrowsers(user.id);
    await passwordRules.rememberPassword('portal', user.id, hash);
    res.json({ message: 'Your password has been reset. You can now sign in.' });
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'POST /reset-password', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// ─── Single Sign-On (OIDC) ────────────────────────────────────────────────────
// Ported from MIMS "Signal SSO". SSO logs a user into an EXISTING, admin-provisioned
// account matched by verified email — it never self-registers, matching the portal's
// "access by administrator approval only" policy. See services/ssoService.js.

// GET /api/portal/auth/sso/providers?client_code= — public list of enabled providers
router.get('/sso/providers', async (req, res) => {
  try {
    const client = await sso.getClientByCode(req.query.client_code);
    if (!client || !client.is_active) return res.status(404).json({ error: 'Portal not found.' });
    const options = await sso.getPublicLoginOptions(client.id, client.code);
    res.json(options || { providers: [], local_login_allowed: true, sso_login_allowed: false });
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'GET /sso/providers', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/portal/auth/sso/:provider/start?client_code=&return_to= — redirect to IdP
router.get('/sso/:provider/start', async (req, res) => {
  try {
    const providerKey = sso.normalizeProviderKey(req.params.provider);
    if (!providerKey) return res.status(400).send('Unsupported SSO provider.');

    const client = await sso.getClientByCode(req.query.client_code);
    if (!client || !client.is_active) return res.status(404).send('Portal not found.');
    if (sso.normalizeLoginMode(client.login_mode) === 'local_only') {
      return res.status(403).send('SSO is not enabled for this portal.');
    }

    const provider = await sso.getProviderConfig(client.id, providerKey);
    if (!provider?.enabled) return res.status(404).send('This SSO provider is not configured.');

    const nonce = sso.makeCryptoNonce();
    const returnTo = typeof req.query.return_to === 'string' ? req.query.return_to : '';
    const state = sso.issueSsoState({
      clientId: client.id,
      clientCode: client.code,
      provider: providerKey,
      nonce,
      returnTo,
    });
    const url = await sso.buildAuthorizationUrl(client.id, providerKey, state, nonce);
    res.redirect(url);
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'GET /sso/:provider/start', path: req.path, request_id: req.requestId || null });
    res.status(500).send('Unable to start SSO sign-in.');
  }
});

// GET /api/portal/auth/sso/:provider/callback?code=&state= — IdP redirect target
router.get('/sso/:provider/callback', async (req, res) => {
  // Best-effort clientCode for the error redirect; refined once state is parsed.
  let clientCode = '';
  const fail = (reason) => res.redirect(sso.ssoCompleteUrl(clientCode || '_', { error: reason }));
  try {
    const providerKey = sso.normalizeProviderKey(req.params.provider);
    const { code, state, error: idpError } = req.query;
    if (idpError) return fail('idp_declined');
    if (!providerKey || !code || !state) return fail('invalid_request');

    let parsed;
    try { parsed = sso.parseSsoState(state); }
    catch { return fail('expired'); }
    if (parsed.provider !== providerKey) return fail('invalid_request');
    clientCode = parsed.clientCode || '';

    const client = await sso.getClientById(parsed.clientId);
    if (!client || !client.is_active) return fail('portal_unavailable');
    if (sso.normalizeLoginMode(client.login_mode) === 'local_only') return fail('sso_disabled');

    let tokens;
    try {
      tokens = await sso.exchangeCodeForTokens(client.id, providerKey, code);
    } catch (tokErr) {
      console.error('❌ SSO Token Exchange Failure:', tokErr?.message || tokErr);
      return fail('idp_declined');
    }

    let identity;
    try {
      identity = await sso.verifyIdToken(client.id, providerKey, tokens.id_token, parsed.nonce);
    } catch (verr) {
      console.error('❌ SSO ID Token Verification Failure:', verr?.message || verr);
      return fail(verr.code === 'DOMAIN_NOT_ALLOWED' ? 'domain_not_allowed' : 'verification_failed');
    }

    // Resolve the portal user: first by a previously-linked SSO identity, then by
    // verified email against an existing active account. No auto-provisioning.
    let user = null;
    const [[linked]] = await pool.execute(
      `SELECT u.* FROM cp_sso_identities i
         JOIN cp_portal_users u ON u.id = i.portal_user_id
        WHERE i.client_id = ? AND i.provider_key = ? AND i.subject = ? AND u.is_active = 1
        LIMIT 1`,
      [client.id, providerKey, identity.subject]
    );
    if (linked) {
      user = linked;
    } else {
      if (!identity.emailVerified) return fail('email_unverified');
      const [[byEmail]] = await pool.execute(
        'SELECT * FROM cp_portal_users WHERE client_id = ? AND email = ? AND is_active = 1 LIMIT 1',
        [client.id, identity.email]
      );
      // CPPM-51: access is by administrator approval only, so single sign-on never
      // creates an account — an email with no active account is refused. (It did
      // create one from 29 Jul, contrary to the SSO settings screen.) Only the
      // email's domain is recorded: the person has no account with us.
      if (!byEmail) {
        const domain = identity.email.split('@')[1] || '';
        await systemAudit('portal sign-on', client.id, 'LOGIN_REFUSED', 'portal_user', null,
          { provider: providerKey, reason: 'no_account', email_domain: domain });
        return fail('no_account');
      }
      user = byEmail;
      // Link this IdP identity to the matched account for future logins.
      await pool.execute(
        `INSERT INTO cp_sso_identities (client_id, portal_user_id, provider_key, subject, email, last_login_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE portal_user_id = VALUES(portal_user_id), email = VALUES(email), last_login_at = NOW()`,
        [client.id, user.id, providerKey, identity.subject, identity.email]
      );
    }

    // An SSO login proves control of the email, so mark it verified if it wasn't.
    await pool.execute(
      'UPDATE cp_portal_users SET last_login_at = NOW(), email_verified = 1 WHERE id = ?',
      [user.id]
    );
    if (linked) {
      await pool.execute(
        'UPDATE cp_sso_identities SET last_login_at = NOW() WHERE client_id = ? AND provider_key = ? AND subject = ?',
        [client.id, providerKey, identity.subject]
      );
    }

    const token = makeToken(user, client.id);
    await sessions.createSession('portal', user.id, token, req.headers['user-agent']);
    await noteNewDevice(req, res, user, client.id);
    res.cookie('cp_portal_token', token, { ...COOKIE_OPTS, maxAge: 24 * 60 * 60 * 1000 });
    const safeReturn = typeof parsed.returnTo === 'string' && parsed.returnTo.startsWith(`/portal/${client.code}`)
      ? parsed.returnTo
      : '';
    res.redirect(sso.ssoCompleteUrl(client.code, safeReturn ? { return_to: safeReturn } : {}));
  } catch (err) {
    console.error('❌ SSO Callback Processing Error:', err);
    fail('server_error');
  }
});

// POST /api/portal/auth/logout — clear auth cookie
// ── Where you are signed in (Rohith's sign-in Tier 2, 12 Oct 2026) ──────────
router.get('/sessions', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    res.json({ sessions: await sessions.listSessions('portal', req.portalUser.userId, req.cookies?.cp_portal_token) });
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'GET /sessions', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/sessions/end-others', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const ended = await sessions.endOtherSessions('portal', req.portalUser.userId, req.cookies?.cp_portal_token);
    await systemAudit('portal sign-in', req.portalUser.clientId, 'SESSIONS_ENDED', 'portal_user', req.portalUser.userId, { ended });
    res.json({ ended });
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'POST /sessions/end-others', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/sessions/:id/end', authenticatePortal, requirePortalAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!await sessions.endSessionById('portal', req.portalUser.userId, id)) return res.status(404).json({ error: 'Session not found.' });
    await systemAudit('portal sign-in', req.portalUser.clientId, 'SESSIONS_ENDED', 'portal_user', req.portalUser.userId, { ended: 1, session_id: id });
    res.json({ message: 'Session ended.' });
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'POST /sessions/:id/end', path: req.path, request_id: req.requestId || null });
    res.status(500).json({ error: 'Server error.' });
  }
});

router.post('/logout', async (req, res) => {
  await sessions.endSession(req.cookies?.cp_portal_token, 'logout').catch(() => {});
  res.clearCookie('cp_portal_token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
     .json({ message: 'Logged out.' });
});

module.exports = router;
