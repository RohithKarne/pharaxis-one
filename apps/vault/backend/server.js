require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { initializeDatabase } = require('./database/db')
const { registerExpiryAlertCron } = require('./services/expiryAlertService')
const { registerWorkflowEscalationCron } = require('./services/workflowEscalationService')
const { registerWorkflowReminderCron } = require('./services/workflowReminderService')
const { registerWorkflowWebhookRetryCron } = require('./services/workflowWebhookQueueService')
const { createRateLimiter } = require('./middleware/rateLimit')
const { attachRequestContext } = require('./middleware/requestContext')
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandlers')
const { logError, logInfo } = require('./services/logger')

const app = express()
const PORT = process.env.PORT || 5100

app.set('trust proxy', 1)
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(attachRequestContext)

const generalApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 600,
  keyFn: req => req.ip,
  errorMessage: 'Rate limit exceeded. Please retry shortly.'
})
app.use('/api', generalApiLimiter)

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
  app.use('/api/workflows', require('./routes/workflows'))

  app.use(notFoundHandler)
  app.use(globalErrorHandler)

  registerExpiryAlertCron()
  registerWorkflowEscalationCron()
  registerWorkflowReminderCron()
  registerWorkflowWebhookRetryCron()

  app.listen(PORT, () => {
    logInfo('vault_backend_started', { port: Number(PORT) })
  })
}).catch(err => {
  logError('vault_backend_init_failed', { error: err })
  process.exit(1)
})

process.on('unhandledRejection', error => {
  logError('unhandled_promise_rejection', { error })
})

process.on('uncaughtException', error => {
  logError('uncaught_exception', { error })
})

module.exports = app
