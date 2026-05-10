require('dotenv').config()
const express = require('express')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { pool } = require('../database/db')
const { authenticateSuperadmin } = require('../middleware/superadminAuth')
const { createRateLimiter } = require('../middleware/rateLimit')
const { createMfaChallenge, verifyMfaChallenge } = require('../services/authPolicyService')

const router = express.Router()
const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }
const ORG_HARDENING_KEYS = [
  'superadmin_policy_pack',
  'superadmin_license_tier',
  'superadmin_seat_limit',
  'superadmin_session_timeout_min',
  'superadmin_enforce_mfa',
  'superadmin_release_channel'
]

function normalizeHardeningPayload(raw = {}) {
  const seatLimit = Number.parseInt(raw.superadmin_seat_limit, 10)
  const sessionTimeoutMin = Number.parseInt(raw.superadmin_session_timeout_min, 10)
  return {
    superadmin_policy_pack: String(raw.superadmin_policy_pack || 'regulated_enterprise').trim().slice(0, 100),
    superadmin_license_tier: String(raw.superadmin_license_tier || 'enterprise').trim().slice(0, 100),
    superadmin_seat_limit: Number.isInteger(seatLimit) && seatLimit > 0 ? String(seatLimit) : '250',
    superadmin_session_timeout_min: Number.isInteger(sessionTimeoutMin) && sessionTimeoutMin > 0
      ? String(Math.min(1440, sessionTimeoutMin))
      : '480',
    superadmin_enforce_mfa: raw.superadmin_enforce_mfa ? '1' : '0',
    superadmin_release_channel: String(raw.superadmin_release_channel || 'stable').trim().slice(0, 40)
  }
}

const superadminLoginLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 20,
  keyFn: req => `${req.ip}:${String(req.body.email || '').toLowerCase()}`,
  errorMessage: 'Too many superadmin login attempts. Retry after 10 minutes.'
})

