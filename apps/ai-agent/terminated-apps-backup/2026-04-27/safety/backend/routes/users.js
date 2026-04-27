const crypto = require('crypto')
const express = require('express')
const bcrypt = require('bcrypt')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const { requireModule, assertOrgAccess } = require('../middleware/rbac')
const { MODULES, ROLES } = require('../constants')
const { logAdminAction } = require('../services/auditService')
const { getConfigMap } = require('../services/configService')
const { sendMail } = require('../services/emailService')
const { revokeAllSessionsForUser } = require('../services/sessionService')
const {
  resolveClientScope,
  requiresClientForCroRole
} = require('../services/tenantScopeService')

const router = express.Router()

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5177'

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex')
}

function isValidRole(value) {
  return Object.values(ROLES).includes(value)
}

router.use(authenticate)
router.use(requireModule(MODULES.USER_MANAGEMENT))

router.get('/', async (req, res) => {
  const requestedOrgId = req.query.orgId ? Number(req.query.orgId) : req.user.orgId
  const requestedClientId = req.query.clientId ? Number(req.query.clientId) : null

  if (!Number.isInteger(Number(requestedOrgId)) || Number(requestedOrgId) <= 0) {
    return res.status(400).json({ error: 'Invalid orgId' })
  }

  if (!assertOrgAccess(req, res, requestedOrgId)) {
    return undefined
  }

  try {
    const params = [requestedOrgId]
    let clientFilterSql = ''

    if (requestedClientId) {
      params.push(requestedClientId)
      clientFilterSql = 'AND u.client_id = ?'
    }

    const [rows] = await pool.execute(
      `SELECT
        u.user_id,
        u.org_id,
        u.client_id,
        u.full_name,
        u.email,
        u.role,
        u.status,
        u.must_reset_password,
        u.first_login_completed,
        u.last_login_at,
        u.created_at,
        c.client_name
       FROM users u
       LEFT JOIN pharma_clients c ON c.client_id = u.client_id
       WHERE u.org_id = ?
       ${clientFilterSql}
       ORDER BY u.created_at DESC`,
      params
    )

    return res.json(rows)
  } catch (error) {
    console.error('List users failed:', error)
    return res.status(500).json({ error: 'Failed to list users' })
  }
})

router.post('/invite', async (req, res) => {
  const {
    orgId,
    clientId,
    fullName,
    email,
    role
  } = req.body

  if (!fullName || !email || !role) {
    return res.status(400).json({ error: 'fullName, email, and role are required' })
  }

  if (!isValidRole(role)) {
    return res.status(400).json({ error: 'Invalid role' })
  }

  if (role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN) {
    return res.status(403).json({ error: 'Only Super Admin can invite Super Admin users' })
  }

  if (req.user.role === ROLES.CRO_ADMIN && role === ROLES.SUPER_ADMIN) {
    return res.status(403).json({ error: 'CRO Admin cannot escalate to Super Admin' })
  }

  const targetOrgId = Number(orgId || req.user.orgId)
  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) {
    return res.status(400).json({ error: 'Invalid org id' })
  }

  if (!assertOrgAccess(req, res, targetOrgId)) {
    return undefined
  }

  try {
    const scope = await resolveClientScope({
      orgId: targetOrgId,
      clientId,
      requireClientForCro: requiresClientForCroRole(role),
      allowInactiveClient: false
    })

    if (scope.error) {
      return res.status(400).json({ error: scope.error })
    }

    const tempHash = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10)

    const [insertResult] = await pool.execute(
      `INSERT INTO users
        (org_id, client_id, full_name, email, password_hash, role, status, must_reset_password, first_login_completed, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'invited', 1, 0, ?)`,
      [
        targetOrgId,
        scope.resolvedClientId,
        String(fullName).trim(),
        String(email).trim().toLowerCase(),
        tempHash,
        role,
        req.user.userId
      ]
    )

    const invitedUserId = insertResult.insertId
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = hashToken(rawToken)

    const [inviteResult] = await pool.execute(
      `INSERT INTO user_invitations
        (org_id, client_id, invited_user_id, email, role, token_hash, expires_at, invited_by)
       VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR), ?)`,
      [
        targetOrgId,
        scope.resolvedClientId,
        invitedUserId,
        String(email).trim().toLowerCase(),
        role,
        tokenHash,
        req.user.userId
      ]
    )

    const [[org]] = await pool.execute(
      'SELECT org_name, org_slug FROM organisations WHERE org_id = ?',
      [targetOrgId]
    )

    const configMap = await getConfigMap(targetOrgId)
    const activationUrl = `${APP_BASE_URL}/activate-invite?token=${rawToken}`

    await sendMail({
      configMap,
      to: String(email).trim().toLowerCase(),
      subject: 'Pharaxis Safety invitation',
      text: `You have been invited to ${org.org_name}. Activate your account within 24 hours: ${activationUrl}`,
      html: `<p>Hello ${String(fullName).trim()},</p><p>You have been invited to ${org.org_name}.</p><p>This activation link expires in 24 hours:</p><p><a href=\"${activationUrl}\">Activate account</a></p>`
    })

    await logAdminAction({
      orgId: targetOrgId,
      actorUserId: req.user.userId,
      actionType: 'user_invited',
      entityType: 'user',
      entityId: String(invitedUserId),
      afterValue: {
        invitationId: inviteResult.insertId,
        fullName: String(fullName).trim(),
        email: String(email).trim().toLowerCase(),
        role,
        clientId: scope.resolvedClientId
      }
    })

    return res.status(201).json({
      user_id: invitedUserId,
      invitation_id: inviteResult.insertId,
      message: 'User invited successfully',
      activationToken: process.env.NODE_ENV === 'production' ? undefined : rawToken,
      activationUrl: process.env.NODE_ENV === 'production' ? undefined : activationUrl,
      expiresInHours: 24
    })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'User with this email already exists in organisation' })
    }
    console.error('Invite user failed:', error)
    return res.status(500).json({ error: 'Failed to invite user' })
  }
})

