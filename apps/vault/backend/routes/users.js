const express = require('express')
const bcrypt = require('bcrypt')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const auditService = require('../services/auditService')

const router = express.Router()
const VALID_ROLES = ['admin', 'author', 'reviewer', 'approver', 'viewer']

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' })
  }
  next()
}

function normalizeIsActive(value) {
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value ? 1 : 0
  if (value === 1 || value === 0) return value
  if (value === '1' || value === '0') return Number(value)
  return null
}

// GET /api/users -> list users in current org + derived last login from login_audit
router.get('/', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.role,
         u.is_active,
         u.created_at,
         MAX(CASE WHEN la.action = 'login_success' THEN la.created_at END) AS last_login_at
       FROM users u
       LEFT JOIN login_audit la
         ON la.org_id = u.org_id
        AND la.user_id = u.id
        AND la.user_type = 'org_user'
       WHERE u.org_id = ?
       GROUP BY u.id, u.name, u.email, u.role, u.is_active, u.created_at
       ORDER BY u.created_at DESC`,
      [req.user.orgId]
    )
    res.json(rows)
  } catch (error) {
    console.error('List users error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/users -> create user in current org (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  const { name, email, role, password } = req.body
  if (!name || !email || !role || !password) {
    return res.status(400).json({ error: 'name, email, role and password are required' })
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role value' })
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10)
    const [result] = await pool.execute(
      `INSERT INTO users (org_id, name, email, password_hash, role, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [req.user.orgId, name.trim(), email.trim().toLowerCase(), passwordHash, role]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'user_created',
      'user',
      result.insertId,
      req.ip,
      null,
      { name, email: email.trim().toLowerCase(), role, is_active: 1 },
      `User created by admin ${req.user.userId}`
    )

    res.status(201).json({
      id: result.insertId,
      org_id: req.user.orgId,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      is_active: 1
    })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'User email already exists in this org' })
    }
    console.error('Create user error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/users/:id -> update role and/or active flag (admin only)
router.patch('/:id', authenticate, requireAdmin, async (req, res) => {
  const targetUserId = Number(req.params.id)
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' })
  }

  const nextRole = req.body.role
  const nextActive = normalizeIsActive(req.body.is_active)

  if (nextRole === undefined && nextActive === undefined) {
    return res.status(400).json({ error: 'Provide role and/or is_active to update' })
  }
  if (nextRole !== undefined && !VALID_ROLES.includes(nextRole)) {
    return res.status(400).json({ error: 'Invalid role value' })
  }
  if (nextActive === null) {
    return res.status(400).json({ error: 'is_active must be true/false or 1/0' })
  }

  try {
    const [[existing]] = await pool.execute(
      `SELECT id, org_id, name, email, role, is_active
       FROM users
       WHERE id = ? AND org_id = ?`,
      [targetUserId, req.user.orgId]
    )

    if (!existing) {
      return res.status(404).json({ error: 'User not found in your organisation' })
    }

    const updates = []
    const values = []

    if (nextRole !== undefined && nextRole !== existing.role) {
      updates.push('role = ?')
      values.push(nextRole)
    }
    if (nextActive !== undefined && Number(nextActive) !== Number(existing.is_active)) {
      updates.push('is_active = ?')
      values.push(nextActive)
    }

    if (!updates.length) {
      return res.json({ message: 'No changes applied', user: existing })
    }

    values.push(targetUserId, req.user.orgId)
    await pool.execute(`UPDATE users SET ${updates.join(', ')} WHERE id = ? AND org_id = ?`, values)

    const [[updated]] = await pool.execute(
      `SELECT id, org_id, name, email, role, is_active
       FROM users
       WHERE id = ? AND org_id = ?`,
      [targetUserId, req.user.orgId]
    )

    if (nextRole !== undefined && nextRole !== existing.role) {
      await auditService.log(
        req.user.orgId,
        req.user.userId,
        'org_user',
        'user_role_changed',
        'user',
        targetUserId,
        req.ip,
        { role: existing.role },
        { role: updated.role },
        `Role changed by admin ${req.user.userId}`
      )
    }

    if (nextActive !== undefined && Number(nextActive) !== Number(existing.is_active)) {
      const actionName = Number(nextActive) === 0 ? 'user_deactivated' : 'user_activated'
      await auditService.log(
        req.user.orgId,
        req.user.userId,
        'org_user',
        actionName,
        'user',
        targetUserId,
        req.ip,
        { is_active: existing.is_active },
        { is_active: updated.is_active },
        `User status changed by admin ${req.user.userId}`
      )
    }

    res.json({ message: 'User updated', user: updated })
  } catch (error) {
    console.error('Update user error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
