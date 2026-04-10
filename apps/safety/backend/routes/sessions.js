const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const { requireModule, assertOrgAccess } = require('../middleware/rbac')
const { MODULES, ROLES } = require('../constants')
const { logAdminAction } = require('../services/auditService')
const { revokeSessionById, closeSessionByJti } = require('../services/sessionService')

const router = express.Router()

router.use(authenticate)

router.get('/me', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
        session_id,
        org_id,
        user_id,
        issued_at,
        last_activity_at,
        expires_at,
        revoked_at,
        revoke_reason,
        ip_address,
        user_agent,
        status
       FROM user_sessions
       WHERE org_id = ? AND user_id = ?
       ORDER BY issued_at DESC`,
      [req.user.orgId, req.user.userId]
    )

    return res.json(rows)
  } catch (error) {
    console.error('Fetch own sessions failed:', error)
    return res.status(500).json({ error: 'Failed to fetch sessions' })
  }
})

router.get('/active', requireModule(MODULES.USER_MANAGEMENT), async (req, res) => {
  const targetOrgId = req.query.orgId ? Number(req.query.orgId) : req.user.orgId
  const targetUserId = req.query.userId ? Number(req.query.userId) : null

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) {
    return res.status(400).json({ error: 'Invalid org id' })
  }

  if (!assertOrgAccess(req, res, targetOrgId)) {
    return undefined
  }

  try {
    const params = [targetOrgId]
    let userFilterSql = ''
    if (targetUserId) {
      userFilterSql = 'AND s.user_id = ?'
      params.push(targetUserId)
    }

    const [rows] = await pool.execute(
      `SELECT
        s.session_id,
        s.org_id,
        s.user_id,
        u.full_name,
        u.email,
        s.issued_at,
        s.last_activity_at,
        s.expires_at,
        s.ip_address,
        s.user_agent,
        s.status
       FROM user_sessions s
       INNER JOIN users u ON u.user_id = s.user_id
       WHERE s.org_id = ?
         AND s.status = 'active'
         ${userFilterSql}
       ORDER BY s.last_activity_at DESC`,
      params
    )

    return res.json(rows)
  } catch (error) {
    console.error('Fetch active sessions failed:', error)
    return res.status(500).json({ error: 'Failed to fetch active sessions' })
  }
})

router.post('/:sessionId/revoke', requireModule(MODULES.USER_MANAGEMENT), async (req, res) => {
  const sessionId = Number(req.params.sessionId)
  const reason = String(req.body.reason || 'admin_revoke').slice(0, 255)

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return res.status(400).json({ error: 'Invalid session id' })
  }

  try {
    const [[session]] = await pool.execute(
      'SELECT session_id, org_id, user_id, jti, status FROM user_sessions WHERE session_id = ?',
      [sessionId]
    )

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    if (req.user.role === ROLES.SUPER_ADMIN) {
      await closeSessionByJti({
        jti: session.jti,
        actorUserId: req.user.userId,
        reason,
        eventType: 'revoked'
      })
    } else {
      const result = await revokeSessionById({
        sessionId,
        actorUserId: req.user.userId,
        actorOrgId: req.user.orgId,
        reason
      })

      if (result === 'forbidden') {
        return res.status(403).json({ error: 'Cross-organisation access is not allowed' })
      }

      if (!result) {
        return res.status(404).json({ error: 'Session not found' })
      }
    }

    await logAdminAction({
      orgId: session.org_id,
      actorUserId: req.user.userId,
      actionType: 'session_revoked',
      entityType: 'user_session',
      entityId: String(sessionId),
      metadata: { reason }
    })

    return res.json({ message: 'Session revoked' })
  } catch (error) {
    console.error('Revoke session failed:', error)
    return res.status(500).json({ error: 'Failed to revoke session' })
  }
})

router.get('/user/:userId/activity', requireModule(MODULES.USER_MANAGEMENT), async (req, res) => {
  const userId = Number(req.params.userId)
  const targetOrgId = req.query.orgId ? Number(req.query.orgId) : req.user.orgId

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid user id' })
  }

  if (!Number.isInteger(targetOrgId) || targetOrgId <= 0) {
    return res.status(400).json({ error: 'Invalid org id' })
  }

  if (!assertOrgAccess(req, res, targetOrgId)) {
    return undefined
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
        activity_id,
        org_id,
        user_id,
        jti,
        event_type,
        event_at,
        ip_address,
        metadata
       FROM session_activity_log
       WHERE org_id = ? AND user_id = ?
       ORDER BY event_at DESC
       LIMIT 300`,
      [targetOrgId, userId]
    )

    return res.json(rows)
  } catch (error) {
    console.error('Fetch session activity failed:', error)
    return res.status(500).json({ error: 'Failed to fetch session activity' })
  }
})

module.exports = router
