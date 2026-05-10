const { pool } = require('../database/db')
const { runMigrations } = require('../database/migrate')

runMigrations()
  .catch(error => {
    console.error('CP Portal migration failed:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
