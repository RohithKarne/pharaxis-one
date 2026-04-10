const { pool } = require('../database/db')
const { getConfigValue } = require('./configService')

async function getSessionPolicy(orgId) {
  const timeoutRaw = await getConfigValue(orgId, 'session_timeout_minutes', '480')
  const concurrentRaw = await getConfigValue(orgId, 'max_concurrent_sessions', '2')

  const timeoutMinutes = Math.max(5, Number.parseInt(timeoutRaw || '480', 10) || 480)
  const maxConcurrentSessions = Math.max(1, Number.parseInt(concurrentRaw || '2', 10) || 2)

  return { timeoutMinutes, maxConcurrentSessions }
}

async function countActiveSessions(orgId, userId) {
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS total
     FROM user_sessions
     WHERE org_id = ?
       AND user_id = ?
       AND status = 'active'
       AND revoked_at IS NULL
       AND expires_at > NOW()`,
    [orgId, userId]
  )
  return row.total || 0
}

async function createSession({
  orgId,
  userId,
  jti,
  timeoutMinutes,
  ipAddress,
  userAgent
}) {
  await pool.execute(
    `INSERT INTO user_sessions
      (org_id, user_id, jti, issued_at, last_activity_at, expires_at, ip_address, user_agent, status)
     VALUES (?, ?, ?, NOW(), NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE), ?, ?, 'active')`,
    [orgId, userId, jti, timeoutMinutes, ipAddress, userAgent]
  )

  await pool.execute(
    `INSERT INTO session_activity_log
      (org_id, user_id, jti, event_type, ip_address, metadata)
     VALUES (?, ?, ?, 'login', ?, ?)`,
    [orgId, userId, jti, ipAddress, JSON.stringify({ timeoutMinutes })]
  )
}

async function touchSession(jti) {
  await pool.execute(
    `UPDATE user_sessions
     SET last_activity_at = NOW()
     WHERE jti = ? AND status = 'active'`,
    [jti]
  )
}

async function getSessionByJti(jti) {
  const [[row]] = await pool.execute(
    `SELECT session_id, org_id, user_id, jti, issued_at, last_activity_at, expires_at, revoked_at, status
     FROM user_sessions
     WHERE jti = ?`,
    [jti]
  )
  return row || null
}

async function closeSessionByJti({ jti, actorUserId = null, reason = 'logout', eventType = 'logout' }) {
  await pool.execute(
    `UPDATE user_sessions
     SET status = IF(status = 'active', ?, status),
         revoked_at = IF(revoked_at IS NULL, NOW(), revoked_at),
         revoked_by = ?,
         revoke_reason = ?
     WHERE jti = ?`,
    [eventType === 'logout' ? 'logged_out' : 'revoked', actorUserId, reason, jti]
  )

  const [[session]] = await pool.execute(
    'SELECT org_id, user_id FROM user_sessions WHERE jti = ?',
    [jti]
  )

  if (session) {
    await pool.execute(
      `INSERT INTO session_activity_log
        (org_id, user_id, jti, event_type, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      [session.org_id, session.user_id, jti, eventType, JSON.stringify({ reason, actorUserId })]
    )
  }
}

async function revokeSessionById({ sessionId, actorUserId, actorOrgId, reason }) {
  const [[session]] = await pool.execute(
    `SELECT session_id, org_id, user_id, jti, status
     FROM user_sessions
     WHERE session_id = ?`,
    [sessionId]
  )

  if (!session) return null
  if (session.org_id !== actorOrgId) return 'forbidden'

  await closeSessionByJti({
    jti: session.jti,
    actorUserId,
    reason: reason || 'admin_revoke',
    eventType: 'revoked'
  })

  return session
}

async function revokeAllSessionsForUser({ orgId, userId, actorUserId, reason }) {
  const [rows] = await pool.execute(
    `SELECT jti FROM user_sessions
     WHERE org_id = ? AND user_id = ? AND status = 'active'`,
    [orgId, userId]
  )

  for (const row of rows) {
    await closeSessionByJti({
      jti: row.jti,
      actorUserId,
      reason: reason || 'bulk_revoke',
      eventType: 'revoked'
    })
  }
}

module.exports = {
  getSessionPolicy,
  countActiveSessions,
  createSession,
  touchSession,
  getSessionByJti,
  closeSessionByJti,
  revokeSessionById,
  revokeAllSessionsForUser
}
