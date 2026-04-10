const crypto = require('crypto')
const express = require('express')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const { MODULE_PERMISSIONS } = require('../constants')
const { logAdminAction } = require('../services/auditService')
const { getConfigMap } = require('../services/configService')
const { sendMail } = require('../services/emailService')
const {
  validatePasswordStrength,
  ensurePasswordNotReused,
  recordPasswordHistory
} = require('../services/passwordService')
const {
  getSessionPolicy,
  countActiveSessions,
  createSession,
  closeSessionByJti,
  revokeAllSessionsForUser
} = require('../services/sessionService')

const router = express.Router()

const JWT_SECRET = process.env.JWT_SECRET || 'dev_safety_jwt_change_me'
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5177'

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

function buildModuleAccess(role) {
  return Object.entries(MODULE_PERMISSIONS)
    .filter(([, roles]) => roles.includes(role))
    .map(([moduleName]) => moduleName)
}

async function issueAccessToken(user, req) {
  const policy = await getSessionPolicy(user.org_id)
  const activeSessions = await countActiveSessions(user.org_id, user.user_id)

  if (activeSessions >= policy.maxConcurrentSessions) {
    return {
      error: `Maximum concurrent sessions reached (${policy.maxConcurrentSessions}). Revoke an active session and retry.`
    }
  }

  const jti = crypto.randomUUID()
  const token = jwt.sign(
    {
      userId: user.user_id,
      orgId: user.org_id,
      clientId: user.client_id,
      role: user.role,
      jti
    },
    JWT_SECRET,
    { expiresIn: `${policy.timeoutMinutes}m` }
  )

  await createSession({
    orgId: user.org_id,
    userId: user.user_id,
    jti,
    timeoutMinutes: policy.timeoutMinutes,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] || null
  })

  await pool.execute(
    'UPDATE users SET last_login_at = NOW() WHERE user_id = ?',
    [user.user_id]
  )

  return {
    token,
    timeoutMinutes: policy.timeoutMinutes,
    maxConcurrentSessions: policy.maxConcurrentSessions
  }
}

router.post('/login', async (req, res) => {
  const { email, password, orgSlug } = req.body

  if (!email || !password || !orgSlug) {
    return res.status(400).json({ error: 'email, password, and orgSlug are required' })
  }

  try {
    const [[org]] = await pool.execute(
      `SELECT org_id, org_name, org_type, status
       FROM organisations
       WHERE org_slug = ?`,
      [orgSlug]
    )

    if (!org || org.status !== 'active') {
      return res.status(401).json({ error: 'Organisation not found or inactive' })
    }

    const [[user]] = await pool.execute(
      `SELECT user_id, org_id, client_id, full_name, email, password_hash, role, status, must_reset_password
       FROM users
       WHERE org_id = ? AND email = ?`,
      [org.org_id, String(email).trim().toLowerCase()]
    )

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    if (user.status === 'invited') {
      return res.status(403).json({ error: 'User invitation pending activation' })
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'User is inactive' })
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash)
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    if (user.must_reset_password) {
      const rawToken = crypto.randomBytes(32).toString('hex')
      await pool.execute(
        `INSERT INTO password_reset_tokens
          (org_id, user_id, token_hash, token_type, expires_at)
         VALUES (?, ?, ?, 'first_login', DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
        [user.org_id, user.user_id, hashToken(rawToken)]
      )

      return res.json({
        requiresPasswordReset: true,
        firstLoginToken: rawToken,
        message: 'First login password reset required'
      })
    }

    const issued = await issueAccessToken(user, req)
    if (issued.error) {
      return res.status(409).json({ error: issued.error })
    }

    return res.json({
      token: issued.token,
      sessionTimeoutMinutes: issued.timeoutMinutes,
      user: {
        userId: user.user_id,
        orgId: user.org_id,
        clientId: user.client_id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        modules: buildModuleAccess(user.role)
      }
    })
  } catch (error) {
    console.error('Login failed:', error)
    return res.status(500).json({ error: 'Login failed' })
  }
})

router.post('/forgot-password', async (req, res) => {
  const { email, orgSlug } = req.body

  if (!email || !orgSlug) {
    return res.status(400).json({ error: 'email and orgSlug are required' })
  }

  try {
    const [[org]] = await pool.execute(
      'SELECT org_id, org_slug FROM organisations WHERE org_slug = ? AND status = \'active\'',
      [orgSlug]
    )

    if (!org) {
      return res.json({ message: 'If the user exists, a reset link has been sent.' })
    }

    const [[user]] = await pool.execute(
      `SELECT user_id, org_id, full_name, email, status, password_hash
       FROM users
       WHERE org_id = ? AND email = ?`,
      [org.org_id, String(email).trim().toLowerCase()]
    )

    if (!user || user.status !== 'active') {
      return res.json({ message: 'If the user exists, a reset link has been sent.' })
    }

    const rawToken = crypto.randomBytes(32).toString('hex')

    await pool.execute(
      `INSERT INTO password_reset_tokens
        (org_id, user_id, token_hash, token_type, expires_at)
       VALUES (?, ?, ?, 'forgot', DATE_ADD(NOW(), INTERVAL 24 HOUR))`,
      [org.org_id, user.user_id, hashToken(rawToken)]
    )

    const configMap = await getConfigMap(org.org_id)
    const resetUrl = `${APP_BASE_URL}/reset-password?token=${rawToken}`

    await sendMail({
      configMap,
      to: user.email,
      subject: 'Pharaxis Safety password reset',
      text: `Use this link to reset your password. Link expires in 24 hours. ${resetUrl}`,
      html: `<p>Hello ${user.full_name},</p><p>Use this link to reset your password (expires in 24 hours):</p><p><a href=\"${resetUrl}\">Reset password</a></p>`
    })

    return res.json({
      message: 'If the user exists, a reset link has been sent.',
      resetToken: process.env.NODE_ENV === 'production' ? undefined : rawToken
    })
  } catch (error) {
    console.error('Forgot password failed:', error)
    return res.status(500).json({ error: 'Could not process forgot password request' })
  }
})

