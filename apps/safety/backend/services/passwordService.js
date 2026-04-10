const bcrypt = require('bcrypt')
const { pool } = require('../database/db')

function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters long'
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter'
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include at least one lowercase letter'
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include at least one number'
  }
  return null
}

async function recordPasswordHistory(orgId, userId, passwordHash) {
  await pool.execute(
    `INSERT INTO password_history (org_id, user_id, password_hash)
     VALUES (?, ?, ?)`,
    [orgId, userId, passwordHash]
  )
}

async function ensurePasswordNotReused(orgId, userId, nextPassword, currentHash) {
  if (currentHash && await bcrypt.compare(nextPassword, currentHash)) {
    return false
  }

  const [historyRows] = await pool.execute(
    `SELECT password_hash
     FROM password_history
     WHERE org_id = ? AND user_id = ?
     ORDER BY created_at DESC
     LIMIT 5`,
    [orgId, userId]
  )

  for (const row of historyRows) {
    // Compare against recent stored hashes to block password reuse.
    if (await bcrypt.compare(nextPassword, row.password_hash)) {
      return false
    }
  }
  return true
}

module.exports = {
  validatePasswordStrength,
  recordPasswordHistory,
  ensurePasswordNotReused
}
