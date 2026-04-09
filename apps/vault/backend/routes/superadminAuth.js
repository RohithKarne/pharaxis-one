require('dotenv').config()
const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { pool } = require('../database/db')
const { authenticateSuperadmin } = require('../middleware/superadminAuth')

// POST /api/superadmin/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })
  try {
    const [[user]] = await pool.execute('SELECT * FROM superadmin_users WHERE email = ? AND is_active = 1', [email])
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

    await pool.execute('UPDATE superadmin_users SET last_login_at = NOW() WHERE id = ?', [user.id])
    await pool.execute(
      'INSERT INTO login_audit (user_id, email, action, ip_address, user_type) VALUES (?, ?, ?, ?, ?)',
      [user.id, email, 'login_success', req.ip, 'superadmin']
    )

    const token = jwt.sign(
      { superadminId: user.id },
      process.env.SUPERADMIN_JWT_SECRET,
      { expiresIn: '8h' }
    )

    res.json({ token, superadmin: { id: user.id, name: user.name, email: user.email } })
  } catch (err) {
    console.error('Superadmin login error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// GET /api/superadmin/orgs
router.get('/orgs', authenticateSuperadmin, async (req, res) => {
  try {
    const [orgs] = await pool.execute(`
      SELECT o.*, COUNT(u.id) as user_count
      FROM orgs o
      LEFT JOIN users u ON u.org_id = o.id AND u.is_active = 1
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `)
    res.json(orgs)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/superadmin/orgs
router.post('/orgs', authenticateSuperadmin, async (req, res) => {
  const { name, slug, doc_number_prefix, storage_quota_mb } = req.body
  if (!name || !slug || !doc_number_prefix) {
    return res.status(400).json({ error: 'name, slug and doc_number_prefix are required' })
  }
  try {
    const [result] = await pool.execute(
      'INSERT INTO orgs (name, slug, doc_number_prefix, storage_quota_mb, created_by) VALUES (?, ?, ?, ?, ?)',
      [name, slug, doc_number_prefix, storage_quota_mb || 10240, req.superadmin.superadminId]
    )
    res.status(201).json({ id: result.insertId, name, slug, doc_number_prefix })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Slug already exists' })
    res.status(500).json({ error: 'Server error' })
  }
})

// PATCH /api/superadmin/orgs/:id/status
router.patch('/orgs/:id/status', authenticateSuperadmin, async (req, res) => {
  const { status } = req.body
  if (!['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'Invalid status' })
  try {
    await pool.execute('UPDATE orgs SET status = ? WHERE id = ?', [status, req.params.id])
    res.json({ message: 'Org status updated' })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
