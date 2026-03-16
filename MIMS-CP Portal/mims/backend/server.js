/**
 * server.js — Express Application Entry Point
 *
 * WHAT THIS FILE DOES:
 * - Creates the Express web server
 * - Registers middleware (cors, JSON parsing)
 * - Mounts all route handlers under their base paths
 * - Serves the frontend HTML/CSS/JS files as static assets
 * - Starts listening for requests on a port
 *
 * HOW THE REQUEST FLOW WORKS:
 *   Browser sends request
 *     → Express receives it
 *       → Middleware runs (cors, json parser)
 *         → Router matches the URL
 *           → Controller handles it
 *             → Model queries the database
 *               → Response sent back to browser
 */

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
// Some environments disallow binding to 0.0.0.0; stick to localhost for dev.
const HOST = process.env.HOST || '127.0.0.1';

// ─── Middleware ─────────────────────────────────────────────────────────────

// CORS — allows the frontend (served from the same origin) to call the API
// In production, you'd restrict this to specific domains
app.use(cors());

// Parse incoming JSON request bodies (needed for login/register POST requests)
app.use(express.json());

// Parse URL-encoded form data (for HTML form submissions)
app.use(express.urlencoded({ extended: true }));

// ─── Serve Static Frontend Files ─────────────────────────────────────────────
// This tells Express to serve all files in the /frontend folder
// When the browser goes to http://localhost:3000 it gets index.html automatically
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/inbox', require('./routes/inbox'));
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
});

// Admin Console routes (admin role required)
app.use('/api/admin/orgs', require('./routes/admin/orgs'));
app.use('/api/admin', require('./routes/admin/serviceLogs'));
app.use('/api/admin', require('./routes/admin/systemActivity'));
app.use('/api/admin', require('./routes/admin/config'));
// Superadmin routes (superadmin role required)
app.use('/api/superadmin', require('./routes/superadmin'));

// ─── Email Poller ────────────────────────────────────────────────────────────
const { startPoller, stopPoller } = require('./services/emailPoller');
startPoller();

// ─── Start Server ─────────────────────────────────────────────────────────────
const server = app.listen(PORT, HOST, () => {
  console.log('');
  console.log('🏥 MIMS — Medical Information Management System');
  console.log(`🚀 Server running at: http://${HOST}:${PORT}`);
  console.log(`📁 Serving frontend from: ${path.join(__dirname, '../frontend')}`);
  console.log('');
});

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`❌ Port already in use: http://${HOST}:${PORT}`)
    console.error('   Stop the other server process (or change PORT) and restart.')
    process.exit(1)
  }
  console.error('❌ Server error:', err)
  process.exit(1)
})

function shutdown(signal) {
  console.log(`\n🛑 Shutting down (${signal})...`)
  try { stopPoller() } catch (_) {}
  server.close(() => process.exit(0))
  // Force-exit if close hangs (e.g. open sockets)
  setTimeout(() => process.exit(0), 1500).unref()
}

process.once('SIGINT', () => shutdown('SIGINT'))
process.once('SIGTERM', () => shutdown('SIGTERM'))
// Nodemon restart signal: ensure we release the port cleanly.
process.once('SIGUSR2', () => {
  shutdown('SIGUSR2')
  setTimeout(() => process.kill(process.pid, 'SIGUSR2'), 1600).unref()
})

// Export for testing (Jest + Supertest)
module.exports = { app }
