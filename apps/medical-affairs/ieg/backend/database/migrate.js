require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') })

const { initializeDatabase, pool } = require('./db')

async function run() {
  await initializeDatabase()
  console.log('[ieg-backend] schema migration complete')
  await pool.end()
}

run().catch((error) => {
  console.error('[ieg-backend] schema migration failed', error)
  process.exit(1)
})
