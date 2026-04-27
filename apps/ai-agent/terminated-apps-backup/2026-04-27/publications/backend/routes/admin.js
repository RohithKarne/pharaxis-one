const express = require('express')
const bcrypt = require('bcrypt')
const { query, withTransaction } = require('../database/db')
const { requireAuth } = require('../middleware/auth')
const { authorizeRoles } = require('../middleware/authorize')
const { asyncHandler } = require('../utils/asyncHandler')
const { resolveTenantIdForRequest } = require('../utils/tenant')
const { writeAudit } = require('../utils/audit')
const { generatePlainToken, sha256 } = require('../utils/security')
const { sendUserNotification, sendEmailDirect } = require('../services/notificationService')
const { ROLES, NOTIFICATION_EVENTS, DEFAULT_GPP_ITEMS, DEFAULT_REQUIRED_GPP_ITEM_KEYS } = require('../utils/constants')
const { runOverdueMilestoneScan } = require('../services/milestoneNotifierService')

const router = express.Router()

const allowedRoles = Object.values(ROLES)
const orgAssignableRoles = [ROLES.PUBLICATIONS_MANAGER, ROLES.MEDICAL_WRITER, ROLES.REVIEWER]
const superAssignableRoles = [ROLES.ORG_ADMIN, ...orgAssignableRoles]
const gppItemKeyPattern = /^gpp_\d{1,3}$/

function buildFallbackGppDefaults() {
  return DEFAULT_GPP_ITEMS.map((itemText, index) => {
    const itemKey = `gpp_${index + 1}`
    return {
      itemKey,
      itemText,
      isRequired: DEFAULT_REQUIRED_GPP_ITEM_KEYS.includes(itemKey)
    }
  })
}

async function getTenantUserOrThrow(req, userId) {
  const rows = await query(
    `
      SELECT id, tenant_id AS tenantId, email, full_name AS fullName, role, is_active AS isActive
      FROM pub_users
      WHERE id = ?
      LIMIT 1
    `,
    [userId]
  )

  const user = rows[0]
  if (!user) {
    const error = new Error('User not found')
    error.statusCode = 404
    throw error
  }

  if (!req.user.isSuperadmin && Number(user.tenantId) !== Number(req.user.tenantId)) {
    const error = new Error('User not found')
    error.statusCode = 404
    throw error
  }

  return user
}

router.get(
  '/tenants',
  requireAuth,
  authorizeRoles([ROLES.SUPER_ADMIN]),
  asyncHandler(async (_req, res) => {
    const rows = await query(
      `
        SELECT id, name, slug, status, created_at AS createdAt, updated_at AS updatedAt
        FROM pub_tenants
        ORDER BY created_at DESC
      `
    )
    res.json({ tenants: rows })
  })
)

router.post(
  '/tenants',
  requireAuth,
  authorizeRoles([ROLES.SUPER_ADMIN]),
  asyncHandler(async (req, res) => {
    const name = String(req.body?.name || '').trim()
    const providedSlug = String(req.body?.slug || '').trim().toLowerCase()
    const slug = providedSlug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

    if (!name || !slug) {
      return res.status(400).json({ error: 'name and valid slug are required' })
    }

    const result = await query(
      `INSERT INTO pub_tenants (name, slug, status) VALUES (?, ?, 'active')`,
      [name, slug]
    )

    await writeAudit({
      tenantId: null,
      actorUserId: req.user.id,
      actionType: 'tenant.created',
      entityType: 'tenant',
      entityId: result.insertId,
      metadata: { name, slug }
    })

    res.status(201).json({
      tenant: {
        id: result.insertId,
        name,
        slug,
        status: 'active'
      }
    })
  })
)

