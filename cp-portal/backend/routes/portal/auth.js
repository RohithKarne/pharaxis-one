/**
 * Portal Auth — /api/portal/auth
 * Registration, login, profile, and gate confirmation for portal users
 */

const express = require('express');
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const router  = express.Router();
const db      = require('../../database/db');
const { requirePortalAuth, authenticatePortal, PORTAL_SECRET } = require('../../middleware/auth');
const { sendEmail } = require('../../utils/mailer');

const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }

const DEFAULT_TYPES = ['hcp', 'physician', 'patient', 'non_hcp', 'other'];

function getValidTypes(clientId) {
  const gateTypes = db.prepare('SELECT type_key FROM cp_gate_user_types WHERE client_id = ? AND is_enabled = 1').all(clientId);
  const keys = gateTypes.map(r => r.type_key);
  return keys.length > 0 ? [...new Set([...DEFAULT_TYPES, ...keys])] : DEFAULT_TYPES;
}

function makeToken(user, clientId) {
  return jwt.sign(
    { userId: user.id, clientId, email: user.email, name: `${user.first_name} ${user.last_name}`, user_type: user.user_type },
    PORTAL_SECRET,
    { expiresIn: '24h' }
  );
}

// POST /api/portal/auth/register
router.post('/register', (req, res) => {
  const { client_code, first_name, last_name, email, password, user_type, specialty, country, phone } = req.body;
  if (!client_code || !first_name || !last_name || !email || !password) {
    return res.status(400).json({ error: 'client_code, first_name, last_name, email and password are required.' });
  }

  // API-07: Input length validation
  if (email.length      > 254) return res.status(400).json({ error: 'Input exceeds maximum length.' });
  if (password.length   > 128) return res.status(400).json({ error: 'Input exceeds maximum length.' });
  if (first_name.length > 100) return res.status(400).json({ error: 'Input exceeds maximum length.' });
  if (last_name.length  > 100) return res.status(400).json({ error: 'Input exceeds maximum length.' });
  if (country   && country.length   > 100) return res.status(400).json({ error: 'Input exceeds maximum length.' });
  if (specialty && specialty.length > 100) return res.status(400).json({ error: 'Input exceeds maximum length.' });
  if (req.body.phone && String(req.body.phone).length > 100) {
    return res.status(400).json({ error: 'Phone number exceeds maximum length.' });
  }

  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(client_code);
  if (!client) return res.status(404).json({ error: 'Portal not found.' });

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (!/[A-Z]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one uppercase letter.' });
  }
  if (!/[0-9]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one number.' });
  }

  const existing = db.prepare('SELECT id FROM cp_portal_users WHERE client_id = ? AND email = ?').get(client.id, email);
  if (existing) return res.status(409).json({ error: 'Email already registered.' });

  const hash  = bcrypt.hashSync(password, 10);
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h

  const info = db.prepare(`
    INSERT INTO cp_portal_users (client_id, first_name, last_name, email, password, user_type, specialty, country, phone, email_verified, verification_token, verification_token_expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(client.id, first_name, last_name, email, hash, user_type || 'other', specialty || null, country || null, phone || null, token, expires);

  // Send verification email — fire-and-forget, non-fatal
  const origin = req.headers.origin || `http://localhost:5174`
  const verifyUrl = `${origin}/portal/${client_code}/verify-email?token=${token}`
  sendEmail(client.id, {
    to: email,
    subject: 'Verify your email address',
    html: `<p>Hi ${first_name},</p><p>Thank you for registering. Please verify your email address by clicking the link below:</p><p><a href="${verifyUrl}" style="background:#6B3FA0;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Verify Email</a></p><p>This link expires in 24 hours.</p><p>If you did not register, please ignore this email.</p>`,
    text: `Hi ${first_name}, verify your email: ${verifyUrl}`,
  }).catch(() => {})

  res.status(201).json({ pending: true, message: 'Registration successful. Please check your email to verify your account.' });
});

// POST /api/portal/auth/login
router.post('/login', (req, res) => {
  const { client_code, email, password } = req.body;
  if (!client_code || !email || !password) return res.status(400).json({ error: 'client_code, email and password are required.' });

  // API-07: Input length validation
  if (email.length    > 254) return res.status(400).json({ error: 'Input exceeds maximum length.' });
  if (password.length > 128) return res.status(400).json({ error: 'Input exceeds maximum length.' });

  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(client_code);
  if (!client) return res.status(404).json({ error: 'Portal not found.' });

  const user = db.prepare('SELECT * FROM cp_portal_users WHERE client_id = ? AND email = ? AND is_active = 1').get(client.id, email);
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid email or password.' });
  if (!user.email_verified) return res.status(403).json({ error: 'Please verify your email address before signing in. Check your inbox for the verification link.', unverified: true });

  db.prepare(`UPDATE cp_portal_users SET last_login_at = datetime('now') WHERE id = ?`).run(user.id);

  const safe = { id: user.id, first_name: user.first_name, last_name: user.last_name, email, user_type: user.user_type, user_type_confirmed: user.user_type_confirmed };
  const token = makeToken(user, client.id);
  res.cookie('cp_portal_token', token, { ...COOKIE_OPTS, maxAge: 24 * 60 * 60 * 1000 })
     .json({ token, user: safe });
});

// GET /api/portal/auth/me — current user profile + submission history
router.get('/me', authenticatePortal, requirePortalAuth, (req, res) => {
  const user = db.prepare('SELECT id, first_name, last_name, email, user_type, user_type_confirmed, specialty, country, created_at FROM cp_portal_users WHERE id = ?').get(req.portalUser.userId);
  const submissions = db.prepare('SELECT id, submission_type, status, external_ref, submitted_at FROM cp_submissions WHERE user_id = ? ORDER BY submitted_at DESC').all(req.portalUser.userId);
  res.json({ user, submissions });
});

// PATCH /api/portal/auth/confirm-type — one-time gate confirmation (sets user_type_confirmed = 1)
router.patch('/confirm-type', authenticatePortal, requirePortalAuth, (req, res) => {
  const { user_type } = req.body;
  if (!user_type || !getValidTypes(req.portalUser.clientId).includes(user_type)) return res.status(400).json({ error: 'Invalid user_type.' });

  db.prepare(`UPDATE cp_portal_users SET user_type = ?, user_type_confirmed = 1 WHERE id = ?`).run(user_type, req.portalUser.userId);

  const updated = db.prepare('SELECT id, first_name, last_name, email, user_type, user_type_confirmed FROM cp_portal_users WHERE id = ?').get(req.portalUser.userId);
  const newToken = makeToken(updated, req.portalUser.clientId);
  res.cookie('cp_portal_token', newToken, { ...COOKIE_OPTS, maxAge: 24 * 60 * 60 * 1000 })
     .json({ message: 'Type confirmed.', token: newToken, user: updated });
});

// PATCH /api/portal/auth/profile — user updates their own profile (including changing user_type)
router.patch('/profile', authenticatePortal, requirePortalAuth, (req, res) => {
  const { first_name, last_name, country, specialty, user_type } = req.body;
  const updates = [], params = [];
  if (first_name !== undefined) { updates.push('first_name = ?'); params.push(first_name); }
  if (last_name  !== undefined) { updates.push('last_name = ?');  params.push(last_name); }
  if (country    !== undefined) { updates.push('country = ?');    params.push(country); }
  if (specialty  !== undefined) { updates.push('specialty = ?');  params.push(specialty); }
  if (user_type  !== undefined && getValidTypes(req.portalUser.clientId).includes(user_type)) {
    updates.push('user_type = ?');
    updates.push('user_type_confirmed = 1');
    params.push(user_type);
  }
  if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update.' });
  params.push(req.portalUser.userId);
  db.prepare(`UPDATE cp_portal_users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare('SELECT id, first_name, last_name, email, user_type, user_type_confirmed FROM cp_portal_users WHERE id = ?').get(req.portalUser.userId);
  res.json({ message: 'Profile updated.', token: makeToken(updated, req.portalUser.clientId), user: updated });
});

// GET /api/portal/auth/verify-email?token=xxx — confirm email + auto-login
router.get('/verify-email', (req, res) => {
  const { token } = req.query
  if (!token) return res.status(400).json({ error: 'Verification token is required.' })

  const user = db.prepare(`
    SELECT * FROM cp_portal_users
    WHERE verification_token = ? AND email_verified = 0
  `).get(token)

  if (!user) return res.status(400).json({ error: 'Invalid or already used verification link.' })
  if (user.verification_token_expires_at && new Date(user.verification_token_expires_at) < new Date()) {
    return res.status(400).json({ error: 'Verification link has expired. Please request a new one.', expired: true })
  }

  db.prepare(`UPDATE cp_portal_users SET email_verified=1, verification_token=NULL, verification_token_expires_at=NULL WHERE id=?`).run(user.id)

  const authToken = makeToken(user, user.client_id)
  res.cookie('cp_portal_token', authToken, { ...COOKIE_OPTS, maxAge: 24 * 60 * 60 * 1000 })
     .json({ message: 'Email verified successfully.', token: authToken, user: { id: user.id, first_name: user.first_name, last_name: user.last_name, email: user.email, user_type: user.user_type, user_type_confirmed: user.user_type_confirmed } })
})

// POST /api/portal/auth/resend-verification — resend verification email
router.post('/resend-verification', (req, res) => {
  const { client_code, email } = req.body
  if (!client_code || !email) return res.status(400).json({ error: 'client_code and email are required.' })

  const client = db.prepare('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1').get(client_code)
  if (!client) return res.status(404).json({ error: 'Portal not found.' })

  const user = db.prepare('SELECT * FROM cp_portal_users WHERE client_id = ? AND email = ? AND email_verified = 0 AND is_active = 1').get(client.id, email)
  // Return same message regardless — prevents email enumeration
  if (!user) return res.json({ message: 'If that email is registered and unverified, a new link has been sent.' })

  const token   = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  db.prepare(`UPDATE cp_portal_users SET verification_token=?, verification_token_expires_at=? WHERE id=?`).run(token, expires, user.id)

  const origin = req.headers.origin || `http://localhost:5174`
  const verifyUrl = `${origin}/portal/${client_code}/verify-email?token=${token}`
  sendEmail(client.id, {
    to: email,
    subject: 'Verify your email address',
    html: `<p>Hi ${user.first_name},</p><p>Here is your new verification link:</p><p><a href="${verifyUrl}" style="background:#6B3FA0;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Verify Email</a></p><p>This link expires in 24 hours.</p>`,
    text: `Hi ${user.first_name}, verify your email: ${verifyUrl}`,
  }).catch(() => {})

  res.json({ message: 'If that email is registered and unverified, a new link has been sent.' })
})

// POST /api/portal/auth/logout — clear auth cookie
router.post('/logout', (req, res) => {
  res.clearCookie('cp_portal_token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
     .json({ message: 'Logged out.' });
});

module.exports = router;