router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'token and newPassword are required' })
  }

  const passwordError = validatePasswordStrength(newPassword)
  if (passwordError) {
    return res.status(400).json({ error: passwordError })
  }

  try {
    const [[resetRecord]] = await pool.execute(
      `SELECT prt.token_id, prt.org_id, prt.user_id, prt.token_type, prt.expires_at, prt.consumed_at,
              u.password_hash, u.status
       FROM password_reset_tokens prt
       INNER JOIN users u ON u.user_id = prt.user_id
       WHERE prt.token_hash = ? AND prt.token_type = 'forgot'`,
      [hashToken(token)]
    )

    if (!resetRecord || resetRecord.consumed_at || new Date(resetRecord.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Reset token is invalid or expired' })
    }

    if (resetRecord.status !== 'active') {
      return res.status(403).json({ error: 'User is inactive' })
    }

    const isAllowed = await ensurePasswordNotReused(
      resetRecord.org_id,
      resetRecord.user_id,
      newPassword,
      resetRecord.password_hash
    )

    if (!isAllowed) {
      return res.status(400).json({ error: 'Password reuse is not allowed' })
    }

    const nextHash = await bcrypt.hash(newPassword, 10)

    await pool.execute(
      `UPDATE users
       SET password_hash = ?, must_reset_password = 0, first_login_completed = 1
       WHERE user_id = ?`,
      [nextHash, resetRecord.user_id]
    )

    await recordPasswordHistory(resetRecord.org_id, resetRecord.user_id, nextHash)

    await pool.execute(
      'UPDATE password_reset_tokens SET consumed_at = NOW() WHERE token_id = ?',
      [resetRecord.token_id]
    )

    await revokeAllSessionsForUser({
      orgId: resetRecord.org_id,
      userId: resetRecord.user_id,
      actorUserId: resetRecord.user_id,
      reason: 'password_reset'
    })

    return res.json({ message: 'Password reset successful. Please login again.' })
  } catch (error) {
    console.error('Reset password failed:', error)
    return res.status(500).json({ error: 'Password reset failed' })
  }
})

