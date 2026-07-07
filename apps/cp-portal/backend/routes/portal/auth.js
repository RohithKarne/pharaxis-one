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
const { sendEmail } = require('../../utils/mailer');

const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' };

const DEFAULT_TYPES = ['hcp', 'physician', 'patient', 'non_hcp', 'other'];

async function getValidTypes(clientId) {
  const [gateTypes] = await pool.execute('SELECT type_key FROM cp_gate_user_types WHERE client_id = ? AND is_enabled = 1', [clientId]);
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

    const [[client]] = await pool.execute('SELECT id FROM cp_clients WHERE code = ? AND is_active = 1', [client_code]);
    if (!client) return res.status(404).json({ error: 'Portal not found.' });

    const [[user]] = await pool.execute('SELECT * FROM cp_portal_users WHERE client_id = ? AND email = ? AND is_active = 1', [client.id, email]);
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid email or password.' });
    if (!user.email_verified) return res.status(403).json({ error: 'Please verify your email address before signing in. Check your inbox for the verification link.', unverified: true });

    await pool.execute(`UPDATE cp_portal_users SET last_login_at = NOW() WHERE id = ?`, [user.id]);

    const safe = { id: user.id, first_name: user.first_name, last_name: user.last_name, email, user_type: user.user_type, user_type_confirmed: user.user_type_confirmed };
    const token = makeToken(user, client.id);
    res.cookie('cp_portal_token', token, { ...COOKIE_OPTS, maxAge: 24 * 60 * 60 * 1000 })
       .json({ user: safe });
  } catch (err) {
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

    const [[updated]] = await pool.execute('SELECT id, first_name, last_name, email, user_type, user_type_confirmed FROM cp_portal_users WHERE id = ?', [req.portalUser.userId]);
    const newToken = makeToken(updated, req.portalUser.clientId);
    res.cookie('cp_portal_token', newToken, { ...COOKIE_OPTS, maxAge: 24 * 60 * 60 * 1000 })
       .json({ message: 'Type confirmed.', user: updated });
  } catch (err) {
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

    const [[updated]] = await pool.execute('SELECT id, first_name, last_name, email, user_type, user_type_confirmed FROM cp_portal_users WHERE id = ?', [req.portalUser.userId]);
    // SEC: do not echo the JWT in the response body — it lives only in the httpOnly cookie.
    res.json({ message: 'Profile updated.', user: updated });
  } catch (err) {
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

    const [[user]] = await pool.execute('SELECT password FROM cp_portal_users WHERE id = ?', [req.portalUser.userId]);
    if (!user || !bcrypt.compareSync(current_password, user.password)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
    if (bcrypt.compareSync(new_password, user.password)) {
      return res.status(400).json({ error: 'New password must be different from your current password.' });
    }

    const hash = await bcrypt.hash(new_password, 12);
    await pool.execute('UPDATE cp_portal_users SET password = ? WHERE id = ?', [hash, req.portalUser.userId]);
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
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
       .json({ message: 'Email verified successfully.', user: { id: user.id, first_name: user.first_name, last_name: user.last_name, email: user.email, user_type: user.user_type, user_type_confirmed: user.user_type_confirmed } });
  } catch (err) {
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
    sendEmail(client.id, {
      to: email,
      subject: 'Verify your email address',
      html: `<p>Hi ${user.first_name},</p><p>Here is your new verification link:</p><p><a href="${verifyUrl}" style="background:#6B3FA0;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Verify Email</a></p><p>This link expires in 24 hours.</p>`,
      text: `Hi ${user.first_name}, verify your email: ${verifyUrl}`,
    }).catch(() => {});

    res.json({ message: 'If that email is registered and unverified, a new link has been sent.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/portal/auth/logout — clear auth cookie
router.post('/logout', (_req, res) => {
  res.clearCookie('cp_portal_token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' })
     .json({ message: 'Logged out.' });
});

module.exports = router;
