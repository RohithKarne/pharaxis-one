const { pool } = require('../database/db')
const { DEFAULT_SYSTEM_CONFIG } = require('../constants')

async function ensureDefaultConfig(orgId, actorUserId = null) {
  const entries = Object.entries(DEFAULT_SYSTEM_CONFIG)
  for (const [key, value] of entries) {
    await pool.execute(
      `INSERT INTO system_config (org_id, config_key, config_value, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE config_value = config_value`,
      [orgId, key, value, actorUserId]
    )
  }
}

async function getConfigMap(orgId) {
  const [rows] = await pool.execute(
    'SELECT config_key, config_value FROM system_config WHERE org_id = ?',
    [orgId]
  )
  const map = {}
  for (const row of rows) {
    map[row.config_key] = row.config_value
  }
  return map
}

async function getConfigValue(orgId, key, fallback = null) {
  const [[row]] = await pool.execute(
    'SELECT config_value FROM system_config WHERE org_id = ? AND config_key = ?',
    [orgId, key]
  )
  if (!row) return fallback
  return row.config_value
}

async function setConfigValue(orgId, key, value, actorUserId) {
  await pool.execute(
    `INSERT INTO system_config (org_id, config_key, config_value, updated_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE config_value = VALUES(config_value), updated_by = VALUES(updated_by), updated_at = CURRENT_TIMESTAMP`,
    [orgId, key, value, actorUserId]
  )
}

module.exports = {
  ensureDefaultConfig,
  getConfigMap,
  getConfigValue,
  setConfigValue
}
