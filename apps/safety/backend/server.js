require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { initializeDatabase } = require('./database/db')

const app = express()
const PORT = Number(process.env.PORT || 5200)

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'pharaxis-safety',
    time: new Date().toISOString()
  })
})

async function start() {
  await initializeDatabase()

  app.use('/api/auth', require('./routes/auth'))
  app.use('/api/orgs', require('./routes/orgs'))
  app.use('/api/clients', require('./routes/clients'))
  app.use('/api/users', require('./routes/users'))
  app.use('/api/products', require('./routes/products'))
  app.use('/api/cases', require('./routes/cases'))
  app.use('/api/case-config', require('./routes/caseConfig'))
  app.use('/api/system-config', require('./routes/systemConfig'))
  app.use('/api/sessions', require('./routes/sessions'))
  app.use('/api/audit', require('./routes/audit'))

  app.use((error, _req, res, _next) => {
    console.error('Unhandled error:', error)
    res.status(500).json({ error: 'Internal server error' })
  })

  app.listen(PORT, () => {
    console.log(`Pharaxis Safety backend running on port ${PORT}`)
  })
}

start().catch((error) => {
  console.error('Failed to start Pharaxis Safety backend:', error)
  process.exit(1)
})

module.exports = app
