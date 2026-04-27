const express = require('express')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { query } = require('../database/db')
const { requireAuth } = require('../middleware/auth')
const { asyncHandler } = require('../utils/asyncHandler')

const router = express.Router()

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' })
    }

    const users = await query(
      `
        SELECT
          u.id,
          u.tenant_id,
          u.email,
          u.full_name,
          u.password_hash,
          u.role,
          u.is_superadmin,
          u.is_active,
          t.name AS tenant_name
        FROM pub_users u
        LEFT JOIN pub_tenants t ON t.id = u.tenant_id
        WHERE u.email = ?
        LIMIT 1
      `,
      [email]
    )

    const user = users[0]
    if (!user || !Number(user.is_active)) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenant_id,
        isSuperadmin: Boolean(user.is_superadmin)
      },
      process.env.JWT_SECRET || 'publications_local_dev_secret_change_me',
      { expiresIn: '8h' }
    )

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        tenantId: user.tenant_id,
        tenantName: user.tenant_name,
        isSuperadmin: Boolean(user.is_superadmin)
      }
    })
  })
)

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = await query(
      `
        SELECT
          u.id,
          u.tenant_id,
          u.email,
          u.full_name,
          u.role,
          u.is_superadmin,
          t.name AS tenant_name
        FROM pub_users u
        LEFT JOIN pub_tenants t ON t.id = u.tenant_id
        WHERE u.id = ?
        LIMIT 1
      `,
      [req.user.id]
    )

    const user = rows[0]
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        tenantId: user.tenant_id,
        tenantName: user.tenant_name,
        isSuperadmin: Boolean(user.is_superadmin)
      }
    })
  })
)

module.exports = router