router.post('/login', superadminLoginLimiter, async (req, res) => {
  const { email, password, mfa_code: mfaCode, mfa_challenge_token: mfaChallengeToken } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

  try {
    const [[user]] = await pool.execute('SELECT * FROM superadmin_users WHERE email = ? AND is_active = 1', [email])
    if (!user) {
      await pool.execute(
        'INSERT INTO login_audit (org_id, email, action, ip_address, user_type) VALUES (?, ?, ?, ?, ?)',
        [null, email, 'login_fail', req.ip, 'superadmin']
      )
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      await pool.execute(
        'INSERT INTO login_audit (org_id, user_id, email, action, ip_address, user_type) VALUES (?, ?, ?, ?, ?, ?)',
        [null, user.id, email, 'login_fail', req.ip, 'superadmin']
      )
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const superadminMfaMode = String(process.env.SUPERADMIN_MFA_MODE || 'off').toLowerCase()
    if (superadminMfaMode === 'required') {
      if (!mfaCode || !mfaChallengeToken) {
        const challenge = await createMfaChallenge({
          orgId: null,
          userId: user.id,
          userType: 'superadmin',
          ipAddress: req.ip
        })
        return res.status(202).json({
          mfa_required: true,
          mfa_challenge_token: challenge.challengeToken,
          expires_in_seconds: challenge.expiresInSeconds,
          dev_code: challenge.devCode
        })
      }

      const verified = await verifyMfaChallenge({
        orgId: null,
        userId: user.id,
        userType: 'superadmin',
        challengeToken: mfaChallengeToken,
        code: mfaCode
      })
      if (!verified.ok) {
        return res.status(401).json({ error: verified.error, mfa_required: true })
      }
    }

    await pool.execute('UPDATE superadmin_users SET last_login_at = NOW() WHERE id = ?', [user.id])
    await pool.execute(
      'INSERT INTO login_audit (org_id, user_id, email, action, ip_address, user_type) VALUES (?, ?, ?, ?, ?, ?)',
      [null, user.id, email, 'login_success', req.ip, 'superadmin']
    )

    const token = jwt.sign({ superadminId: user.id }, process.env.SUPERADMIN_JWT_SECRET, { expiresIn: '8h' })
    res.cookie('vault_superadmin_token', token, { ...COOKIE_OPTS, maxAge: 8 * 60 * 60 * 1000 }).json({
      token,
      superadmin: { id: user.id, name: user.name, email: user.email },
      auth_context: {
        mfa_mode: superadminMfaMode
      }
    })
  } catch (err) {
    console.error('Superadmin login error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/logout', authenticateSuperadmin, async (req, res) => {
  try {
    await pool.execute(
      'INSERT INTO login_audit (org_id, user_id, action, ip_address, user_type) VALUES (?, ?, ?, ?, ?)',
      [null, req.superadmin.superadminId, 'logout', req.ip, 'superadmin']
    )
    res.clearCookie('vault_superadmin_token', COOKIE_OPTS).json({ message: 'Logged out' })
  } catch (err) {
    console.error('Superadmin logout error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/orgs', authenticateSuperadmin, async (_req, res) => {
  try {
    const [orgs] = await pool.execute(
      `SELECT
         o.id,
         o.name,
         o.slug,
         o.status,
         o.doc_number_prefix,
         o.storage_quota_mb,
         o.created_at,
         COUNT(u.id) AS user_count,
         COALESCE(SUM(vv.file_size_kb), 0) AS storage_used_kb
       FROM orgs o
       LEFT JOIN users u
         ON u.org_id = o.id
        AND u.is_active = 1
       LEFT JOIN vault_content vc
         ON vc.org_id = o.id
       LEFT JOIN vault_versions vv
         ON vv.content_id = vc.id
        AND vv.org_id = vc.org_id
       GROUP BY o.id
       ORDER BY o.created_at DESC`
    )
    res.json(orgs)
  } catch (err) {
    console.error('List superadmin orgs error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/orgs', authenticateSuperadmin, async (req, res) => {
  const { name, slug, doc_number_prefix, storage_quota_mb } = req.body
  if (!name || !slug || !doc_number_prefix) {
    return res.status(400).json({ error: 'name, slug and doc_number_prefix are required' })
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO orgs (name, slug, doc_number_prefix, storage_quota_mb, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [name, slug, doc_number_prefix, storage_quota_mb || 10240, req.superadmin.superadminId]
    )

    res.status(201).json({ id: result.insertId, name, slug, doc_number_prefix, storage_quota_mb: storage_quota_mb || 10240 })
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Slug already exists' })
    console.error('Create org error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/orgs/:id/status', authenticateSuperadmin, async (req, res) => {
  const orgId = Number(req.params.id)
  const { status } = req.body
  if (!Number.isInteger(orgId) || orgId <= 0) return res.status(400).json({ error: 'Invalid org id' })
  if (!['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'Invalid status' })

  try {
    const [result] = await pool.execute('UPDATE orgs SET status = ? WHERE id = ?', [status, orgId])
    if (!result.affectedRows) return res.status(404).json({ error: 'Organisation not found' })
    res.json({ message: 'Org status updated', id: orgId, status })
  } catch (err) {
    console.error('Update org status error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/orgs/:id/users', authenticateSuperadmin, async (req, res) => {
  const orgId = Number(req.params.id)
  if (!Number.isInteger(orgId) || orgId <= 0) return res.status(400).json({ error: 'Invalid org id' })

  try {
    const [[org]] = await pool.execute('SELECT id, name, slug, status FROM orgs WHERE id = ?', [orgId])
    if (!org) return res.status(404).json({ error: 'Organisation not found' })

    const [users] = await pool.execute(
      `SELECT id, org_id, name, email, role, is_active, created_at, last_login_at
       FROM users
       WHERE org_id = ?
       ORDER BY created_at DESC`,
      [orgId]
    )

    res.json({ org, users })
  } catch (err) {
    console.error('List org users error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/orgs/:id/users', authenticateSuperadmin, async (req, res) => {
  const orgId = Number(req.params.id)
  if (!Number.isInteger(orgId) || orgId <= 0) return res.status(400).json({ error: 'Invalid org id' })

  const { name, email, password, role } = req.body
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password and role are required' })
  }
  const validRoles = ['admin', 'author', 'reviewer', 'approver', 'viewer']
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` })
  }

  try {
    const [[org]] = await pool.execute('SELECT id FROM orgs WHERE id = ? AND status = ?', [orgId, 'active'])
    if (!org) return res.status(404).json({ error: 'Organisation not found or inactive' })

    const [[existing]] = await pool.execute(
      'SELECT id FROM users WHERE email = ? AND org_id = ?',
      [email.toLowerCase(), orgId]
    )
    if (existing) return res.status(409).json({ error: 'A user with this email already exists in this organisation' })

    const passwordHash = await bcrypt.hash(password, 12)
    const [result] = await pool.execute(
      'INSERT INTO users (org_id, name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      [orgId, name, email.toLowerCase(), passwordHash, role]
    )

    res.status(201).json({
      id: result.insertId,
      org_id: orgId,
      name,
      email: email.toLowerCase(),
      role,
      is_active: 1
    })
  } catch (err) {
    console.error('Create org user error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/orgs/:id/hardening', authenticateSuperadmin, async (req, res) => {
  const orgId = Number(req.params.id)
  if (!Number.isInteger(orgId) || orgId <= 0) return res.status(400).json({ error: 'Invalid org id' })

  try {
    const [[org]] = await pool.execute(
      `SELECT id, name, slug, status, storage_quota_mb
       FROM orgs
       WHERE id = ?`,
      [orgId]
    )
    if (!org) return res.status(404).json({ error: 'Organisation not found' })

    const [configRows] = await pool.execute(
      `SELECT config_key, config_value
       FROM org_config
       WHERE org_id = ?
         AND config_key IN (${ORG_HARDENING_KEYS.map(() => '?').join(',')})`,
      [orgId, ...ORG_HARDENING_KEYS]
    )
    const configMap = Object.fromEntries(configRows.map(row => [row.config_key, row.config_value]))

    const [[seatStats]] = await pool.execute(
      `SELECT
         COUNT(*) AS total_users,
         SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_users
       FROM users
       WHERE org_id = ?`,
      [orgId]
    )

    res.json({
      org,
      policy: {
        superadmin_policy_pack: configMap.superadmin_policy_pack || 'regulated_enterprise',
        superadmin_license_tier: configMap.superadmin_license_tier || 'enterprise',
        superadmin_seat_limit: Number(configMap.superadmin_seat_limit || 250),
        superadmin_session_timeout_min: Number(configMap.superadmin_session_timeout_min || 480),
        superadmin_enforce_mfa: String(configMap.superadmin_enforce_mfa || '0') === '1',
        superadmin_release_channel: configMap.superadmin_release_channel || 'stable'
      },
      seats: {
        total_users: Number(seatStats.total_users || 0),
        active_users: Number(seatStats.active_users || 0)
      }
    })
  } catch (err) {
    console.error('Get org hardening error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/orgs/:id/hardening', authenticateSuperadmin, async (req, res) => {
  const orgId = Number(req.params.id)
  if (!Number.isInteger(orgId) || orgId <= 0) return res.status(400).json({ error: 'Invalid org id' })

  const payload = normalizeHardeningPayload(req.body || {})
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()

    const [[org]] = await connection.execute('SELECT id FROM orgs WHERE id = ?', [orgId])
    if (!org) {
      await connection.rollback()
      return res.status(404).json({ error: 'Organisation not found' })
    }

    for (const [configKey, configValue] of Object.entries(payload)) {
      await connection.execute(
        `INSERT INTO org_config (org_id, config_key, config_value)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
        [orgId, configKey, configValue]
      )
    }

    await connection.commit()
    res.json({ message: 'Organization hardening policy saved', policy: payload })
  } catch (err) {
    await connection.rollback()
    console.error('Update org hardening error:', err)
    res.status(500).json({ error: 'Server error' })
  } finally {
    connection.release()
  }
})

router.get('/dashboard', authenticateSuperadmin, async (_req, res) => {
  try {
    const [[orgCount]] = await pool.execute(
      `SELECT
         COUNT(*) AS total_orgs,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_orgs,
         SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive_orgs
       FROM orgs`
    )

    const [[contentStats]] = await pool.execute(
      `SELECT
         COUNT(*) AS total_documents,
         COALESCE(SUM(vv.file_size_kb), 0) AS total_storage_kb
       FROM vault_content vc
       LEFT JOIN vault_versions vv
         ON vv.id = vc.current_version_id
        AND vv.org_id = vc.org_id`
    )

    const [recentLogins] = await pool.execute(
      `SELECT id, org_id, user_id, user_type, email, action, ip_address, created_at
       FROM login_audit
       ORDER BY created_at DESC
       LIMIT 50`
    )

    res.json({
      orgs: {
        total: Number(orgCount.total_orgs || 0),
        active: Number(orgCount.active_orgs || 0),
        inactive: Number(orgCount.inactive_orgs || 0)
      },
      documents: {
        total: Number(contentStats.total_documents || 0),
        storage_kb: Number(contentStats.total_storage_kb || 0)
      },
      recent_logins: recentLogins
    })
  } catch (err) {
    console.error('Superadmin dashboard error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/audit', authenticateSuperadmin, async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page || '1', 10))
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit || '50', 10)))
  const offset = (page - 1) * limit

  const where = ['1=1']
  const params = []

  if (req.query.org_id) {
    where.push('va.org_id = ?')
    params.push(Number(req.query.org_id))
  }
  if (req.query.action) {
    where.push('va.action = ?')
    params.push(req.query.action)
  }
  if (req.query.date_from) {
    where.push('DATE(va.created_at) >= DATE(?)')
    params.push(req.query.date_from)
  }
  if (req.query.date_to) {
    where.push('DATE(va.created_at) <= DATE(?)')
    params.push(req.query.date_to)
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         va.id,
         va.org_id,
         o.name AS org_name,
         va.user_id,
         va.user_type,
         va.action,
         va.entity_type,
         va.entity_id,
         va.ip_address,
         va.created_at,
         va.before_value,
         va.after_value,
         va.notes
       FROM vault_audit_log va
       LEFT JOIN orgs o ON o.id = va.org_id
       WHERE ${where.join(' AND ')}
       ORDER BY va.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    )

    const [[countRow]] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM vault_audit_log va
       WHERE ${where.join(' AND ')}`,
      params
    )

    res.json({
      results: rows,
      total: Number(countRow.total || 0),
      page,
      limit
    })
  } catch (err) {
    console.error('Superadmin audit error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