router.get(
  '/gpp/defaults',
  requireAuth,
  authorizeRoles([ROLES.ORG_ADMIN]),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantIdForRequest(req, req.query.tenantId)

    const rows = await query(
      `
        SELECT
          item_key AS itemKey,
          item_text AS itemText,
          is_required AS isRequired
        FROM pub_tenant_gpp_defaults
        WHERE tenant_id = ?
        ORDER BY CAST(SUBSTRING_INDEX(item_key, '_', -1) AS UNSIGNED) ASC
      `,
      [tenantId]
    )

    if (!rows.length) {
      return res.json({
        tenantId,
        source: 'fallback',
        items: buildFallbackGppDefaults()
      })
    }

    return res.json({
      tenantId,
      source: 'tenant_config',
      items: rows.map((row) => ({
        itemKey: row.itemKey,
        itemText: row.itemText,
        isRequired: Boolean(Number(row.isRequired))
      }))
    })
  })
)

router.put(
  '/gpp/defaults',
  requireAuth,
  authorizeRoles([ROLES.ORG_ADMIN]),
  asyncHandler(async (req, res) => {
    const tenantId = resolveTenantIdForRequest(req, req.body?.tenantId)
    const items = Array.isArray(req.body?.items) ? req.body.items : []

    if (!items.length) {
      return res.status(400).json({ error: 'items array is required' })
    }

    const normalized = items.map((item) => ({
      itemKey: String(item?.itemKey || '').trim(),
      itemText: String(item?.itemText || '').trim(),
      isRequired: Boolean(item?.isRequired)
    }))

    const seenKeys = new Set()
    for (const item of normalized) {
      if (!gppItemKeyPattern.test(item.itemKey)) {
        return res.status(400).json({ error: `Invalid itemKey: ${item.itemKey}` })
      }
      if (!item.itemText) {
        return res.status(400).json({ error: `itemText is required for ${item.itemKey}` })
      }
      if (seenKeys.has(item.itemKey)) {
        return res.status(400).json({ error: `Duplicate itemKey: ${item.itemKey}` })
      }
      seenKeys.add(item.itemKey)
    }

    await withTransaction(async (tx) => {
      await tx.query(
        `DELETE FROM pub_tenant_gpp_defaults WHERE tenant_id = ?`,
        [tenantId]
      )

      for (const item of normalized) {
        await tx.query(
          `
            INSERT INTO pub_tenant_gpp_defaults
            (tenant_id, item_key, item_text, is_required)
            VALUES (?, ?, ?, ?)
          `,
          [tenantId, item.itemKey, item.itemText, item.isRequired ? 1 : 0]
        )
      }
    })

    await writeAudit({
      tenantId,
      actorUserId: req.user.id,
      actionType: 'gpp.defaults_updated',
      entityType: 'tenant',
      entityId: tenantId,
      metadata: { itemCount: normalized.length }
    })

    res.json({
      tenantId,
      source: 'tenant_config',
      items: normalized
    })
  })
)

router.get(
  '/users',
  requireAuth,
  authorizeRoles([ROLES.ORG_ADMIN]),
  asyncHandler(async (req, res) => {
    let tenantId = req.user.tenantId

    if (req.user.isSuperadmin && req.query.tenantId) {
      tenantId = Number(req.query.tenantId)
    }

    if (!req.user.isSuperadmin && !tenantId) {
      return res.status(400).json({ error: 'Tenant context is required' })
    }

    const params = []
    let where = ''
    if (tenantId) {
      where = 'WHERE u.tenant_id = ?'
      params.push(tenantId)
    }

    const rows = await query(
      `
        SELECT
          u.id,
          u.tenant_id AS tenantId,
          u.email,
          u.full_name AS fullName,
          u.role,
          u.is_active AS isActive,
          u.is_superadmin AS isSuperadmin,
          u.created_at AS createdAt,
          t.name AS tenantName
        FROM pub_users u
        LEFT JOIN pub_tenants t ON t.id = u.tenant_id
        ${where}
        ORDER BY u.created_at DESC
      `,
      params
    )

    res.json({ users: rows })
  })
)

