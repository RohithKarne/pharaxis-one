require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })

const express = require('express')
const cors = require('cors')
const bcrypt = require('bcrypt')
const { initializeDatabase, query } = require('./database/db')
const { seedDefaultRulesIfMissing } = require('./services/complianceService')

const authRoutes = require('./routes/auth')
const usersRoutes = require('./routes/users')
const modulesRoutes = require('./routes/modules')
const tasksRoutes = require('./routes/tasks')
const workflowRoutes = require('./routes/workflows')
const documentsRoutes = require('./routes/documents')
const notificationsRoutes = require('./routes/notifications')
const approvalsRoutes = require('./routes/approvals')
const complianceRoutes = require('./routes/compliance')
const disbursementsRoutes = require('./routes/disbursements')
const taxonomyRoutes = require('./routes/taxonomy')
const grantsRoutes = require('./routes/grants')
const iitRoutes = require('./routes/iit')
const eapRoutes = require('./routes/eap')
const integrationsRoutes = require('./routes/integrations')
const platformRoutes = require('./routes/platform')
const externalPortalRoutes = require('./routes/externalPortal')
const auditRoutes = require('./routes/audit')

const app = express()
const PORT = Number(process.env.PORT || 5300)

app.use(cors())
app.use(express.json({ limit: '8mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'pharaxis-ieg',
    sprint: 'sprint2',
    timestamp: new Date().toISOString()
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/modules', modulesRoutes)
app.use('/api/tasks', tasksRoutes)
app.use('/api/workflows', workflowRoutes)
app.use('/api/documents', documentsRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/approvals', approvalsRoutes)
app.use('/api/compliance', complianceRoutes)
app.use('/api/disbursements', disbursementsRoutes)
app.use('/api/taxonomy', taxonomyRoutes)
app.use('/api/grants', grantsRoutes)
app.use('/api/iit', iitRoutes)
app.use('/api/eap', eapRoutes)
app.use('/api/integrations', integrationsRoutes)
app.use('/api/platform', platformRoutes)
app.use('/api/external', externalPortalRoutes)
app.use('/api/audit', auditRoutes)

app.use((err, _req, res, _next) => {
  console.error('[ieg-backend] unhandled error', err)
  const status = Number(err.statusCode || err.status || 500)
  res.status(status).json({ error: err.message || 'Internal server error' })
})

async function seedSuperadminAndDefaults() {
  const adminEmail = (process.env.DEFAULT_SUPERADMIN_EMAIL || 'superadmin.ieg@pharaxis.one').toLowerCase().trim()
  const adminPassword = process.env.DEFAULT_SUPERADMIN_PASSWORD || 'Admin@123'

  const existing = await query(`SELECT id FROM ieg_users WHERE email = $1`, [adminEmail])
  let superadminId

  if (!existing.rows[0]) {
    const hash = await bcrypt.hash(adminPassword, 10)
    const created = await query(
      `
        INSERT INTO ieg_users (email, full_name, password_hash, role, is_superadmin)
        VALUES ($1, 'IEG Superadmin', $2, 'superadmin', TRUE)
        RETURNING id
      `,
      [adminEmail, hash]
    )
    superadminId = created.rows[0].id
    console.log('[ieg-backend] seeded default superadmin user')
  } else {
    superadminId = existing.rows[0].id
  }

  for (const moduleKey of ['grants', 'iit', 'eap']) {
    await query(
      `INSERT INTO ieg_user_modules (user_id, module_key) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [superadminId, moduleKey]
    )
  }

  await seedDefaultRulesIfMissing()

  const approvalSeed = await query('SELECT COUNT(*)::int AS count FROM ieg_approval_matrix')
  if (approvalSeed.rows[0].count === 0) {
    await query(
      `
        INSERT INTO ieg_approval_matrix
        (module_key, request_type, geography, min_value, max_value, approver_chain, created_by)
        VALUES
        ('grants', 'standard_grant', 'US', 0, 500000, $1::jsonb, $2),
        ('iit', 'standard_iit', 'US', 0, 500000, $3::jsonb, $2),
        ('eap', 'standard_eap', 'US', 0, 500000, $4::jsonb, $2)
      `,
      [
        JSON.stringify([{ role: 'medical_reviewer' }, { role: 'committee_member' }, { role: 'admin' }]),
        superadminId,
        JSON.stringify([{ role: 'medical_reviewer' }, { role: 'compliance_reviewer' }, { role: 'committee_member' }]),
        JSON.stringify([{ role: 'medical_reviewer' }, { role: 'compliance_reviewer' }, { role: 'study_operations_manager' }, { role: 'admin' }])
      ]
    )
  }
}

async function start() {
  await initializeDatabase()
  await seedSuperadminAndDefaults()

  app.listen(PORT, () => {
    console.log(`[ieg-backend] running on port ${PORT}`)
  })
}

start().catch((error) => {
  console.error('[ieg-backend] failed to start', error)
  process.exit(1)
})

module.exports = app
