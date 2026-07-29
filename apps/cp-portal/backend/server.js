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
const log = require('./utils/logger');
const { makeStore } = require('./utils/rateLimitStore');

const app  = express();
const PORT = process.env.CP_PORT || 4000;
let server = null;
let schedulerHandle = null;
let mimsCloseSyncHandle = null;
let mimsRetryHandle = null;

function applySecurityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  // Baseline CSP — restrictive on the vectors that don't affect the SPA's own
  // scripts/styles: no plugins, no framing by other origins, no <base> hijack.
  res.setHeader('Content-Security-Policy', "object-src 'none'; base-uri 'self'; frame-ancestors 'self'");

  const isSecure = req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  if (isSecure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  next();
}

app.disable('x-powered-by');
app.set('trust proxy', 1);

// ── Rate limiters ─────────────────────────────────────────────
// SEC: only skip throttling for genuine local development. Previously this
// skipped whenever req.ip was loopback — but with `trust proxy` set, req.ip is
// derived from the client-controlled X-Forwarded-For header, so an attacker
// could send `X-Forwarded-For: 127.0.0.1` to disable auth rate limiting and
// brute-force logins. Gate the bypass on NODE_ENV instead of the request IP.
const isDevEnv = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
  store: makeStore(),
  skip: () => isDevEnv,
});

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Submission limit reached. Please try again later.' },
  store: makeStore(),
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.CP_API_RATE_LIMIT || 600),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded. Please retry shortly.' },
  store: makeStore(),
  skip: () => isDevEnv,
});

// ── Middleware ────────────────────────────────────────────────
const ALLOWED_ORIGINS = process.env.CP_CORS_ORIGINS
  ? process.env.CP_CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000',
     'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:3000',
     // SEC: cleartext-HTTP origin dropped — session cookies must never traverse
     // an unencrypted origin. Serve deployed environments over HTTPS only.
     'https://13.205.213.128'];

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

// Static uploads
app.use('/uploads', (req, res, next) => {
  if (req.path.startsWith('/private/')) return res.status(403).json({ error: 'Access denied.' });
  // SEC: defence-in-depth — any file that is ever served statically is fully
  // sandboxed and cannot execute script, even if a disguised HTML/SVG slips in.
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(path.join(__dirname, 'uploads')));

// ── Admin Console Routes ──────────────────────────────────────
app.use('/api/admin/auth',         authLimiter, require('./routes/admin/auth'));
app.use('/api/admin/clients',      require('./routes/admin/clients'));
app.use('/api/admin/branding',     require('./routes/admin/branding'));
app.use('/api/admin/features',     require('./routes/admin/features'));
app.use('/api/admin/content',      require('./routes/admin/content'));
app.use('/api/admin/forms',        require('./routes/admin/forms'));
app.use('/api/admin/msls',         require('./routes/admin/msls'));
app.use('/api/admin/integration',  require('./routes/admin/integration'));
app.use('/api/admin/sso',          require('./routes/admin/sso'));
app.use('/api/admin/users',        require('./routes/admin/portalUsers'));
app.use('/api/admin/templates',    require('./routes/admin/templates'));
app.use('/api/admin/chatbox',      require('./routes/admin/chatbox'));
app.use('/api/admin/gate',         require('./routes/admin/gate'));
app.use('/api/admin/compliance',   require('./routes/admin/compliance'));
app.use('/api/admin/documents',    require('./routes/admin/documents'));
app.use('/api/admin/news',         require('./routes/admin/news'));
app.use('/api/admin/safety',       require('./routes/admin/safety'));
app.use('/api/admin/audit',        require('./routes/admin/audit'));
app.use('/api/admin/trials',       require('./routes/admin/trials'));
app.use('/api/admin/training',     require('./routes/admin/training'));
app.use('/api/admin/submissions',  require('./routes/admin/submissions'));
app.use('/api/admin/analytics',    require('./routes/admin/analytics'));
app.use('/api/admin/admin-users',  require('./routes/admin/adminUsers'));
app.use('/api/admin/review-queue', require('./routes/admin/reviewQueue'));
app.use('/api/admin/email-config', require('./routes/admin/emailConfig'));
app.use('/api/admin/feedback',     require('./routes/admin/feedback'));
app.use('/api/admin/faq',          require('./routes/admin/faq'));
app.use('/api/admin/language',     require('./routes/admin/language'));

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
app.use('/api/portal/search',        require('./routes/portal/search'));
app.use('/api/portal/personal',      require('./routes/portal/personal'));
app.use('/api/portal/bookings',      require('./routes/portal/bookings'));

// ── S5-6: Content Scheduler — auto-promote scheduled → published ──
// CP-14: returns the tick fn (no side effects) so it can be driven either by the
// in-process interval (dev/single instance) or an external cron (stateless/HA).
function createContentScheduler() {
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

      // Weekly digest — fire only during the configured window (default Mon 08:00 server time).
      // sendAllDigests() dedups per ISO week, so it sends at most once even though the
      // window spans ~60 ticks.
      const nowDate = new Date();
      const digestDay  = Number(process.env.CP_DIGEST_DAY  ?? 1);   // 0=Sun .. 6=Sat
      const digestHour = Number(process.env.CP_DIGEST_HOUR ?? 8);
      if (nowDate.getDay() === digestDay && nowDate.getHours() === digestHour) {
        const { sendAllDigests } = require('./utils/digest');
        await sendAllDigests().catch(() => {});
      }
    } catch { /* silently ignore scheduler errors */ }
    finally {
      if (lockAcquired) {
        await pool.execute('SELECT RELEASE_LOCK(?)', [SCHEDULER_LOCK_KEY]).catch(() => {});
      }
    }
  }

  return tick;
}