router.post('/activate-invite', async (req, res) => {
  const { token, password } = req.body

  if (!token || !password) {
    return res.status(400).json({ error: 'token and password are required' })
  }

  const passwordError = validatePasswordStrength(password)
  if (passwordError) {
    return res.status(400).json({ error: passwordError })
  }

  try {
    const [[invite]] = await pool.execute(
      `SELECT
        i.invitation_id,
        i.org_id,
        i.invited_user_id,
        i.status,
        i.expires_at,
        u.password_hash,
        u.status AS user_status
      FROM user_invitations i
      INNER JOIN users u ON u.user_id = i.invited_user_id
      WHERE i.token_hash = ?`,
      [hashToken(token)]
    )

    if (!invite || invite.status !== 'pending' || new Date(invite.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Invitation token is invalid or expired' })
    }

    const reuseAllowed = await ensurePasswordNotReused(
      invite.org_id,
      invite.invited_user_id,
      password,
      invite.password_hash
    )

    if (!reuseAllowed) {
      return res.status(400).json({ error: 'Choose a password you have not used before' })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    await pool.execute(
      `UPDATE users
       SET password_hash = ?, status = 'active', must_reset_password = 0, first_login_completed = 1
       WHERE user_id = ?`,
      [passwordHash, invite.invited_user_id]
    )

    await recordPasswordHistory(invite.org_id, invite.invited_user_id, passwordHash)

    await pool.execute(
      `UPDATE user_invitations
       SET status = 'accepted', accepted_at = NOW()
       WHERE invitation_id = ?`,
      [invite.invitation_id]
    )

    await logAdminAction({
      orgId: invite.org_id,
      actorUserId: invite.invited_user_id,
      actionType: 'invite_activation_completed',
      entityType: 'user',
      entityId: String(invite.invited_user_id),
      metadata: { flow: 'invite_activation_final_password' }
    })

    return res.json({
      message: 'Invitation activated. Password setup complete. You can login now.'
    })
  } catch (error) {
    console.error('Activate invite failed:', error)
    return res.status(500).json({ error: 'Invite activation failed' })
  }
})

router.post('/first-login-reset', async (req, res) => {
  const { token, newPassword } = req.body

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'token and newPassword are required' })
  }

  const passwordError = validatePasswordStrength(newPassword)
  if (passwordError) {
    return res.status(400).json({ error: passwordError })
  }

  try {
    const [[resetRecord]] = await pool.execute(
      `SELECT
        prt.token_id,
        prt.org_id,
        prt.user_id,
        prt.expires_at,
        prt.consumed_at,
        u.password_hash,
        u.status,
        u.role,
        u.client_id,
        u.full_name,
        u.email
       FROM password_reset_tokens prt
       INNER JOIN users u ON u.user_id = prt.user_id
       WHERE prt.token_hash = ? AND prt.token_type = 'first_login'`,
      [hashToken(token)]
    )

    if (!resetRecord || resetRecord.consumed_at || new Date(resetRecord.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'First login token is invalid or expired' })
    }

    if (resetRecord.status !== 'active') {
      return res.status(403).json({ error: 'User is inactive' })
    }

    const isAllowed = await ensurePasswordNotReused(
      resetRecord.org_id,
      resetRecord.user_id,
      newPassword,
      resetRecord.password_hash
    )

    if (!isAllowed) {
      return res.status(400).json({ error: 'Password reuse is not allowed' })
    }

    const nextHash = await bcrypt.hash(newPassword, 10)

    await pool.execute(
      `UPDATE users
       SET password_hash = ?, must_reset_password = 0, first_login_completed = 1
       WHERE user_id = ?`,
      [nextHash, resetRecord.user_id]
    )

    await recordPasswordHistory(resetRecord.org_id, resetRecord.user_id, nextHash)

    await pool.execute(
      'UPDATE password_reset_tokens SET consumed_at = NOW() WHERE token_id = ?',
      [resetRecord.token_id]
    )

    await logAdminAction({
      orgId: resetRecord.org_id,
      actorUserId: resetRecord.user_id,
      actionType: 'first_login_password_reset_completed',
      entityType: 'user',
      entityId: String(resetRecord.user_id),
      metadata: { flow: 'first_login' }
    })

    const issued = await issueAccessToken(resetRecord, req)
    if (issued.error) {
      return res.status(409).json({ error: issued.error })
    }

    return res.json({
      message: 'First-login reset completed',
      token: issued.token,
      sessionTimeoutMinutes: issued.timeoutMinutes,
      user: {
        userId: resetRecord.user_id,
        orgId: resetRecord.org_id,
        clientId: resetRecord.client_id,
        fullName: resetRecord.full_name,
        email: resetRecord.email,
        role: resetRecord.role,
        modules: buildModuleAccess(resetRecord.role)
      }
    })
  } catch (error) {
    console.error('First-login reset failed:', error)
    return res.status(500).json({ error: 'First-login reset failed' })
  }
})

router.post('/logout', authenticate, async (req, res) => {
  try {
    await closeSessionByJti({
      jti: req.user.jti,
      actorUserId: req.user.userId,
      reason: 'user_logout',
      eventType: 'logout'
    })

    return res.json({ message: 'Logged out successfully' })
  } catch (error) {
    console.error('Logout failed:', error)
    return res.status(500).json({ error: 'Logout failed' })
  }
})

router.get('/me', authenticate, async (req, res) => {
  return res.json({
    userId: req.user.userId,
    orgId: req.user.orgId,
    clientId: req.user.clientId,
    fullName: req.user.fullName,
    email: req.user.email,
    role: req.user.role,
    orgName: req.user.orgName,
    orgType: req.user.orgType,
    modules: buildModuleAccess(req.user.role)
  })
})

module.exports = router
