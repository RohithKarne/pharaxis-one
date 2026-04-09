require('dotenv').config()
const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password, orgSlug } = req.body
  if (!email || !password || !orgSlug) {
    return res.status(400).json({ error: 'Email, password and org slug are required' })
  }
  try {
    const [[org]] = await pool.execute('SELECT id FROM orgs WHERE slug = ? AND status = ?', [orgSlug, 'active'])
    if (!org) return res.status(401).json({ error: 'Organisation not found or inactive' })

    const [[user]] = await pool.execute(
      'SELECT * FROM users WHERE email = ? AND org_id = ? AND is_active = 1',
      [email, org.id]
    )
    if (!user) {
      await pool.execute(
        'INSERT INTO login_audit (org_id, email, action, ip_address, user_type) VALUES (?, ?, ?, ?, ?)',
        [org.id, email, 'login_fail', req.ip, 'org_user']
      )
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      await pool.execute(
        'INSERT INTO login_audit (org_id, user_id, email, action, ip_address, user_type) VALUES (?, ?, ?, ?, ?, ?)',
        [org.id, user.id, email, 'login_fail', req.ip, 'org_user']
      )
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id])
    await pool.execute(
      'INSERT INTO login_audit (org_id, user_id, email, action, ip_address, user_type) VALUES (?, ?, ?, ?, ?, ?)',
      [org.id, user.id, email, 'login_success', req.ip, 'org_user']
    )

    const token = jwt.sign(
      { userId: user.id, orgId: user.org_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    )

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, orgId: user.org_id } })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  try {
    await pool.execute(
      'INSERT INTO login_audit (org_id, user_id, action, ip_address, user_type) VALUES (?, ?, ?, ?, ?)',
      [req.user.orgId, req.user.userId, 'logout', req.ip, 'org_user']
    )
    res.json({ message: 'Logged out' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const [[user]] = await pool.execute(
      'SELECT id, name, email, role, org_id FROM users WHERE id = ? AND org_id = ? AND is_active = 1',
      [req.user.userId, req.user.orgId]
    )
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(user)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
