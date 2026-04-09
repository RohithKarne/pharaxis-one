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
const pool = require('./database/db');
const { authenticate } = require('./middleware/auth');
const { router: processExplorerRouter } = require('./routes/admin/processExplorer');
const {
  inferModule,
  deriveEntity,
  deriveEventType,
  shouldCaptureBusinessEvent,
  emitProcessEvent,
} = require('./services/processExplorerService');
const { startSchemaTracker, stopSchemaTracker } = require('./services/schemaTracker');
const { startScheduler, stopScheduler } = require('./services/scheduler');
const rateLimit = require('express-rate-limit');
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again after 15 minutes.' },
});

const app = express();
const PORT = process.env.PORT || 3000;
// Some environments disallow binding to 0.0.0.0; stick to localhost for dev.
const HOST = process.env.HOST || '127.0.0.1';

const API_LATEST_VERSION = 'v1';
const API_SUPPORTED_VERSIONS = ['v1'];
const API_VERSION_CONTRACT_DATE = '2026-04-07';

function getApiVersionContract(requestedVersion = API_LATEST_VERSION) {
  return {
    requested_version: requestedVersion,
    latest_version: API_LATEST_VERSION,
    supported_versions: API_SUPPORTED_VERSIONS,
    contract_date: API_VERSION_CONTRACT_DATE,
    status: 'active',
    notes: 'Use /api/v1/* for versioned integrations. /api/* remains backward-compatible for existing clients.',
  };
}

// ─── Middleware ─────────────────────────────────────────────────────────────

// CORS — allows the frontend (served from the same origin) to call the API
// In production, you'd restrict this to specific domains
app.use(cors());

// Parse incoming JSON request bodies (needed for login/register POST requests)
app.use(express.json());

// Parse URL-encoded form data (for HTML form submissions)
app.use(express.urlencoded({ extended: true }));

// Process Explorer telemetry — captures all API traffic for automatic flow visibility.
let lastProcessLogPurgeAt = 0;
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/admin/process-logs')) return next();

  const start = Date.now();
  let capturedErrorMessage = null;
  const originalJson = res.json.bind(res);
  res.json = function patchedJson(body) {
    if (res.statusCode >= 400 && body) {
      capturedErrorMessage = String(body.error || body.message || '').slice(0, 255) || null;
    }
    return originalJson(body);
  };

  res.on('finish', () => {
    (async () => {
      try {
        const now = Date.now();
        if (now - lastProcessLogPurgeAt > 5 * 60 * 1000) {
          lastProcessLogPurgeAt = now;
          await pool.execute('DELETE FROM mims_process_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)');
        }

        if (!shouldCaptureBusinessEvent(req, res)) return;

        const pathOnly = req.originalUrl.split('?')[0];
        const payload = req.body && typeof req.body === 'object' && Object.keys(req.body).length
          ? req.body
          : null;

        await emitProcessEvent({
          orgId: req.user?.orgId ?? null,
          sourceModule: inferModule(pathOnly),
          method: req.method,
          path: pathOnly,
          statusCode: res.statusCode,
          durationMs: Date.now() - start,
          eventType: deriveEventType(req.method),
          entityType: deriveEntity(pathOnly),
          summary: `${deriveEventType(req.method).toUpperCase()} ${deriveEntity(pathOnly)} via ${pathOnly}`,
          payload,
          errorMessage: res.statusCode >= 400 ? capturedErrorMessage : null,
        });
      } catch (_) {
        // Log capture is best-effort only.
      }
    })();
  });
  next();
});

// ─── Admin Console — Extended Routes ────────────────────────────────────────
app.use('/api/admin', require('./routes/admin/picklists'));
app.use('/api/admin', require('./routes/admin/fieldSetup'));
app.use('/api/admin', require('./routes/admin/securityGroups'));
app.use('/api/admin', require('./routes/admin/contacts'));
app.use('/api/admin', require('./routes/admin/siteConfig'));
app.use('/api/admin', require('./routes/admin/productDictionary'));
app.use('/api/admin', require('./routes/admin/caseNumbering'));
app.use('/api/admin', require('./routes/admin/caseFormDefinition'));
app.use('/api/admin', require('./routes/admin/workflowActivities'));
app.use('/api/admin', require('./routes/admin/caseAuditTrail'));
app.use('/api/admin', require('./routes/admin/transmissionAuditTrail'));

// ─── Case Management Routes (Phase 2) ────────────────────────────────────────
app.use('/api', require('./routes/cases'));          // F-13 + F-15
app.use('/api', require('./routes/caseContacts'));   // F-14
app.use('/api', require('./routes/caseMI'));         // F-16
app.use('/api', require('./routes/caseAE'));         // F-17
app.use('/api', require('./routes/casePC'));         // F-18
app.use('/api', require('./routes/notifications'));  // G10 notifications feed

