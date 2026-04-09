require('dotenv').config()
const express = require('express')
const cors = require('cors')
const path = require('path')
const { initializeDatabase } = require('./database/db')

const app = express()
const PORT = process.env.PORT || 5000

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

  app.listen(PORT, () => {
    console.log(`Pharaxis Vault backend running on port ${PORT}`)
  })
}).catch(err => {
  console.error('Failed to initialize database:', err)
  process.exit(1)
})

module.exports = app
