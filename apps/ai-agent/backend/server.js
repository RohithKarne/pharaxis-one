require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { initializeDatabase } = require('./database/db')

const app = express()
const PORT = 6000

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/api/v1/agent/health', (_req, res) => {
  res.json({ status: 'ok', service: 'ai-agent' })
})

const adminRoutes = express.Router()
adminRoutes.use('/keys', require('./routes/admin/apiKeys'))
adminRoutes.use('/provider', require('./routes/admin/providerConfig'))
adminRoutes.use('/usage', require('./routes/admin/usageLogs'))

const templatesRoutes = express.Router()

async function startServer() {
  await initializeDatabase()

  app.use('/api/v1/agent/superadmin', require('./routes/admin/superadmin'))
  app.use('/api/v1/agent', require('./routes/agent'))
  app.use('/api/v1/agent/internal', require('./routes/internal/aiConfig'))
  app.use('/api/v1/agent/admin', adminRoutes)
  app.use('/api/v1/agent/config', adminRoutes)
  app.use('/api/v1/agent/usage', require('./routes/admin/usageLogs'))
  app.use('/api/v1/agent/templates', templatesRoutes)

  app.listen(PORT, () => {
    console.log(`Pharaxis AI-Agent backend running on port ${PORT}`)
  })
}

startServer().catch(err => {
  console.error('Failed to initialize database:', err)
  process.exit(1)
})

module.exports = app