router.patch('/:userId/status', async (req, res) => {
  const userId = Number(req.params.userId)
  const { status } = req.body

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' })
  }

  if (!['active', 'inactive', 'invited'].includes(status)) {
    return res.status(400).json({ error: 'status must be invited, active, or inactive' })
  }

  try {
    const [[target]] = await pool.execute(
      `SELECT user_id, org_id, full_name, email, role, status
       FROM users
       WHERE user_id = ?`,
      [userId]
    )

    if (!target) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (!assertOrgAccess(req, res, target.org_id)) {
      return undefined
    }

    if (target.status === status) {
      return res.json({ message: 'No change applied', user: target })
    }

    await pool.execute(
      'UPDATE users SET status = ? WHERE user_id = ?',
      [status, userId]
    )

    if (status === 'inactive') {
      await revokeAllSessionsForUser({
        orgId: target.org_id,
        userId,
        actorUserId: req.user.userId,
        reason: 'user_deactivated'
      })
    }

    await logAdminAction({
      orgId: target.org_id,
      actorUserId: req.user.userId,
      actionType: status === 'inactive' ? 'user_deactivated' : 'user_status_changed',
      entityType: 'user',
      entityId: String(userId),
      beforeValue: { status: target.status },
      afterValue: { status }
    })

    return res.json({
      message: `User status updated to ${status}`,
      user: {
        ...target,
        status
      }
    })
  } catch (error) {
    console.error('Update user status failed:', error)
    return res.status(500).json({ error: 'Failed to update user status' })
  }
})

router.patch('/:userId/role', async (req, res) => {
  const userId = Number(req.params.userId)
  const { role } = req.body

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' })
  }

  if (!isValidRole(role)) {
    return res.status(400).json({ error: 'Invalid role' })
  }

  if (role === ROLES.SUPER_ADMIN && req.user.role !== ROLES.SUPER_ADMIN) {
    return res.status(403).json({ error: 'Only Super Admin can assign Super Admin role' })
  }

  try {
    const [[target]] = await pool.execute(
      `SELECT user_id, org_id, role
       FROM users
       WHERE user_id = ?`,
      [userId]
    )

    if (!target) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (!assertOrgAccess(req, res, target.org_id)) {
      return undefined
    }

    if (target.role === role) {
      return res.json({ message: 'No change applied', role })
    }

    await pool.execute(
      'UPDATE users SET role = ? WHERE user_id = ?',
      [role, userId]
    )

    await logAdminAction({
      orgId: target.org_id,
      actorUserId: req.user.userId,
      actionType: 'user_role_changed',
      entityType: 'user',
      entityId: String(userId),
      beforeValue: { role: target.role },
      afterValue: { role }
    })

    return res.json({ message: 'User role updated', userId, role })
  } catch (error) {
    console.error('Update user role failed:', error)
    return res.status(500).json({ error: 'Failed to update user role' })
  }
})

router.patch('/:userId/assignment', async (req, res) => {
  const userId = Number(req.params.userId)
  const { clientId } = req.body

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' })
  }

  let resolvedClientId = null
  if (clientId !== null && clientId !== undefined && clientId !== '') {
    const numericClientId = Number(clientId)
    if (!Number.isInteger(numericClientId) || numericClientId <= 0) {
      return res.status(400).json({ error: 'Invalid client id' })
    }
    resolvedClientId = numericClientId
  }

  try {
    const [[target]] = await pool.execute(
      `SELECT user_id, org_id, client_id, role
       FROM users
       WHERE user_id = ?`,
      [userId]
    )

    if (!target) {
      return res.status(404).json({ error: 'User not found' })
    }

    if (!assertOrgAccess(req, res, target.org_id)) {
      return undefined
    }

    const scope = await resolveClientScope({
      orgId: target.org_id,
      clientId: resolvedClientId,
      requireClientForCro: requiresClientForCroRole(target.role),
      allowInactiveClient: false
    })

    if (scope.error) {
      return res.status(400).json({ error: scope.error })
    }

    await pool.execute(
      'UPDATE users SET client_id = ? WHERE user_id = ?',
      [scope.resolvedClientId, userId]
    )

    await logAdminAction({
      orgId: target.org_id,
      actorUserId: req.user.userId,
      actionType: 'user_assignment_changed',
      entityType: 'user',
      entityId: String(userId),
      beforeValue: { clientId: target.client_id },
      afterValue: { clientId: scope.resolvedClientId }
    })

    return res.json({
      message: 'User client assignment updated',
      userId,
      clientId: scope.resolvedClientId
    })
  } catch (error) {
    console.error('Update user assignment failed:', error)
    return res.status(500).json({ error: 'Failed to update user assignment' })
  }
})

module.exports = router