// ─── Content Management Routes ───────────────────────────────────────────────
app.use('/api/cm', require('./routes/cm/folders'));
app.use('/api/cm', require('./routes/cm/documents'));
app.use('/api/cm', require('./routes/cm/faqs'));
app.use('/api/cm', require('./routes/cm/mergeReports'));
app.use('/api/cm', require('./routes/cm/templates'));
app.use('/api/cm', require('./routes/cm/reviews'));

// Serve CM document uploads as static files
app.use('/uploads/cm', express.static(path.join(__dirname, 'storage/cm_documents')));

// Serve org logos
app.use('/storage/org_logos', express.static(path.join(__dirname, 'storage/org_logos')));

// ─── Serve Static Frontend Files ─────────────────────────────────────────────
// This tells Express to serve all files in the /frontend folder
// When the browser goes to http://localhost:3000 it gets index.html automatically
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth', authRateLimiter, require('./routes/auth'));
app.use('/api/inbox', require('./routes/inbox'));
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
});

app.get('/api/version', (_req, res) => {
  res.json(getApiVersionContract(API_LATEST_VERSION));
});

// GET /api/users — active users list (for case owner dropdown in CaseFormPage)
app.get('/api/users', authenticate, async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'superadmin') {
      [rows] = await pool.execute(
        'SELECT id, name, email, role FROM users WHERE is_active = 1 ORDER BY name ASC'
      );
    } else {
      [rows] = await pool.execute(
        `SELECT DISTINCT u.id, u.name, u.email, u.role
         FROM users u
         INNER JOIN user_org_access uoa ON uoa.user_id = u.id
         WHERE u.is_active = 1 AND uoa.org_id = ? AND uoa.is_active = 1
         ORDER BY u.name ASC`,
        [req.user.orgId]
      );
    }
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Console routes (admin role required)
app.use('/api/admin/orgs', require('./routes/admin/orgs'));
app.use('/api/admin', require('./routes/admin/serviceLogs'));
app.use('/api/admin', require('./routes/admin/systemActivity'));
app.use('/api/admin', require('./routes/admin/config'));
app.use('/api/admin/process-logs', processExplorerRouter);
// Superadmin routes (superadmin role required)
app.use('/api/superadmin', require('./routes/superadmin'));
app.use('/api/superadmin', require('./routes/superadmin/reportsAccess'));
app.use('/api/admin', require('./routes/admin/reportAccessRequests'));
const changeApprovals = require('./routes/admin/changeApprovals');
app.use('/api/admin', changeApprovals);
const dependencyCheck = require('./routes/admin/dependencyCheck');
app.use('/api/admin', dependencyCheck);
app.use("/api/integrations", require("./routes/integrations/dataExport"))
app.use("/api", require("./routes/integrations/integrationsAdmin"))
app.use('/api/admin', require('./routes/integrations/schedulerAdmin'));
app.use('/api/admin', require('./routes/integrations/oauth2Admin'));
app.use('/api', require('./routes/integrations/emirRules'));
app.use('/api', require('./routes/integrations/mirIntegration'));
app.use('/api', require('./routes/integrations/crmIntegration'));
app.use('/api', require('./routes/integrations/caseImport'));
app.use('/api', require('./routes/integrations/scheduledExports'));
app.use('/api', require('./routes/reports'));
app.use('/api', require('./routes/integrations/vaultAdmin'));
app.use('/api', require('./routes/integrations/emirAdmin'));
app.use('/api', require('./routes/integrations/vaultQuery'));
app.use('/api', require('./routes/integrations/vaultPull'));
app.use('/api', require('./routes/integrations/vaultIngest'));
app.use('/api', require('./routes/integrations/vaultPollTrigger'));
app.use('/api', require('./routes/integrations/emirReceiver'));
app.use('/api', require('./routes/integrations/caseExport'));

// API v1 versioning — contract-based versioned surface under /api/v1
const apiV1Router = express.Router();
app.use('/api/v1', apiV1Router);

apiV1Router.use((req, res, next) => {
  res.setHeader('X-API-Version', '1');
  res.setHeader('X-API-Latest-Version', API_LATEST_VERSION);
  res.setHeader('X-API-Contract-Date', API_VERSION_CONTRACT_DATE);
  res.setHeader('X-API-Supported-Versions', API_SUPPORTED_VERSIONS.join(','));
  next();
});

apiV1Router.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: 'v1', time: new Date().toISOString() });
});

apiV1Router.get('/version', (_req, res) => {
  res.json(getApiVersionContract('v1'));
});