router.post(
  '/users',
  requireAuth,
  authorizeRoles([ROLES.ORG_ADMIN]),
  asyncHandler(async (req, res) => {
    const fullName = String(req.body?.fullName || '').trim()
    const email = String(req.body?.email || '').trim().toLowerCase()
    const role = String(req.body?.role || '').trim()
    const password = String(req.body?.password || 'Temp@12345')

    if (!fullName || !email || !role) {
      return res.status(400).json({ error: 'fullName, email, and role are required' })
    }

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' })
    }

    if (req.user.isSuperadmin && !superAssignableRoles.includes(role)) {
      return res.status(403).json({ error: 'Super admin can only create org_admin, publications_manager, medical_writer, or reviewer users' })
    }

    if (!req.user.isSuperadmin && !orgAssignableRoles.includes(role)) {
      return res.status(403).json({ error: 'Org admin can only create publications_manager, medical_writer, or reviewer users' })
    }

    const tenantId = resolveTenantIdForRequest(req, req.body?.tenantId)

    const tenantRows = await query(`SELECT id FROM pub_tenants WHERE id = ? LIMIT 1`, [tenantId])
    if (!tenantRows[0]) {
      return res.status(404).json({ error: 'Tenant not found' })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    let result
    try {
      result = await query(
        `
          INSERT INTO pub_users (tenant_id, email, full_name, password_hash, role, is_superadmin, is_active, invited_by)
          VALUES (?, ?, ?, ?, ?, 0, 1, ?)
        `,
        [tenantId, email, fullName, passwordHash, role, req.user.id]
      )
    } catch (error) {
      if (error && error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'A user with this email already exists' })
      }
      throw error
    }

    await writeAudit({
      tenantId,
      actorUserId: req.user.id,
      actionType: 'user.created',
      entityType: 'user',
      entityId: result.insertId,
      metadata: { email, role }
    })

    res.status(201).json({
      user: {
        id: result.insertId,
        tenantId,
        fullName,
        email,
        role,
        isSuperadmin: false,
        isActive: true
      }
    })
  })
)

