const jwt = require('jsonwebtoken')
const { pool } = require('../database/db')
const {
  getSessionByJti,
  touchSession,
  closeSessionByJti,
  getSessionPolicy
} = require('../services/sessionService')

const JWT_SECRET = process.env.JWT_SECRET || 'dev_safety_jwt_change_me'

function parseToken(req) {
  const header = req.headers.authorization || ''
  if (!header.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length).trim()
}

function isRouteAllowedForMustReset(path) {
  return [
    '/api/auth/logout',
    '/api/auth/me'
  ].includes(path)
}

async function authenticate(req, res, next) {
  const token = parseToken(req)
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  let decoded
  try {
    decoded = jwt.verify(token, JWT_SECRET)
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { userId, orgId, role, clientId = null, jti } = decoded
  if (!userId || !orgId || !role || !jti) {
    return res.status(401).json({ error: 'Invalid token payload' })
  }

  try {
    const session = await getSessionByJti(jti)
    if (!session || session.status !== 'active' || session.revoked_at) {
      return res.status(401).json({ error: 'Session inactive. Please login again.' })
    }

    const policy = await getSessionPolicy(orgId)
    const nowMs = Date.now()
    const lastActivityMs = new Date(session.last_activity_at).getTime()
    const expiresAtMs = new Date(session.expires_at).getTime()
    const inactivityLimitMs = policy.timeoutMinutes * 60 * 1000

    if ((nowMs - lastActivityMs) > inactivityLimitMs || nowMs > expiresAtMs) {
      await closeSessionByJti({
        jti,
        actorUserId: userId,
        reason: 'session_timeout',
        eventType: 'timed_out'
      })
      return res.status(401).json({ error: 'Session timed out. Please login again.' })
    }

    const [[user]] = await pool.execute(
      `SELECT
        u.user_id,
        u.org_id,
        u.client_id,
        u.full_name,
        u.email,
        u.role,
        u.status,
        u.must_reset_password,
        o.org_name,
        o.org_type,
        o.status AS org_status
      FROM users u
      INNER JOIN organisations o ON o.org_id = u.org_id
      WHERE u.user_id = ? AND u.org_id = ?`,
      [userId, orgId]
    )

    if (!user || user.status !== 'active' || user.org_status !== 'active') {
      await closeSessionByJti({
        jti,
        actorUserId: userId,
        reason: 'account_or_org_inactive',
        eventType: 'revoked'
      })
      return res.status(403).json({ error: 'Account or organisation is inactive' })
    }

    if (user.must_reset_password && !isRouteAllowedForMustReset(req.path)) {
      return res.status(403).json({ error: 'Password reset required before accessing the system' })
    }

    await touchSession(jti)

    req.user = {
      userId: user.user_id,
      orgId: user.org_id,
      clientId: user.client_id ?? clientId,
      role: user.role,
      email: user.email,
      fullName: user.full_name,
      orgType: user.org_type,
      orgName: user.org_name,
      jti
    }

    next()
  } catch (error) {
    console.error('Authentication error:', error)
    return res.status(500).json({ error: 'Failed to authenticate request' })
  }
}

module.exports = {
  authenticate
}
