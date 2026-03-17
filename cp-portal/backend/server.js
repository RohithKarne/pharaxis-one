/**
 * server.js — CP Portal Backend
 *
 * Serves two separate areas:
 *   /api/admin  — Admin Console API (authenticated, internal)
 *   /api/portal — Public Portal API (anonymous + optional auth)
 *
 * Runs independently of MIMS. MIMS integration is a configurable adapter.
 */

require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const rateLimit = require('express-rate-limit');
const db        = require('./database/db');

const app  = express();
const PORT = process.env.CP_PORT || 4000;
app.set('trust proxy', 1);

// ── Rate limiters ─────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Submission limit reached. Please try again later.' },
});

// ── Middleware ────────────────────────────────────────────────
const ALLOWED_ORIGINS = process.env.CP_CORS_ORIGINS
  ? process.env.CP_CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, mobile apps, curl)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static uploads — public assets (branding, logos) only.
// SEC-04: Block direct access to private document files; those are served via authenticated API.
app.use('/uploads', (req, res, next) => {
  if (req.path.startsWith('/private/')) return res.status(403).json({ error: 'Access denied.' });
  next();
}, express.static(path.join(__dirname, 'uploads')));

// ── Admin Console Routes ──────────────────────────────────────
app.use('/api/admin/auth',        authLimiter, require('./routes/admin/auth'));
app.use('/api/admin/clients',     require('./routes/admin/clients'));
app.use('/api/admin/branding',    require('./routes/admin/branding'));
app.use('/api/admin/features',    require('./routes/admin/features'));
app.use('/api/admin/content',     require('./routes/admin/content'));
app.use('/api/admin/forms',       require('./routes/admin/forms'));
app.use('/api/admin/msls',        require('./routes/admin/msls'));
app.use('/api/admin/integration', require('./routes/admin/integration'));
app.use('/api/admin/users',       require('./routes/admin/portalUsers'));
app.use('/api/admin/templates',   require('./routes/admin/templates'));
app.use('/api/admin/chatbox',     require('./routes/admin/chatbox'));
app.use('/api/admin/gate',        require('./routes/admin/gate'));
app.use('/api/admin/compliance',  require('./routes/admin/compliance'));
app.use('/api/admin/documents',   require('./routes/admin/documents'));
app.use('/api/admin/news',        require('./routes/admin/news'));
app.use('/api/admin/safety',      require('./routes/admin/safety'));

// ── Public Portal Routes ──────────────────────────────────────
app.use('/api/portal/config',     require('./routes/portal/config'));
app.use('/api/portal/auth',       authLimiter, require('./routes/portal/auth'));
app.use('/api/portal/submit',     submitLimiter, require('./routes/portal/submit'));
app.use('/api/portal/content',    require('./routes/portal/content'));
app.use('/api/portal/chatbox',    require('./routes/portal/chatbox'));
app.use('/api/portal/consent',    require('./routes/portal/consent'));
app.use('/api/portal/documents',  require('./routes/portal/documents'));
app.use('/api/portal/news',       require('./routes/portal/news'));
app.use('/api/portal/safety',     require('./routes/portal/safety'));

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  let dbStatus = 'ok';
  let dbVersion = null;
  try {
    const row = db.prepare('SELECT sqlite_version() as v').get();
    dbVersion = row?.v || 'unknown';
  } catch (e) {
    dbStatus = 'error';
  }
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: { status: dbStatus, engine: 'SQLite', version: dbVersion },
    version: process.env.npm_package_version || '1.0.0',
  });
});

// ── 404 ───────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));

app.listen(PORT, () => {
  console.log(`✅ CP Portal backend running on http://localhost:${PORT}`);
});
