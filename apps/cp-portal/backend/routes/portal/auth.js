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
const lockout = require('../../utils/loginLockout');
const { raiseAlert, releaseResolved } = require('../../services/adminAlerts');

const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' };

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
    { userId: user.id, clientId, email: user.email, name: `${user.first_name} ${user.last_name}`, user_type: user.user_type, tv: user.token_version ?? 0 },
    PORTAL_SECRET,
    { expiresIn: '24h' }
  );
}

function buildVerifyUrl(origin, clientCode, token) {
  return `${origin}/portal/${clientCode}/verify-email#token=${encodeURIComponent(token)}`;
}

// POST /api/portal/auth/register
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

// POST /api/portal/auth/request-access — CPPM-113. A doctor with no account asks for
// one: name, email, role and country. Nothing can sign in until the client's admin
// approves it, which sends the same set-password invitation an admin-created account
// gets. The answer is the same whether or not the email is new, so this cannot be
// used to find out who has an account.
router.post('/request-access', async (req, res) => {
  try {
    const { client_code, first_name, last_name, email, user_type, country } = req.body || {};
    const f = String(first_name || '').trim(), l = String(last_name || '').trim();
    const e = String(email || '').trim().toLowerCase(), c = String(country || '').trim();
    if (!client_code || !f || !l || !e || !c || !user_type) {
      return res.status(400).json({ error: 'Please fill in your first name, last name, email, role and country.' });
    }
    if (e.length > 254 || f.length > 255 || l.length > 255 || c.length > 100) return res.status(400).json({ error: 'Input exceeds maximum length.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return res.status(400).json({ error: 'Please enter a valid email address.' });

    const [[client]] = await pool.execute('SELECT id, code, login_mode FROM cp_clients WHERE code = ? AND is_active = 1', [client_code]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });
    // A single-sign-on-only portal has no passwords to set, so an approval could not be used.
    if (sso.normalizeLoginMode(client.login_mode) === 'sso_only') {
      return res.status(403).json({ error: 'This portal uses single sign-on. Ask your organisation for access.' });
    }
    const validTypes = await getValidTypes(client.id);
    if (!validTypes.includes(user_type)) return res.status(400).json({ error: 'Please choose your role from the list.' });

    const unusablePassword = `!request:${crypto.randomBytes(24).toString('hex')}`;
    try {
      const [info] = await pool.execute(
        `INSERT INTO cp_portal_users
           (client_id, first_name, last_name, email, password, user_type, country,
            is_active, is_verified, user_type_confirmed, email_verified, token_version,
            access_status, access_requested_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 1, 0, 'requested', UTC_TIMESTAMP())`,
        [client.id, f, l, e, unusablePassword, user_type, c]
      );
      await systemAudit('portal access request', client.id, 'ACCESS_REQUESTED', 'portal_user', info.insertId, { user_type });
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

    const [[client]] = await pool.execute('SELECT id, login_mode FROM cp_clients WHERE code = ? AND is_active = 1', [client_code]);
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

    await pool.execute(`UPDATE cp_portal_users SET last_login_at = NOW() WHERE id = ?`, [user.id]);

    const safe = { id: user.id, first_name: user.first_name, last_name: user.last_name, email, user_type: user.user_type, user_type_confirmed: user.user_type_confirmed, specialty: user.specialty };
    const token = makeToken(user, client.id);
    res.cookie('cp_portal_token', token, { ...COOKIE_OPTS, maxAge: 24 * 60 * 60 * 1000 })
       .json({ user: safe });
  } catch (err) {
    log.error('portal.auth.error', { err, route: 'POST /login', path: req.path, request_id: req.requestId || null });
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

    await pool.execute(`UPDATE cp_portal_users SET user_type = ?, user_type_confirmed = 1 WHERE id = ?`, [user_type, req.portalUser.userId]);

    const [[updated]] = await pool.execute('SELECT id, first_name, last_name, email, user_type, user_type_confirmed, specialty, token_version FROM cp_portal_users WHERE id = ?', [req.portalUser.userId]);
    const newToken = makeToken(updated, req.portalUser.clientId);
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
    if (new_password.length < 8)  return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    if (new_password.length > 128) return res.status(400).json({ error: 'Input exceeds maximum length.' });

    const [[user]] = await pool.execute('SELECT * FROM cp_portal_users WHERE id = ?', [req.portalUser.userId]);
    if (!user || !bcrypt.compareSync(current_password, user.password)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    if (bcrypt.compareSync(new_password, user.password)) {
      return res.status(400).json({ error: 'New password must be different from your current password.' });
    }

    const hash = await bcrypt.hash(new_password, 12);
    await pool.execute('UPDATE cp_portal_users SET password = ?, token_version = token_version + 1 WHERE id = ?', [hash, req.portalUser.userId]);
    // CP walk 2026-10-04: re-issue this browser's cookie with the new token version, so the
    // person who changed the password stays signed in; every other browser is signed out.
    // Before, the next page load after a change showed the sign-in page.
    const token = makeToken({ ...user, token_version: (user.token_version ?? 0) + 1 }, req.portalUser.clientId ?? user.client_id);
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
    if (new_password.length < 8)   return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    if (new_password.length > 128)  return res.status(400).json({ error: 'Input exceeds maximum length.' });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [[user]] = await pool.execute(
      'SELECT id FROM cp_portal_users WHERE reset_token = ? AND reset_token_expires_at > UTC_TIMESTAMP()',
      [tokenHash]
    );
    if (!user) return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });

    const hash = await bcrypt.hash(new_password, 12);
    await pool.execute(
      'UPDATE cp_portal_users SET password = ?, token_version = token_version + 1, reset_token = NULL, reset_token_expires_at = NULL WHERE id = ?',
      [hash, user.id]
    );
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
router.post('/logout', (_req, res) => {
  res.clearCookie('cp_portal_token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
     .json({ message: 'Logged out.' });
});

module.exports = router;
