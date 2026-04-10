require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { initializeDatabase } = require('./database/db')
const { registerExpiryAlertCron } = require('./services/expiryAlertService')

const app = express()
const PORT = process.env.PORT || 5100

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', app: 'pharaxis-vault', time: new Date().toISOString() })
})

// Initialize DB then start server
initializeDatabase().then(() => {
  app.use('/api/auth', require('./routes/auth'))
  app.use('/api/superadmin', require('./routes/superadminAuth'))
  app.use('/api/users', require('./routes/users'))
  app.use('/api/taxonomy', require('./routes/taxonomy'))
  app.use('/api/lifecycle', require('./routes/lifecycle'))
  app.use('/api/folders', require('./routes/folders'))
  app.use('/api/upload', require('./routes/upload'))
  app.use('/api/content', require('./routes/content'))
  app.use('/api/search', require('./routes/search'))
  app.use('/api/audit', require('./routes/audit'))
  app.use('/api/admin', require('./routes/admin'))
  app.use('/api/slots', require('./routes/slots'))
  app.use('/api/dossiers', require('./routes/dossiers'))

  registerExpiryAlertCron()

  app.listen(PORT, () => {
    console.log(`Pharaxis Vault backend running on port ${PORT}`)
  })
}).catch(err => {
  console.error('Failed to initialize database:', err)
  process.exit(1)
})

module.exports = app
