/**
 * server.js — CP Portal Backend (MySQL async)
 *
 * Serves two separate areas:
 *   /api/admin  — Admin Console API (authenticated, internal)
 *   /api/portal — Public Portal API (anonymous + optional auth)
 */

require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const path         = require('path');
const rateLimit    = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { pool, initializeDatabase } = require('./database/db');
const { runMigrations } = require('./database/migrate');
const { attachRequestContext } = require('./middleware/requestContext');
const { inputSecurity } = require('./middleware/inputSecurity');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandler');
const { captureProcessLog } = require('./services/processLogService');

const app  = express();
const PORT = process.env.CP_PORT || 4000;
let server = null;
let schedulerHandle = null;

function applySecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  const isSecure = req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  if (isSecure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  next();
}

app.disable('x-powered-by');
app.set('trust proxy', 1);

// ── Rate limiters ─────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
  skip: (req) => req.ip === '::1' || req.ip === '127.0.0.1',
});

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Submission limit reached. Please try again later.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.CP_API_RATE_LIMIT || 600),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Please retry shortly.' },
  skip: (req) => req.ip === '::1' || req.ip === '127.0.0.1',
});

// ── Middleware ────────────────────────────────────────────────
const ALLOWED_ORIGINS = process.env.CP_CORS_ORIGINS
  ? process.env.CP_CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000',
     'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:3000',
     'http://13.205.213.128', 'https://13.205.213.128'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
}));
app.use(applySecurityHeaders);
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true, limit: '200kb', parameterLimit: 1000 }));
app.use(cookieParser());
app.use(attachRequestContext);
app.use('/api', apiLimiter);
app.use('/api', inputSecurity);

// ── Process Explorer: capture every API call ──────────────────
app.use('/api/', captureProcessLog(pool));

// Static uploads
app.use('/uploads', (req, res, next) => {
  if (req.path.startsWith('/private/')) return res.status(403).json({ error: 'Access denied.' });
  next();
}, express.static(path.join(__dirname, 'uploads')));

// ── Admin Console Routes ──────────────────────────────────────
app.use('/api/admin/auth',         authLimiter, require('./routes/admin/auth'));
app.use('/api/admin/clients',      require('./routes/admin/clients'));
app.use('/api/admin/clients/:clientId/ai-config', require('./routes/admin/aiProxy'));
app.use('/api/admin/branding',     require('./routes/admin/branding'));
app.use('/api/admin/features',     require('./routes/admin/features'));
app.use('/api/admin/content',      require('./routes/admin/content'));
app.use('/api/admin/forms',        require('./routes/admin/forms'));
app.use('/api/admin/msls',         require('./routes/admin/msls'));
app.use('/api/admin/integration',  require('./routes/admin/integration'));
app.use('/api/admin/users',        require('./routes/admin/portalUsers'));
app.use('/api/admin/templates',    require('./routes/admin/templates'));
app.use('/api/admin/chatbox',      require('./routes/admin/chatbox'));
app.use('/api/admin/gate',         require('./routes/admin/gate'));
app.use('/api/admin/compliance',   require('./routes/admin/compliance'));
app.use('/api/admin/documents',    require('./routes/admin/documents'));
app.use('/api/admin/news',         require('./routes/admin/news'));
app.use('/api/admin/safety',       require('./routes/admin/safety'));
app.use('/api/admin/audit',        require('./routes/admin/audit'));
app.use('/api/admin/submissions',  require('./routes/admin/submissions'));
app.use('/api/admin/analytics',    require('./routes/admin/analytics'));
app.use('/api/admin/reports',      require('./routes/admin/reports'));
app.use('/api/admin/admin-users',  require('./routes/admin/adminUsers'));
app.use('/api/admin/review-queue', require('./routes/admin/reviewQueue'));
app.use('/api/admin/email-config', require('./routes/admin/emailConfig'));
app.use('/api/admin/feedback',     require('./routes/admin/feedback'));
app.use('/api/admin/faq',          require('./routes/admin/faq'));
app.use('/api/admin/language',     require('./routes/admin/language'));
app.use('/api/admin/process-logs', require('./routes/admin/processExplorer'));