apiV1Router.use('/auth', require('./routes/auth'));
apiV1Router.use('/inbox', require('./routes/inbox'));

apiV1Router.use('/admin', require('./routes/admin/picklists'));
apiV1Router.use('/admin', require('./routes/admin/fieldSetup'));
apiV1Router.use('/admin', require('./routes/admin/securityGroups'));
apiV1Router.use('/admin', require('./routes/admin/contacts'));
apiV1Router.use('/admin', require('./routes/admin/siteConfig'));
apiV1Router.use('/admin', require('./routes/admin/productDictionary'));
apiV1Router.use('/admin', require('./routes/admin/caseNumbering'));
apiV1Router.use('/admin', require('./routes/admin/caseFormDefinition'));
apiV1Router.use('/admin', require('./routes/admin/workflowActivities'));
apiV1Router.use('/admin', require('./routes/admin/caseAuditTrail'));
apiV1Router.use('/admin', require('./routes/admin/transmissionAuditTrail'));
apiV1Router.use('/admin', require('./routes/admin/serviceLogs'));
apiV1Router.use('/admin', require('./routes/admin/systemActivity'));
apiV1Router.use('/admin', require('./routes/admin/config'));
apiV1Router.use('/admin/orgs', require('./routes/admin/orgs'));
apiV1Router.use('/admin/process-logs', processExplorerRouter);
apiV1Router.use('/admin', require('./routes/admin/reportAccessRequests'));
apiV1Router.use('/admin', require('./routes/admin/changeApprovals'));
apiV1Router.use('/admin', require('./routes/admin/dependencyCheck'));
apiV1Router.use('/admin', require('./routes/integrations/schedulerAdmin'));
apiV1Router.use('/admin', require('./routes/integrations/oauth2Admin'));

apiV1Router.use('/superadmin', require('./routes/superadmin'));
apiV1Router.use('/superadmin', require('./routes/superadmin/reportsAccess'));

apiV1Router.use('/', require('./routes/cases'));
apiV1Router.use('/', require('./routes/caseContacts'));
apiV1Router.use('/', require('./routes/caseMI'));
apiV1Router.use('/', require('./routes/caseAE'));
apiV1Router.use('/', require('./routes/casePC'));
apiV1Router.use('/', require('./routes/notifications'));
apiV1Router.use('/', require('./routes/reports'));

apiV1Router.use('/cm', require('./routes/cm/folders'));
apiV1Router.use('/cm', require('./routes/cm/documents'));
apiV1Router.use('/cm', require('./routes/cm/faqs'));
apiV1Router.use('/cm', require('./routes/cm/mergeReports'));
apiV1Router.use('/cm', require('./routes/cm/templates'));
apiV1Router.use('/cm', require('./routes/cm/reviews'));

apiV1Router.use('/integrations', require('./routes/integrations/dataExport'));
apiV1Router.use('/', require('./routes/integrations/integrationsAdmin'));
apiV1Router.use('/', require('./routes/integrations/emirRules'));
apiV1Router.use('/', require('./routes/integrations/mirIntegration'));
apiV1Router.use('/', require('./routes/integrations/crmIntegration'));
apiV1Router.use('/', require('./routes/integrations/caseImport'));
apiV1Router.use('/', require('./routes/integrations/scheduledExports'));
apiV1Router.use('/', require('./routes/integrations/vaultAdmin'));
apiV1Router.use('/', require('./routes/integrations/emirAdmin'));
apiV1Router.use('/', require('./routes/integrations/vaultQuery'));
apiV1Router.use('/', require('./routes/integrations/vaultPull'));
apiV1Router.use('/', require('./routes/integrations/vaultIngest'));
apiV1Router.use('/', require('./routes/integrations/vaultPollTrigger'));
apiV1Router.use('/', require('./routes/integrations/emirReceiver'));
apiV1Router.use('/', require('./routes/integrations/caseExport'));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'))
})

// ─── Email Poller ────────────────────────────────────────────────────────────
const { startPoller, stopPoller } = require('./services/emailPoller');

// ─── Start Server (after DB is ready) ────────────────────────────────────────
// Wait for MySQL schema initialization before accepting requests or starting poller.
const { initPromise } = require('./database/db');
let server;
const isTestEnv = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
if (!isTestEnv) {
  initPromise.then(() => {
    startPoller();
    startScheduler();
    startSchemaTracker();
    server = app.listen(PORT, HOST, () => {
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
  });
}


function shutdown(signal) {
  console.log(`\n🛑 Shutting down (${signal})...`)
  try { stopPoller() } catch (_) {}
  try { stopScheduler() } catch (_) {}
  try { stopSchemaTracker() } catch (_) {}
  if (server) server.close(() => process.exit(0))
  else process.exit(0)
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