router.post(
  '/users/invite',
  requireAuth,
  authorizeRoles([ROLES.ORG_ADMIN]),
  asyncHandler(async (req, res) => {
    const fullName = String(req.body?.fullName || '').trim() || null
    const email = String(req.body?.email || '').trim().toLowerCase()
    const role = String(req.body?.role || '').trim()

    if (!email || !role) {
      return res.status(400).json({ error: 'email and role are required' })
    }

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' })
    }

    if (req.user.isSuperadmin && !superAssignableRoles.includes(role)) {
      return res.status(403).json({ error: 'Super admin can only invite org_admin, publications_manager, medical_writer, or reviewer users' })
    }

    if (!req.user.isSuperadmin && !orgAssignableRoles.includes(role)) {
      return res.status(403).json({ error: 'Org admin can only invite publications_manager, medical_writer, or reviewer users' })
    }

    const tenantId = resolveTenantIdForRequest(req, req.body?.tenantId)

    const token = generatePlainToken(24)
    const tokenHash = sha256(token)
    const expiresHours = Number(process.env.INVITE_TOKEN_HOURS || 72)
    const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000)

    const insert = await query(
      `
        INSERT INTO pub_user_invites
        (tenant_id, email, full_name, role, invite_token_hash, expires_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [tenantId, email, fullName, role, tokenHash, expiresAt, req.user.id]
    )

    await writeAudit({
      tenantId,
      actorUserId: req.user.id,
      actionType: 'user.invited',
      entityType: 'invite',
      entityId: insert.insertId,
      metadata: { email, role }
    })

    const inviteLink = `${process.env.PUBLICATIONS_APP_BASE_URL || 'http://127.0.0.1:5179'}/invite?token=${token}`

    const recipientRows = await query(`SELECT id FROM pub_users WHERE email = ? LIMIT 1`, [email])
    if (recipientRows[0]) {
      await sendUserNotification({
        tenantId,
        recipientUserId: recipientRows[0].id,
        eventKey: NOTIFICATION_EVENTS.USER_INVITED,
        title: 'Publications app invite',
        body: `You have been invited to Publications as ${role}. Use this link to accept: ${inviteLink}`,
        context: { inviteLink, role, tenantId }
      })
    } else {
      await sendEmailDirect({
        toEmail: email,
        title: 'Publications app invite',
        body: `You have been invited to Publications as ${role}. Use this link to accept: ${inviteLink}`,
        context: { inviteLink, role, tenantId }
      })
    }

    res.status(201).json({
      invite: {
        id: insert.insertId,
        email,
        role,
        tenantId,
        expiresAt: expiresAt.toISOString(),
        inviteLink,
        inviteToken: token
      }
    })
  })
)

router.post(
  '/invites/accept',
  asyncHandler(async (req, res) => {
    const token = String(req.body?.token || '').trim()
    const fullNameInput = String(req.body?.fullName || '').trim()
    const password = String(req.body?.password || '')

    if (!token || !password) {
      return res.status(400).json({ error: 'token and password are required' })
    }

    const tokenHash = sha256(token)
    const inviteRows = await query(
      `
        SELECT
          id,
          tenant_id AS tenantId,
          email,
          full_name AS fullName,
          role,
          expires_at AS expiresAt,
          accepted_at AS acceptedAt
        FROM pub_user_invites
        WHERE invite_token_hash = ?
        ORDER BY id DESC
        LIMIT 1
      `,
      [tokenHash]
    )

    const invite = inviteRows[0]
    if (!invite) {
      return res.status(400).json({ error: 'Invalid invite token' })
    }

    if (invite.acceptedAt) {
      return res.status(400).json({ error: 'Invite already used' })
    }

    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Invite has expired' })
    }

    const fullName = fullNameInput || invite.fullName || invite.email.split('@')[0]
    const passwordHash = await bcrypt.hash(password, 10)

    const createdUser = await withTransaction(async (tx) => {
      const existingUsers = await tx.query(
        `SELECT id FROM pub_users WHERE email = ? LIMIT 1`,
        [invite.email]
      )

      let userId
      if (existingUsers[0]) {
        userId = existingUsers[0].id
        await tx.query(
          `
            UPDATE pub_users
            SET tenant_id = ?, full_name = ?, password_hash = ?, role = ?, is_active = 1, is_superadmin = 0
            WHERE id = ?
          `,
          [invite.tenantId, fullName, passwordHash, invite.role, userId]
        )
      } else {
        const insertUser = await tx.query(
          `
            INSERT INTO pub_users (tenant_id, email, full_name, password_hash, role, is_superadmin, is_active)
            VALUES (?, ?, ?, ?, ?, 0, 1)
          `,
          [invite.tenantId, invite.email, fullName, passwordHash, invite.role]
        )
        userId = insertUser.insertId
      }

      await tx.query(
        `UPDATE pub_user_invites SET accepted_at = CURRENT_TIMESTAMP(6) WHERE id = ?`,
        [invite.id]
      )

      await tx.query(
        `
          INSERT INTO pub_audit_log
          (tenant_id, actor_user_id, action_type, entity_type, entity_id, metadata)
          VALUES (?, ?, 'user.invite_accepted', 'user', ?, ?)
        `,
        [invite.tenantId, userId, String(userId), JSON.stringify({ inviteId: invite.id, role: invite.role })]
      )

      return userId
    })

    res.json({
      user: {
        id: createdUser,
        tenantId: invite.tenantId,
        email: invite.email,
        fullName,
        role: invite.role
      }
    })
  })
)

router.post(
  '/users/:id/status',
  requireAuth,
  authorizeRoles([ROLES.ORG_ADMIN]),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.id)
    const isActive = Boolean(req.body?.isActive)

    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: 'Invalid user id' })
    }

    const target = await getTenantUserOrThrow(req, userId)

    if (target.role === ROLES.SUPER_ADMIN && !req.user.isSuperadmin) {
      return res.status(403).json({ error: 'Only super admin can modify super admin accounts' })
    }

    await query(
      `UPDATE pub_users SET is_active = ? WHERE id = ?`,
      [isActive ? 1 : 0, userId]
    )

    await writeAudit({
      tenantId: target.tenantId,
      actorUserId: req.user.id,
      actionType: 'user.status_changed',
      entityType: 'user',
      entityId: userId,
      metadata: { isActive }
    })

    res.json({ userId, isActive })
  })
)

router.post(
  '/users/:id/reset-password',
  requireAuth,
  authorizeRoles([ROLES.ORG_ADMIN]),
  asyncHandler(async (req, res) => {
    const userId = Number(req.params.id)
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: 'Invalid user id' })
    }

    const target = await getTenantUserOrThrow(req, userId)

    const token = generatePlainToken(24)
    const tokenHash = sha256(token)
    const expiresHours = Number(process.env.RESET_TOKEN_HOURS || 2)
    const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000)

    await query(
      `
        INSERT INTO pub_password_reset_tokens
        (user_id, token_hash, expires_at)
        VALUES (?, ?, ?)
      `,
      [userId, tokenHash, expiresAt]
    )

    await writeAudit({
      tenantId: target.tenantId,
      actorUserId: req.user.id,
      actionType: 'user.reset_requested',
      entityType: 'user',
      entityId: userId,
      metadata: { email: target.email }
    })

    const resetLink = `${process.env.PUBLICATIONS_APP_BASE_URL || 'http://127.0.0.1:5179'}/reset-password?token=${token}`

    await sendUserNotification({
      tenantId: target.tenantId,
      recipientUserId: userId,
      eventKey: NOTIFICATION_EVENTS.RESET_REQUESTED,
      title: 'Password reset requested',
      body: `A password reset was requested for your account. Use this link before expiry: ${resetLink}`,
      context: { resetLink }
    })

    res.json({
      userId,
      expiresAt: expiresAt.toISOString(),
      resetLink,
      resetToken: token
    })
  })
)

router.post(
  '/reset-password/confirm',
  asyncHandler(async (req, res) => {
    const token = String(req.body?.token || '').trim()
    const newPassword = String(req.body?.newPassword || '')

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'token and newPassword are required' })
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'newPassword must be at least 8 characters' })
    }

    const tokenHash = sha256(token)

    const rows = await query(
      `
        SELECT
          rt.id,
          rt.user_id AS userId,
          rt.expires_at AS expiresAt,
          rt.used_at AS usedAt,
          u.tenant_id AS tenantId
        FROM pub_password_reset_tokens rt
        JOIN pub_users u ON u.id = rt.user_id
        WHERE rt.token_hash = ?
        ORDER BY rt.id DESC
        LIMIT 1
      `,
      [tokenHash]
    )

    const resetToken = rows[0]
    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid reset token' })
    }

    if (resetToken.usedAt) {
      return res.status(400).json({ error: 'Reset token already used' })
    }

    if (new Date(resetToken.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Reset token expired' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 10)

    await withTransaction(async (tx) => {
      await tx.query(`UPDATE pub_users SET password_hash = ? WHERE id = ?`, [passwordHash, resetToken.userId])
      await tx.query(`UPDATE pub_password_reset_tokens SET used_at = CURRENT_TIMESTAMP(6) WHERE id = ?`, [resetToken.id])
      await tx.query(
        `
          INSERT INTO pub_audit_log
          (tenant_id, actor_user_id, action_type, entity_type, entity_id, metadata)
          VALUES (?, ?, 'user.password_reset', 'user', ?, ?)
        `,
        [resetToken.tenantId, resetToken.userId, String(resetToken.userId), JSON.stringify({ resetTokenId: resetToken.id })]
      )
    })

    res.json({ ok: true })
  })
)

router.post(
  '/jobs/overdue-milestones/run',
  requireAuth,
  authorizeRoles([ROLES.ORG_ADMIN]),
  asyncHandler(async (req, res) => {
    const result = await runOverdueMilestoneScan()

    await writeAudit({
      tenantId: req.user.tenantId || null,
      actorUserId: req.user.id,
      actionType: 'job.overdue_milestones.run',
      entityType: 'job',
      entityId: null,
      metadata: result
    })

    res.json({ result })
  })
)

module.exports = router
