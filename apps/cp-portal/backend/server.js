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

const app  = express();
const PORT = process.env.CP_PORT || 4000;
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

// ── Middleware ────────────────────────────────────────────────
const ALLOWED_ORIGINS = process.env.CP_CORS_ORIGINS
  ? process.env.CP_CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000',
     'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Process Explorer: capture every API call ──────────────────
app.use('/api/', (req, res, next) => {
  if (req.path.includes('/process-logs')) return next();
  const start = Date.now();

  let capturedErrorMsg = null;
  const origJson = res.json.bind(res);
  res.json = function (body) {
    if (res.statusCode >= 400 && body) {
      capturedErrorMsg = (body.error || body.message || JSON.stringify(body)).toString().slice(0, 200);
    }
    return origJson(body);
  };

  res.on('finish', () => {
    (async () => {
      try {
        const duration = Date.now() - start;
        const fullPath  = req.originalUrl.split('?')[0];
        const source    = fullPath.startsWith('/api/portal') ? 'portal' : 'admin';
        const pathPat   = fullPath.replace(/\/\d+/g, '/:id');
        const m = fullPath.match(/\/(\d+)/);
        const clientId = m ? parseInt(m[1]) : null;

        let payload = null;
        if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
          const safe = { ...req.body };
          delete safe.password; delete safe.token;
          delete safe.smtp_password; delete safe.verification_token;
          payload = JSON.stringify(safe).slice(0, 300);
        }

        await pool.execute(
          `INSERT INTO cp_process_logs
             (source, method, path, path_pattern, status_code, duration_ms,
              admin_id, portal_user_id, client_id, payload_summary, error_message)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            source, req.method, fullPath, pathPat, res.statusCode, duration,
            req.admin?.id       ?? null,
            req.portalUser?.id  ?? null,
            clientId, payload,
            res.statusCode >= 400 ? capturedErrorMsg : null,
          ]
        );
      } catch { /* never break the response */ }
    })();
  });
  next();
});

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

  async function tick() {
    try {
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
  }

  tick();
  setInterval(tick, 60 * 1000);
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
app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));

// ── Start: init DB then listen ────────────────────────────────
initializeDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ CP Portal backend running on http://localhost:${PORT}`);
    });
    startContentScheduler();
  })
  .catch(err => {
    console.error('❌ Failed to initialize CP Portal database:', err);
    process.exit(1);
  });
