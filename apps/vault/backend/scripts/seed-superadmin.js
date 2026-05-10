require('dotenv').config()
const bcrypt = require('bcrypt')
const { pool, initializeDatabase } = require('../database/db')

async function seedSuperadmin() {
  await initializeDatabase()

  const email = String(process.env.VAULT_SUPERADMIN_EMAIL || '').trim().toLowerCase()
  const name = String(process.env.VAULT_SUPERADMIN_NAME || 'Superadmin').trim()
  const password = String(process.env.VAULT_SUPERADMIN_PASSWORD || '')
  if (!email || !password) {
    throw new Error('VAULT_SUPERADMIN_EMAIL and VAULT_SUPERADMIN_PASSWORD are required.')
  }
  const passwordHash = await bcrypt.hash(password, 12)

  const [[existing]] = await pool.execute(
    'SELECT id FROM superadmin_users WHERE email = ?',
    [email]
  )

  if (existing) {
    await pool.execute(
      'UPDATE superadmin_users SET password_hash = ?, name = ?, is_active = 1 WHERE email = ?',
      [passwordHash, name, email]
    )
    console.log(`Superadmin updated — email: ${email}`)
  } else {
    await pool.execute(
      'INSERT INTO superadmin_users (name, email, password_hash, is_active) VALUES (?, ?, ?, 1)',
      [name, email, passwordHash]
    )
    console.log(`Superadmin created — email: ${email}`)
  }

  await pool.end()
}

seedSuperadmin().catch(err => {
  console.error('Seed failed:', err.message)
  process.exit(1)
})
