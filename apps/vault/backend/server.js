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
const { inputSecurity } = require('./middleware/inputSecurity')
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandlers')
const { logError, logInfo } = require('./services/logger')

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://13.205.213.128',
  'https://13.205.213.128'
])

function parseAllowedOrigins(rawOrigins) {
  const origins = String(rawOrigins || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
  return origins.length ? new Set(origins) : DEFAULT_ALLOWED_ORIGINS
}

function isAllowAllOriginsEnabled() {
  return String(process.env.CORS_ALLOW_ALL || '').toLowerCase() === 'true'
}

function applySecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none')

  const isSecure = req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https'
  if (isSecure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  }

  next()
}

const app = express()
const PORT = process.env.PORT || 5100
const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS)
const allowAllOrigins = isAllowAllOriginsEnabled()
if (allowAllOrigins && process.env.NODE_ENV === 'production') {
  throw new Error('CORS_ALLOW_ALL cannot be enabled in production.')
}
let server

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowAllOrigins || allowedOrigins.has(origin)) return callback(null, true)
    return callback(new Error(`CORS origin not allowed: ${origin}`))
  },
  credentials: true
}))
app.use(applySecurityHeaders)
app.use(express.json({ limit: process.env.INPUT_JSON_LIMIT || '1mb' }))
app.use(express.urlencoded({
  extended: true,
  limit: process.env.INPUT_URLENCODED_LIMIT || '1mb',
  parameterLimit: Number.parseInt(process.env.INPUT_PARAM_LIMIT || '1000', 10)
}))
app.use(attachRequestContext)
app.use('/api', inputSecurity)

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

  server = app.listen(PORT, () => {
    logInfo('vault_backend_started', { port: Number(PORT) })
  })
  server.on('error', error => {
    logError('vault_backend_runtime_error', { error })
    process.exit(1)
  })
}).catch(err => {
  logError('vault_backend_init_failed', { error: err })
  process.exit(1)
})

function shutdown(signal) {
  logInfo('vault_backend_shutdown_started', { signal })
  if (!server) return process.exit(0)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 1500).unref()
}

process.on('unhandledRejection', error => {
  logError('unhandled_promise_rejection', { error })
})

process.on('uncaughtException', error => {
  logError('uncaught_exception', { error })
})

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGUSR2', () => {
  shutdown('SIGUSR2')
  setTimeout(() => process.kill(process.pid, 'SIGUSR2'), 1600).unref()
})

module.exports = app
