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

// POST /api/admin/users/:clientId/bulk-create — create many portal users at once.
// PAUD-4 item 2. Declared before '/:clientId/:userId/...' so 'bulk-create' is not
// matched as a userId.
//
// Users are inserted in one transaction and committed before any invite is sent.
// Invites are emails: they cannot be rolled back, so sending them inside the
// transaction would mean a failed batch had already mailed real people. Accounts
// first, then invites, with any invite failure reported rather than swallowed.
router.post('/:clientId/bulk-create', authenticateAdmin, async (req, res) => {
  const rows = Array.isArray(req.body?.users) ? req.body.users : [];
  if (!rows.length) return res.status(400).json({ error: 'No users supplied.' });
  if (rows.length > 500) return res.status(400).json({ error: 'A batch may contain at most 500 users.' });

  const errors = [];
  const seen = new Set();
  const normalised = [];

  rows.forEach((raw, index) => {
    const rowNumber = index + 1;
    const { first_name, last_name, email, user_type, specialty, country } = raw || {};
    if (!first_name || !last_name || !email) {
      errors.push({ row: rowNumber, reason: 'first_name, last_name and email are required.' });
      return;
    }
    if (String(email).length > 254 || String(first_name).length > 255 || String(last_name).length > 255) {
      errors.push({ row: rowNumber, reason: 'Input exceeds maximum length.' });
      return;
    }
    if (!String(email).includes('@')) {
      errors.push({ row: rowNumber, reason: 'Enter a valid email address.' });
      return;
    }
    const type = user_type || 'other';
    if (!VALID_USER_TYPES.includes(type)) {
      errors.push({ row: rowNumber, reason: `Invalid user_type: ${type}.` });
      return;
    }
    const normalisedEmail = String(email).trim().toLowerCase();
    if (seen.has(normalisedEmail)) {
      errors.push({ row: rowNumber, reason: `Duplicate email within the batch: ${normalisedEmail}.` });
      return;
    }
    seen.add(normalisedEmail);
    normalised.push({ row: rowNumber, first_name, last_name, email: normalisedEmail, type, specialty: specialty || null, country: country || null });
  });

  if (errors.length) {
    return res.status(400).json({ error: 'Batch rejected. No users were created.', errors });
  }

  const conn = await pool.getConnection();
  try {
    const [[client]] = await conn.execute(
      'SELECT id, code FROM cp_clients WHERE id = ? AND is_active = 1',
      [req.params.clientId]
    );
    if (!client) {
      conn.release();
      return res.status(404).json({ error: 'Client not found.' });
    }

    await conn.beginTransaction();
    const created = [];
    for (const row of normalised) {
      const unusablePassword = `!invite:${crypto.randomBytes(24).toString('hex')}`;
      try {
        const [info] = await conn.execute(
          `INSERT INTO cp_portal_users
             (client_id, first_name, last_name, email, password, user_type, specialty, country,
              is_active, is_verified, user_type_confirmed, email_verified, token_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, 1, 0)`,
          [client.id, row.first_name, row.last_name, row.email, unusablePassword,
           row.type, row.specialty, row.country]
        );
        created.push({ id: info.insertId, email: row.email, first_name: row.first_name, row: row.row });
      } catch (err) {
        await conn.rollback();
        conn.release();
        if (err && err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({
            error: 'Batch rejected. No users were created.',
            errors: [{ row: row.row, reason: `A user with that email already exists for this portal: ${row.email}.` }],
          });
        }
        throw err;
      }
    }
    await conn.commit();
    conn.release();

    for (const user of created) {
      await audit(req.admin, client.id, 'CREATE', 'portal_user', user.id, { email: user.email, user_type: 'bulk' });
    }

    // Invites go out after the accounts are durable. A failure here leaves a real
    // account that simply has no invite yet — recoverable with resend-invite —
    // rather than an email sent for an account that was rolled back.
    const inviteFailures = [];
    for (const user of created) {
      try {
        await issueInvite({
          userId: user.id, clientId: client.id, clientCode: client.code,
          email: user.email, firstName: user.first_name,
          origin: req.headers.origin, isResend: false,
        });
      } catch (err) {
        inviteFailures.push({ row: user.row, email: user.email, reason: 'Invitation email failed to send. Use resend-invite.' });
      }
    }

    res.status(201).json({
      message: inviteFailures.length
        ? `${created.length} user(s) created. ${inviteFailures.length} invitation(s) failed to send.`
        : `${created.length} user(s) created. Invitations to set a password have been emailed.`,
      created: created.length,
      users: created.map(({ id, email }) => ({ id, email })),
      invite_failures: inviteFailures,
    });
  } catch (err) {
    try { await conn.rollback(); } catch (_) { /* connection may already be released */ }
    try { conn.release(); } catch (_) { /* already released */ }
    console.error('POST /:clientId/bulk-create error:', err);
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
