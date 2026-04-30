require('dotenv').config()
const express = require('express')
const router = express.Router()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const { createRateLimiter } = require('../middleware/rateLimit')
const {
  getOrgAuthPolicy,
  createMfaChallenge,
  verifyMfaChallenge
} = require('../services/authPolicyService')

// POST /api/auth/login
const authLoginLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 30,
  keyFn: req => `${req.ip}:${String(req.body.email || '').toLowerCase()}`,
  errorMessage: 'Too many login attempts. Retry after 10 minutes.'
})

router.post('/login', authLoginLimiter, async (req, res) => {
  const { email, password, orgSlug, mfa_code: mfaCode, mfa_challenge_token: mfaChallengeToken } = req.body
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

    const authPolicy = await getOrgAuthPolicy(org.id)
    if (authPolicy.mfa_mode === 'required') {
      if (!mfaCode || !mfaChallengeToken) {
        const challenge = await createMfaChallenge({
          orgId: org.id,
          userId: user.id,
          userType: 'org_user',
          ipAddress: req.ip
        })
        return res.status(202).json({
          mfa_required: true,
          mfa_challenge_token: challenge.challengeToken,
          expires_in_seconds: challenge.expiresInSeconds,
          dev_code: challenge.devCode,
          auth_context: {
            mfa_mode: authPolicy.mfa_mode,
            sso_enabled: Boolean(authPolicy.sso_enabled),
            sso_provider: authPolicy.sso_provider || null
          }
        })
      }

      const verified = await verifyMfaChallenge({
        orgId: org.id,
        userId: user.id,
        userType: 'org_user',
        challengeToken: mfaChallengeToken,
        code: mfaCode
      })
      if (!verified.ok) {
        return res.status(401).json({ error: verified.error, mfa_required: true })
      }
    }

    await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id])
    await pool.execute(
      'INSERT INTO login_audit (org_id, user_id, email, action, ip_address, user_type) VALUES (?, ?, ?, ?, ?, ?)',
      [org.id, user.id, email, 'login_success', req.ip, 'org_user']
    )

    const token = jwt.sign(
      { userId: user.id, orgId: user.org_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: `${authPolicy.session_hours || 8}h` }
    )

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, orgId: user.org_id },
      auth_context: {
        mfa_mode: authPolicy.mfa_mode,
        sso_enabled: Boolean(authPolicy.sso_enabled),
        sso_provider: authPolicy.sso_provider || null
      }
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/sso/discovery/:orgSlug', async (req, res) => {
  const orgSlug = String(req.params.orgSlug || '').trim()
  if (!orgSlug) return res.status(400).json({ error: 'orgSlug is required' })

  try {
    const [[org]] = await pool.execute(
      'SELECT id, slug, name, status FROM orgs WHERE slug = ? LIMIT 1',
      [orgSlug]
    )
    if (!org || org.status !== 'active') {
      return res.status(404).json({ error: 'Organisation not found or inactive' })
    }

    const policy = await getOrgAuthPolicy(org.id)
    res.json({
      org_id: org.id,
      org_slug: org.slug,
      org_name: org.name,
      sso_enabled: Boolean(policy.sso_enabled),
      sso_provider: policy.sso_provider || null,
      sso_entrypoint: policy.sso_entrypoint || null,
      sso_entity_id: policy.sso_entity_id || null
    })
  } catch (error) {
    console.error('SSO discovery error:', error)
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
