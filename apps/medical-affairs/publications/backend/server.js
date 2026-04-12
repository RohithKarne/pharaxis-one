require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const express = require('express')
const cors = require('cors')
const bcrypt = require('bcrypt')
const { initializeDatabase, query } = require('./database/db')
const authRoutes = require('./routes/auth')
const adminRoutes = require('./routes/admin')
const publicationsRoutes = require('./routes/publications')
const dashboardRoutes = require('./routes/dashboard')
const auditRoutes = require('./routes/audit')
const notificationsRoutes = require('./routes/notifications')
const sprint2Routes = require('./routes/sprint2')
const { ROLES } = require('./utils/constants')
const { startOverdueMilestoneNotifier } = require('./services/milestoneNotifierService')

const app = express()
const PORT = Number(process.env.PORT || 5310)

app.use(cors())
app.use(express.json({ limit: '8mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'pharaxis-publications',
    database: 'mysql',
    timestamp: new Date().toISOString()
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/publications', publicationsRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/audit', auditRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/sprint2', sprint2Routes)

app.use((err, _req, res, _next) => {
  console.error('[publications-backend] unhandled error', err)
  const status = Number(err.statusCode || err.status || 500)
  if (err && err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Duplicate record' })
  }
  return res.status(status).json({ error: err.message || 'Internal server error' })
})

async function seedDefaultSuperadmin() {
  const adminEmail = (process.env.DEFAULT_SUPERADMIN_EMAIL || 'superadmin.publications@pharaxis.one').trim().toLowerCase()
  const adminPassword = process.env.DEFAULT_SUPERADMIN_PASSWORD || 'Admin@123'

  const existing = await query(
    `SELECT id FROM pub_users WHERE email = ? LIMIT 1`,
    [adminEmail]
  )

  if (existing[0]) return

  const hash = await bcrypt.hash(adminPassword, 10)
  await query(
    `
      INSERT INTO pub_users (tenant_id, email, full_name, password_hash, role, is_superadmin, is_active)
      VALUES (NULL, ?, 'Publications Super Admin', ?, ?, 1, 1)
    `,
    [adminEmail, hash, ROLES.SUPER_ADMIN]
  )

  console.log('[publications-backend] seeded default superadmin user')
}

async function start() {
  await initializeDatabase()
  await seedDefaultSuperadmin()

  app.listen(PORT, () => {
    const intervalMs = startOverdueMilestoneNotifier()
    console.log(`[publications-backend] running on port ${PORT}`)
    console.log(`[publications-backend] overdue milestone scan interval: ${intervalMs} ms`)
  })
}

start().catch((error) => {
  console.error('[publications-backend] failed to start', error)
  process.exit(1)
})

module.exports = app
