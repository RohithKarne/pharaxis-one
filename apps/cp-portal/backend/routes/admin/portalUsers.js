/**
 * Admin Portal Users — /api/admin/users
 * View and manage portal-facing users (patients, HCPs, etc.)
 */

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { pool } = require('../../database/db');
const { authenticateAdmin, requireClientAccess } = require('../../middleware/auth');
const { sendEmail } = require('../../utils/mailer');

router.use('/:clientId', authenticateAdmin, requireClientAccess);
const { audit } = require('../../utils/audit');

const VALID_USER_TYPES = ['hcp', 'physician', 'patient', 'non_hcp', 'other'];

// Invitations last longer than a password reset — an admin provisioning an account
// on Monday should not have it expire before the user opens their mail.
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Issues a single-use set-password link for a portal user and emails it.
 *
 * Reuses the reset-token columns on purpose: the storage rules are identical
 * (store only a SHA-256 hash, email the raw token) and reusing them means the
 * existing POST /api/portal/auth/reset-password endpoint completes the flow with
 * no new verification path to get wrong.
 *
 * The admin never sees or sets the password — that is the point. Provisioning
 * hands over an invitation, not a credential.
 */
async function issueInvite({ userId, clientId, clientCode, email, firstName, origin, isResend }) {
  const rawToken  = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expires   = new Date(Date.now() + INVITE_TTL_MS).toISOString().replace('T', ' ').substring(0, 19);

  await pool.execute(
    'UPDATE cp_portal_users SET reset_token = ?, reset_token_expires_at = ? WHERE id = ?',
    [tokenHash, expires, userId]
  );

  const base      = origin || 'http://localhost:5174';
  const inviteUrl = `${base}/portal/${clientCode}/reset-password#token=${encodeURIComponent(rawToken)}`;
  const heading   = isResend ? 'Here is your new sign-in link' : 'Your portal account is ready';

  // Fire-and-forget, exactly as the rest of the portal treats mail: a mail outage
  // must not fail account creation, and the admin can always resend.
  sendEmail(clientId, {
    to: email,
    subject: isResend ? 'Your portal invitation' : 'Set your password',
    html: `<p>Hi ${firstName},</p><p>${heading}. Choose a password to activate your account.</p>`
        + `<p><a href="${inviteUrl}" style="background:#6B3FA0;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block">Set Password</a></p>`
        + `<p>This link expires in 7 days.</p>`,
    text: `Hi ${firstName}, set your password: ${inviteUrl} (expires in 7 days)`,
  }).catch(() => {});

  return inviteUrl;
}

