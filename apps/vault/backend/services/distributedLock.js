const { pool } = require('../database/db')
const { logInfo, logWarn } = require('./logger')

function normalizeLockName(lockName) {
  return String(lockName || '')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, '_')
    .slice(0, 64)
}

async function runWithDbLock(lockName, timeoutSeconds, taskFn) {
  const normalized = normalizeLockName(lockName)
  if (!normalized) {
    throw new Error('A valid lock name is required')
  }
  const timeout = Math.max(0, Number(timeoutSeconds) || 0)

  const connection = await pool.getConnection()
  let acquired = false
  try {
    const [[lockRow]] = await connection.execute('SELECT GET_LOCK(?, ?) AS acquired', [normalized, timeout])
    acquired = Number(lockRow?.acquired || 0) === 1
    if (!acquired) {
      logInfo('distributed_lock_skipped', { lock_name: normalized })
      return { skipped: true, reason: 'lock_not_acquired' }
    }

    const result = await taskFn()
    return { skipped: false, result }
  } catch (error) {
    logWarn('distributed_lock_error', { lock_name: normalized, error: error?.message || String(error) })
    throw error
  } finally {
    if (acquired) {
      try {
        await connection.execute('DO RELEASE_LOCK(?)', [normalized])
      } catch (releaseError) {
        logWarn('distributed_lock_release_failed', {
          lock_name: normalized,
          error: releaseError?.message || String(releaseError)
        })
      }
    }
    connection.release()
  }
}

module.exports = {
  runWithDbLock
}