// Build the tick once (no side effects until invoked).
const schedulerTick = createContentScheduler();

// CP-14: internal cron endpoint so an external scheduler (Azure Cron / container
// job) can drive the tick when the API runs stateless/multi-instance. Guarded by
// a shared secret; the MySQL advisory lock inside tick() still prevents overlap.
app.post('/api/internal/cron/scheduler-tick', async (req, res) => {
  const secret = process.env.CP_CRON_SECRET;
  if (!secret || req.get('x-cron-secret') !== secret) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  try { await schedulerTick(); res.json({ ok: true }); }
  catch (err) { log.error('scheduler.cron.failed', { err }); res.status(500).json({ error: 'Scheduler tick failed.' }); }
});

// ── B1: MIMS close-sync poller ───────────────────────────────
// Polls MIMS for the status of already-synced submissions and auto-closes the CP
// inquiry when the linked case is Closed. Same lock/cron shape as the content
// scheduler so it is safe under multi-instance and can be driven by external cron.
function createMimsCloseSyncScheduler() {
  const { pollOnce } = require('./services/mimsCloseSync');
  const LOCK_KEY = 'cp-portal-mims-close-sync';
  async function tick() {
    let lockAcquired = false;
    try {
      const [[lockRow]] = await pool.execute('SELECT GET_LOCK(?, 0) AS acquired', [LOCK_KEY]);
      lockAcquired = Number(lockRow?.acquired || 0) === 1;
      if (!lockAcquired) return;
      await pollOnce();
    } catch { /* silently ignore poller errors */ }
    finally {
      if (lockAcquired) await pool.execute('SELECT RELEASE_LOCK(?)', [LOCK_KEY]).catch(() => {});
    }
  }
  return tick;
}
const mimsCloseSyncTick = createMimsCloseSyncScheduler();

app.post('/api/internal/cron/mims-close-sync', async (req, res) => {
  const secret = process.env.CP_CRON_SECRET;
  if (!secret || req.get('x-cron-secret') !== secret) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  try { await mimsCloseSyncTick(); res.json({ ok: true }); }
  catch (err) { log.error('mims-close-sync.cron.failed', { err }); res.status(500).json({ error: 'Close-sync tick failed.' }); }
});

// ── R1: MIMS sync retry (exponential backoff) ────────────────
function createMimsRetryScheduler() {
  const { retryOnce } = require('./services/mimsRetry');
  const LOCK_KEY = 'cp-portal-mims-retry';
  async function tick() {
    let lockAcquired = false;
    try {
      const [[lockRow]] = await pool.execute('SELECT GET_LOCK(?, 0) AS acquired', [LOCK_KEY]);
      lockAcquired = Number(lockRow?.acquired || 0) === 1;
      if (!lockAcquired) return;
      await retryOnce();
    } catch { /* silently ignore retry errors */ }
    finally {
      if (lockAcquired) await pool.execute('SELECT RELEASE_LOCK(?)', [LOCK_KEY]).catch(() => {});
    }
  }
  return tick;
}
const mimsRetryTick = createMimsRetryScheduler();

app.post('/api/internal/cron/mims-retry', async (req, res) => {
  const secret = process.env.CP_CRON_SECRET;
  if (!secret || req.get('x-cron-secret') !== secret) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  try { await mimsRetryTick(); res.json({ ok: true }); }
  catch (err) { log.error('mims-retry.cron.failed', { err }); res.status(500).json({ error: 'Retry tick failed.' }); }
});

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
      log.info('server.started', { port: PORT, env: process.env.NODE_ENV || 'development', sentry: log.sentryEnabled() });
      console.log(`✅ CP Portal backend running on http://localhost:${PORT}`);
    });
    // CP-14: run the in-process interval unless an external cron drives the tick.
    if (process.env.CP_SCHEDULER === 'external') {
      log.info('scheduler.mode', { mode: 'external-cron' });
    } else {
      schedulerTick();
      schedulerHandle = setInterval(schedulerTick, 60 * 1000);
      // B1: close-sync poller (configurable, default every 5 min)
      mimsCloseSyncTick();
      mimsCloseSyncHandle = setInterval(mimsCloseSyncTick, Number(process.env.MIMS_CLOSE_SYNC_INTERVAL_MS || 5 * 60 * 1000));
      // R1: retry poller (configurable, default every 60s; backoff gates actual work)
      mimsRetryTick();
      mimsRetryHandle = setInterval(mimsRetryTick, Number(process.env.MIMS_RETRY_INTERVAL_MS || 60 * 1000));
      log.info('scheduler.mode', { mode: 'in-process' });
    }
  })
  .catch(err => {
    log.error('server.init.failed', { err });
    console.error('❌ Failed to initialize CP Portal database:', err);
    process.exit(1);
  });

function shutdown(signal) {
  console.log(`CP Portal shutdown signal received: ${signal}`);
  if (schedulerHandle) clearInterval(schedulerHandle);
  if (mimsCloseSyncHandle) clearInterval(mimsCloseSyncHandle);
  if (mimsRetryHandle) clearInterval(mimsRetryHandle);
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
