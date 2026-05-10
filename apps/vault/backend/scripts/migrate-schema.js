require('dotenv').config()
const { initializeDatabase } = require('../database/db')

async function run() {
  await initializeDatabase({ mode: 'migrate' })
  console.log('Vault schema migration/bootstrap complete')
}

run().catch(error => {
  console.error('Vault schema migration/bootstrap failed:', error)
  process.exit(1)
})