// POST /api/admin/users/:clientId — provision a portal user.
//
// Until this existed there was no INSERT INTO cp_portal_users anywhere in the
// backend: self-registration returns 403 telling people to contact an
// administrator, and the administrator had no way to create the account. Every
// account had to be written straight into MySQL by hand.
router.post('/:clientId', authenticateAdmin, async (req, res) => {
  try {
    const { first_name, last_name, email, user_type, specialty, country } = req.body || {};

    if (!first_name || !last_name || !email) {
      return res.status(400).json({ error: 'first_name, last_name and email are required.' });
    }
    // Mirrors the length ceilings the portal auth routes apply (API-07).
    if (String(email).length > 254 || String(first_name).length > 255 || String(last_name).length > 255) {
      return res.status(400).json({ error: 'Input exceeds maximum length.' });
    }
    if (!String(email).includes('@')) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    const type = user_type || 'other';
    if (!VALID_USER_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Invalid user_type.' });
    }

    const [[client]] = await pool.execute(
      'SELECT id, code FROM cp_clients WHERE id = ? AND is_active = 1',
      [req.params.clientId]
    );
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    const normalisedEmail = String(email).trim().toLowerCase();

    // The password column is NOT NULL, so seed it with a value that cannot match
    // any bcrypt comparison. Until the invite is completed there is no password
    // to guess — sign-in is impossible by construction, not by a flag.
    const unusablePassword = `!invite:${crypto.randomBytes(24).toString('hex')}`;

    let userId;
    try {
      const [info] = await pool.execute(
        `INSERT INTO cp_portal_users
           (client_id, first_name, last_name, email, password, user_type, specialty, country,
            is_active, is_verified, user_type_confirmed, email_verified, token_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, 1, 0)`,
        [client.id, first_name, last_name, normalisedEmail, unusablePassword,
         type, specialty || null, country || null]
      );
      userId = info.insertId;
    } catch (err) {
      // uq_portal_users is UNIQUE(client_id, email).
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'A user with that email already exists for this portal.' });
      }
      throw err;
    }

    await issueInvite({
      userId, clientId: client.id, clientCode: client.code,
      email: normalisedEmail, firstName: first_name,
      origin: req.headers.origin, isResend: false,
    });

    await audit(req.admin, client.id, 'CREATE', 'portal_user', userId, { email: normalisedEmail, user_type: type });

    const [[created]] = await pool.execute(
      `SELECT id, first_name, last_name, email, user_type, specialty, country,
              is_active, is_verified, created_at
         FROM cp_portal_users WHERE id = ?`,
      [userId]
    );
    res.status(201).json({
      message: 'User created. An invitation to set a password has been emailed.',
      user: created,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/admin/users/:clientId/:userId/resend-invite — reissue the set-password
// link. Invalidates any previous one, since a fresh token overwrites the old hash.
router.post('/:clientId/:userId/resend-invite', authenticateAdmin, async (req, res) => {
  try {
    const [[client]] = await pool.execute(
      'SELECT id, code FROM cp_clients WHERE id = ? AND is_active = 1', [req.params.clientId]
    );
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    const [[user]] = await pool.execute(
      'SELECT id, email, first_name FROM cp_portal_users WHERE id = ? AND client_id = ? AND is_active = 1',
      [req.params.userId, client.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found.' });

    await issueInvite({
      userId: user.id, clientId: client.id, clientCode: client.code,
      email: user.email, firstName: user.first_name,
      origin: req.headers.origin, isResend: true,
    });

    await audit(req.admin, client.id, 'UPDATE', 'portal_user', user.id, { action: 'resend_invite' });
    res.json({ message: 'Invitation resent.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.get('/:clientId', authenticateAdmin, async (req, res) => {
  try {
    const { user_type, search } = req.query;
    let query = 'SELECT id, first_name, last_name, email, user_type, specialty, country, is_active, is_verified, last_login_at, created_at FROM cp_portal_users WHERE client_id = ?';
    const params = [req.params.clientId];
    if (user_type) { query += ' AND user_type = ?'; params.push(user_type); }
    if (search) { query += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)'; const s = `%${search}%`; params.push(s, s, s); }
    query += ' ORDER BY created_at DESC';
    const [rows] = await pool.execute(query, params);
    res.json({ users: rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// Bulk activate/deactivate — must be declared BEFORE '/:clientId/:userId' so 'bulk' isn't matched as a userId
router.patch('/:clientId/bulk', authenticateAdmin, async (req, res) => {
  try {
    const { ids, is_active } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array is required.' });
    const cleanIds = ids.map(Number).filter(Number.isInteger);
    if (!cleanIds.length) return res.status(400).json({ error: 'No valid ids provided.' });
    const placeholders = cleanIds.map(() => '?').join(',');
    await pool.execute(
      `UPDATE cp_portal_users SET is_active = ? WHERE client_id = ? AND id IN (${placeholders})`,
      [is_active ? 1 : 0, req.params.clientId, ...cleanIds]
    );
    await audit(req.admin, req.params.clientId, is_active ? 'ENABLE' : 'DISABLE', 'portal_user', null, { count: cleanIds.length });
    res.json({ message: `${cleanIds.length} user(s) ${is_active ? 'activated' : 'deactivated'}.`, count: cleanIds.length });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.patch('/:clientId/:userId', authenticateAdmin, async (req, res) => {
  try {
    const { first_name, last_name, email, user_type, country, is_active, is_verified } = req.body;
    const updates = [], params = [];
    if (first_name  !== undefined) { updates.push('first_name = ?');  params.push(first_name); }
    if (last_name   !== undefined) { updates.push('last_name = ?');   params.push(last_name); }
    if (email       !== undefined) { updates.push('email = ?');       params.push(email); }
    if (user_type   !== undefined && VALID_USER_TYPES.includes(user_type)) {
      updates.push('user_type = ?'); params.push(user_type);
    }
    if (country     !== undefined) { updates.push('country = ?');     params.push(country); }
    if (is_active   !== undefined) { updates.push('is_active = ?');   params.push(is_active ? 1 : 0); }
    if (is_verified !== undefined) {
      // BUGFIX: login gates on `email_verified`, so an admin marking a user verified
      // must clear that gate too — otherwise the user still can't sign in.
      const v = is_verified ? 1 : 0;
      updates.push('is_verified = ?');   params.push(v);
      updates.push('email_verified = ?'); params.push(v);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
    params.push(req.params.userId, req.params.clientId);
    await pool.execute(`UPDATE cp_portal_users SET ${updates.join(', ')} WHERE id=? AND client_id=?`, params);
    await audit(req.admin, req.params.clientId, 'UPDATE', 'portal_user', req.params.userId, { fields: Object.keys(req.body) });
    res.json({ message: 'User updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

router.delete('/:clientId/:userId', authenticateAdmin, async (req, res) => {
  try {
    await pool.execute('UPDATE cp_portal_users SET is_active=0 WHERE id=? AND client_id=?', [req.params.userId, req.params.clientId]);
    await audit(req.admin, req.params.clientId, 'DELETE', 'portal_user', req.params.userId, {});
    res.json({ message: 'User deactivated.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
