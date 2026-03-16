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
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.CP_PORT || 4000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static uploads (logos, resources, etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Admin Console Routes ──────────────────────────────────────
app.use('/api/admin/auth',        require('./routes/admin/auth'));
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

// ── Public Portal Routes ──────────────────────────────────────
app.use('/api/portal/config',     require('./routes/portal/config'));
app.use('/api/portal/auth',       require('./routes/portal/auth'));
app.use('/api/portal/submit',     require('./routes/portal/submit'));
app.use('/api/portal/content',    require('./routes/portal/content'));
app.use('/api/portal/chatbox',    require('./routes/portal/chatbox'));

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'cp-portal', ts: new Date().toISOString() });
});

// ── 404 ───────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));

app.listen(PORT, () => {
  console.log(`✅ CP Portal backend running on http://localhost:${PORT}`);
});
