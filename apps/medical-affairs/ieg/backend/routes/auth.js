const express = require('express')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { query } = require('../database/db')
const { requireAuth } = require('../middleware/auth')
const JWT_SECRET = process.env.JWT_SECRET || 'ieg_dev_secret_change_me'

const router = express.Router()

function makeInternalToken(user, modules) {
  return jwt.sign(
    {
      type: 'internal',
      userId: Number(user.id),
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      isSuperadmin: user.is_superadmin,
      modules
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  )
}

function makeExternalToken(user) {
  const moduleMap = {
    grants_applicant: ['grants'],
    iit_investigator: ['iit'],
    eap_physician: ['eap'],
    institution: ['grants', 'iit', 'eap']
  }

  return jwt.sign(
    {
      type: 'external',
      userId: Number(user.id),
      email: user.email,
      displayName: user.display_name,
      userType: user.user_type,
      modules: moduleMap[user.user_type] || ['grants', 'iit', 'eap']
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  )
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }

  const { rows } = await query(`SELECT * FROM ieg_users WHERE email = $1 AND is_active = TRUE`, [email.toLowerCase().trim()])
  const user = rows[0]
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })

  const ok = await bcrypt.compare(password, user.password_hash)
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' })

  const modulesResult = await query(
    `SELECT module_key FROM ieg_user_modules WHERE user_id = $1 ORDER BY module_key`,
    [user.id]
  )
  const modules = modulesResult.rows.map((row) => row.module_key)
  const token = makeInternalToken(user, modules)

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      isSuperadmin: user.is_superadmin,
      modules
    }
  })
})

router.post('/external/register', async (req, res) => {
  const { email, password, displayName, userType } = req.body || {}
  if (!email || !password || !displayName || !userType) {
    return res.status(400).json({ error: 'email, password, displayName and userType are required' })
  }
  if (!['grants_applicant', 'iit_investigator', 'institution', 'eap_physician'].includes(userType)) {
    return res.status(400).json({ error: 'userType must be grants_applicant, iit_investigator, institution, or eap_physician' })
  }

  const normalizedEmail = email.toLowerCase().trim()
  const existing = await query(`SELECT id FROM ieg_external_users WHERE email = $1`, [normalizedEmail])
  if (existing.rows[0]) {
    return res.status(409).json({ error: 'External user already exists' })
  }

  const hash = await bcrypt.hash(password, 10)
  const { rows } = await query(
    `
      INSERT INTO ieg_external_users (email, display_name, user_type, password_hash, email_verified)
      VALUES ($1, $2, $3, $4, TRUE)
      RETURNING *
    `,
    [normalizedEmail, displayName, userType, hash]
  )

  const token = makeExternalToken(rows[0])
  return res.status(201).json({ token, user: rows[0] })
})

router.post('/external/login', async (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' })
  }

  const { rows } = await query(`SELECT * FROM ieg_external_users WHERE email = $1 AND is_active = TRUE`, [email.toLowerCase().trim()])
  const user = rows[0]
  if (!user) return res.status(401).json({ error: 'Invalid credentials' })

  const ok = await bcrypt.compare(password, user.password_hash)
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' })

  const token = makeExternalToken(user)
  return res.json({ token, user })
})

router.get('/me', requireAuth, async (req, res) => {
  if (req.auth.type === 'external') {
    const { rows } = await query(`SELECT id, email, display_name, user_type FROM ieg_external_users WHERE id = $1`, [req.auth.userId])
    return res.json({ user: rows[0] || null })
  }

  const userResult = await query(`SELECT id, email, full_name, role, is_superadmin FROM ieg_users WHERE id = $1`, [req.auth.userId])
  const modulesResult = await query(`SELECT module_key FROM ieg_user_modules WHERE user_id = $1`, [req.auth.userId])
  return res.json({
    user: {
      ...(userResult.rows[0] || {}),
      modules: modulesResult.rows.map((row) => row.module_key)
    }
  })
})

module.exports = router