// ── Public Portal Routes ──────────────────────────────────────
app.use('/api/portal/config',        require('./routes/portal/config'));
app.use('/api/portal/auth',          authLimiter, require('./routes/portal/auth'));
app.use('/api/portal/submit',        submitLimiter, require('./routes/portal/submit'));
app.use('/api/portal/content',       require('./routes/portal/content'));
app.use('/api/portal/chatbox',       require('./routes/portal/chatbox'));
app.use('/api/portal/consent',       require('./routes/portal/consent'));
app.use('/api/portal/documents',     require('./routes/portal/documents'));
app.use('/api/portal/news',          require('./routes/portal/news'));
app.use('/api/portal/safety',        require('./routes/portal/safety'));
app.use('/api/portal/saved',         require('./routes/portal/saved'));
app.use('/api/portal/notifications', require('./routes/portal/notifications'));
app.use('/api/portal/preferences',   require('./routes/portal/preferences'));
app.use('/api/portal/feedback',      require('./routes/portal/feedback'));
app.use('/api/portal/faq',           require('./routes/portal/faq'));
app.use('/api/portal/bookings',      require('./routes/portal/bookings'));

// ── S5-6: Content Scheduler — auto-promote scheduled → published ──
function startContentScheduler() {
  const { notifyPortalUsers } = require('./utils/notify');
  const SCHEDULER_LOCK_KEY = 'cp-portal-content-scheduler';

  async function tick() {
    let lockAcquired = false;
    try {
      const [[lockRow]] = await pool.execute('SELECT GET_LOCK(?, 0) AS acquired', [SCHEDULER_LOCK_KEY]);
      lockAcquired = Number(lockRow?.acquired || 0) === 1;
      if (!lockAcquired) return;

      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

      // News: find and promote scheduled posts
      const [promoted] = await pool.execute(
        `SELECT id, client_id, title FROM cp_news_posts WHERE status='scheduled' AND publish_at <= ?`,
        [now]
      );
      if (promoted.length > 0) {
        await pool.execute(
          `UPDATE cp_news_posts SET status='published', updated_at=NOW() WHERE status='scheduled' AND publish_at <= ?`,
          [now]
        );
        for (const p of promoted) {
          notifyPortalUsers(p.client_id, 'news', p.title, p.id).catch(() => {});
        }
      }

      // Documents: promote scheduled docs
      await pool.execute(
        `UPDATE cp_documents SET status='published', updated_at=NOW() WHERE status='scheduled' AND publish_at <= ?`,
        [now]
      );
    } catch { /* silently ignore scheduler errors */ }
    finally {
      if (lockAcquired) {
        await pool.execute('SELECT RELEASE_LOCK(?)', [SCHEDULER_LOCK_KEY]).catch(() => {});
      }
    }
  }

  tick();
  return setInterval(tick, 60 * 1000);
}

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', async (_req, res) => {
  let dbStatus = 'ok';
  let dbVersion = null;
  try {
    const [[row]] = await pool.execute('SELECT VERSION() as v');
    dbVersion = row?.v || 'unknown';
  } catch {
    dbStatus = 'error';
  }
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: { status: dbStatus, engine: 'MySQL', version: dbVersion },
    version: process.env.npm_package_version || '1.0.0',
  });
});

// ── 404 ───────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(globalErrorHandler);

// ── Start: init DB then listen ────────────────────────────────
runMigrations()
  .then(() => initializeDatabase())
  .then(() => {
    server = app.listen(PORT, () => {
      console.log(`✅ CP Portal backend running on http://localhost:${PORT}`);
    });
    schedulerHandle = startContentScheduler();
  })
  .catch(err => {
    console.error('❌ Failed to initialize CP Portal database:', err);
    process.exit(1);
  });

function shutdown(signal) {
  console.log(`CP Portal shutdown signal received: ${signal}`);
  if (schedulerHandle) clearInterval(schedulerHandle);
  if (!server) return process.exit(0);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 1500).unref();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGUSR2', () => {
  shutdown('SIGUSR2');
  setTimeout(() => process.kill(process.pid, 'SIGUSR2'), 1600).unref();
});
