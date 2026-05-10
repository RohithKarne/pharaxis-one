require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { runMigrations } = require('./database/migrate')

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:5175',
  'http://localhost:5175',
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

function createRateLimiter({
  windowMs = 60_000,
  maxRequests = 120,
  keyFn = req => req.ip
} = {}) {
  const bucket = new Map()

  setInterval(() => {
    const now = Date.now()
    for (const [key, value] of bucket.entries()) {
      if (value.windowStart + windowMs < now) bucket.delete(key)
    }
  }, Math.max(15_000, windowMs)).unref()

  return (req, res, next) => {
    const key = String(keyFn(req) || 'unknown')
    const now = Date.now()
    const current = bucket.get(key)

    if (!current || current.windowStart + windowMs <= now) {
      bucket.set(key, { windowStart: now, count: 1 })
      return next()
    }

    current.count += 1
    if (current.count > maxRequests) {
      const retryAfterSeconds = Math.ceil((current.windowStart + windowMs - now) / 1000)
      res.setHeader('Retry-After', String(Math.max(1, retryAfterSeconds)))
      return res.status(429).json({ error: 'Too many requests. Please retry shortly.' })
    }

    return next()
  }
}

const app = express()
const PORT = Number(process.env.PORT || 6000)
const allowAllOrigins = String(process.env.CORS_ALLOW_ALL || '').toLowerCase() === 'true'
if (allowAllOrigins && process.env.NODE_ENV === 'production') {
  throw new Error('CORS_ALLOW_ALL cannot be enabled in production.')
}
const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS)
const generalApiLimiter = createRateLimiter({
  windowMs: Number.parseInt(process.env.RATE_LIMIT_API_WINDOW_MS || '60000', 10),
  maxRequests: Number.parseInt(process.env.RATE_LIMIT_API_MAX || '180', 10)
})
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
  await runMigrations()

  app.use('/api/v1/agent', generalApiLimiter)
  app.use('/api/v1/agent/superadmin', require('./middleware/auth').authenticateSuperadmin, require('./routes/admin/superadmin'))
  app.use('/api/v1/agent', require('./routes/agent'))
  app.use('/api/v1/agent/internal', require('./routes/internal/aiConfig'))
  app.use('/api/v1/agent/admin', adminRoutes)
  app.use('/api/v1/agent/config', adminRoutes)
  app.use('/api/v1/agent/usage', require('./routes/admin/usageLogs'))
  app.use('/api/v1/agent/templates', templatesRoutes)

  server = app.listen(PORT, () => {
    console.log(`Pharaxis AI-Agent backend running on port ${PORT}`)
  })
  server.on('error', err => {
    console.error('AI-Agent runtime error:', err)
    process.exit(1)
  })
}

startServer().catch(err => {
  console.error('Failed to initialize database:', err)
  process.exit(1)
})

function shutdown(signal) {
  console.log(`AI-Agent shutdown signal received: ${signal}`)
  if (!server) return process.exit(0)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 1500).unref()
}

process.on('unhandledRejection', err => {
  console.error('Unhandled promise rejection:', err)
})

process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err)
})

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
process.once('SIGUSR2', () => {
  shutdown('SIGUSR2')
  setTimeout(() => process.kill(process.pid, 'SIGUSR2'), 1600).unref()
})

module.exports = app
