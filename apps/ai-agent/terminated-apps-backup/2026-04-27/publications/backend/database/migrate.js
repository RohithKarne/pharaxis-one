require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') })

const { initializeDatabase, pool } = require('./db')

async function run() {
  await initializeDatabase()
  console.log('[publications-db] migration complete')
  await pool.end()
}

run().catch(async (error) => {
  console.error('[publications-db] migration failed', error)
  try {
    await pool.end()
  } catch (_error) {
    // ignore close error
  }
  process.exit(1)
})
