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

// Load .env before anything else (Node 20.12+ built-in, no dotenv package needed)
try { process.loadEnvFile(); } catch (_) {}

const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./database/db');
const { authenticate } = require('./middleware/auth');
const { router: processExplorerRouter } = require('./routes/admin/processExplorer');
const { hasGlobalAdminScope } = require('./utils/adminScope');
const {
  inferModule,
  deriveEntity,
  deriveEventType,
  shouldCaptureBusinessEvent,
  emitProcessEvent,
} = require('./services/processExplorerService');
const { logger } = require('./services/logger');
const { requestContext, attachRequestIdHeader } = require('./middleware/requestContext');
const { captureApiExceptions } = require('./middleware/exceptionCapture');
const { securityHeaders } = require('./middleware/securityHeaders');
const { inputSecurityMiddleware } = require('./middleware/inputSecurity');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { startSchemaTracker, stopSchemaTracker } = require('./services/schemaTracker');
const { startScheduler, stopScheduler } = require('./services/scheduler');
const { startDpprScheduler }           = require('./services/dpprScheduler');
const { apiRateLimiter, authRateLimiter } = require('./middleware/rateLimiters');
const { auditAutoCapture } = require('./middleware/auditAutoCapture');
const { attachChatRealtime } = require('./services/chatRealtimeService');
const { attachCasePresence } = require('./services/casePresenceService');
const ocrWorker = require('./services/ocrWorker');
const { attachAppRealtime } = require('./services/appRealtimeService');
const { ensureMobilePushSchema } = require('./services/mobilePushService');
const changeApprovals = require('./routes/admin/changeApprovals');
const dependencyCheck = require('./routes/admin/dependencyCheck');

const app = express();
const PORT = process.env.PORT || 3000;
// Some environments disallow binding to 0.0.0.0; stick to localhost for dev.
const HOST = process.env.HOST || '127.0.0.1';
app.disable('x-powered-by');
app.set('trust proxy', 1);

const API_LATEST_VERSION = 'v1';
const API_SUPPORTED_VERSIONS = ['v1'];
const API_VERSION_CONTRACT_DATE = '2026-04-07';
const DEFAULT_ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:8081',
  'http://localhost:8081',
  'http://13.205.213.128',
  'https://13.205.213.128'
]);

function parseAllowedOrigins(...rawOriginGroups) {
  const origins = rawOriginGroups
    .map((rawOrigins) => String(rawOrigins || ''))
    .join(',')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length ? new Set([...DEFAULT_ALLOWED_ORIGINS, ...origins]) : DEFAULT_ALLOWED_ORIGINS;
}

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

// Local UAT: rewrite /mims/api/... → /api/... so the built frontend works
// without nginx. On EC2, nginx does this rewrite before reaching Node.
app.use((req, _res, next) => {
  if (req.path.startsWith('/mims/api/')) {
    req.url = req.url.replace('/mims/api/', '/api/');
  }
  next();
});

// CORS — allows the frontend (served from the same origin) to call the API
const allowAllOrigins = String(process.env.CORS_ALLOW_ALL || '').toLowerCase() === 'true';
if (allowAllOrigins && process.env.NODE_ENV === 'production') {
  throw new Error('CORS_ALLOW_ALL cannot be enabled in production.');
}
const allowedOrigins = parseAllowedOrigins(
  process.env.CORS_ALLOWED_ORIGINS,
  process.env.MIMS_ALLOWED_FRONTEND_ORIGINS,
  process.env.MIMS_BACKEND_BASE_URL
);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowAllOrigins || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`CORS origin not allowed: ${origin}`));
  },
  credentials: true,
}));
app.use(securityHeaders);

// Parse incoming JSON request bodies (needed for login/register POST requests)
app.use(express.json({ limit: process.env.INPUT_JSON_LIMIT || '1mb' }));

// Parse URL-encoded form data (for HTML form submissions)
app.use(express.urlencoded({
  extended: true,
  limit: process.env.INPUT_URLENCODED_LIMIT || '1mb',
  parameterLimit: Number.parseInt(process.env.INPUT_PARAM_LIMIT || '2000', 10),
}));
app.use(requestContext);
app.use(attachRequestIdHeader);
app.use(captureApiExceptions);
app.use('/api', inputSecurityMiddleware);
app.use('/api', apiRateLimiter);
app.use('/api', auditAutoCapture());

// ── Fix 13: Process Explorer telemetry — batched flush (500ms) ───────────────
// Previously wrote one DB row per API response (unbounded write pressure).
// Now events are buffered in-process and flushed in bulk every 500ms.
// Purge of old logs moved to the scheduler (daily job) — not per-request.
const _telemetryBuffer = [];
const TELEMETRY_FLUSH_MS = parseInt(process.env.TELEMETRY_FLUSH_MS || '500', 10);

async function _flushTelemetry() {
  if (!_telemetryBuffer.length) return;
  const batch = _telemetryBuffer.splice(0, _telemetryBuffer.length);
  try {
    for (const event of batch) {
      await emitProcessEvent(event);
    }
  } catch (_) { /* best-effort only */ }
}

setInterval(_flushTelemetry, TELEMETRY_FLUSH_MS).unref();

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
    try {
      if (!shouldCaptureBusinessEvent(req, res)) return;
      const pathOnly = req.originalUrl.split('?')[0];
      const payload  = req.body && typeof req.body === 'object' && Object.keys(req.body).length
        ? req.body : null;
      // Push to buffer — no DB write on the hot path
      _telemetryBuffer.push({
        orgId:        req.user?.orgId ?? null,
        sourceModule: inferModule(pathOnly),
        method:       req.method,
        path:         pathOnly,
        statusCode:   res.statusCode,
        durationMs:   Date.now() - start,
        eventType:    deriveEventType(req.method),
        entityType:   deriveEntity(pathOnly),
        summary:      `${deriveEventType(req.method).toUpperCase()} ${deriveEntity(pathOnly)} via ${pathOnly}`,
        payload,
        errorMessage: res.statusCode >= 400 ? capturedErrorMessage : null,
      });
    } catch (_) { /* best-effort */ }
  });
  next();
});

app.use('/', require('./routes/apiPlatform'));

// Serve CM document uploads as static files
app.use('/uploads/cm', express.static(path.join(__dirname, 'storage/cm_documents')));

// Serve org logos
app.use('/storage/org_logos', express.static(path.join(__dirname, 'storage/org_logos')));

// ─── Serve Static Frontend Files ─────────────────────────────────────────────
// Dev:  Vite runs separately on :5173 — Express doesn't serve the frontend.
// Prod: `npm run build` outputs to ../frontend/dist/ with base '/mims/'.
//       Mount at /mims so /mims/assets/... resolves to dist/assets/...
const FRONTEND_DIR = process.env.NODE_ENV === 'production'
  ? path.join(__dirname, '../frontend/dist')
  : path.join(__dirname, '../frontend');
if (process.env.NODE_ENV === 'production') {
  app.use('/mims', express.static(FRONTEND_DIR));
} else {
  app.use(express.static(FRONTEND_DIR));
}

// Fix 2: health check now verifies DB connectivity (not just process liveness)
app.get('/api/health', async (_req, res) => {
  try {
    await pool.execute('SELECT 1');
    res.json({ status: 'ok', db: 'ok', time: new Date().toISOString() });
  } catch (err) {
    logger.error({ err: err.message }, 'Health check: DB unreachable');
    res.status(503).json({ status: 'error', db: 'unreachable', time: new Date().toISOString() });
  }
});

app.get('/api/version', (_req, res) => {
  res.json(getApiVersionContract(API_LATEST_VERSION));
});

// GET /api/users — active users list (for case owner dropdown in CaseFormPage)
app.get('/api/users', authenticate, async (req, res) => {
  try {
    let rows;
    if (hasGlobalAdminScope(req.user)) {
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

// ── Fix 12: mountRoutes() — single source of truth for all route registrations ─
// Eliminates the previous pattern where every router was mounted twice
// (once under /api and again under /api/v1) doubling Express's route table.
// Add a new route file here once — both surfaces pick it up automatically.
function mountRoutes(r, prefix = '') {
  // Auth
  r.use(`${prefix}/auth`, authRateLimiter, require('./routes/auth'));
  r.use(`${prefix}/inbox`, require('./routes/inbox'));
  r.use(`${prefix}/mobile-sync`, require('./routes/mobileSync'));

  // Admin
  r.use(`${prefix}/admin`, require('./routes/admin/regression'));
  r.use(`${prefix}/admin`, require('./routes/admin/picklists'));
  r.use(`${prefix}/admin`, require('./routes/admin/miCategories'));
  r.use(`${prefix}/admin`, require('./routes/admin/fieldSetup'));
  r.use(`${prefix}/admin`, require('./routes/admin/securityGroups'));
  r.use(`${prefix}/admin`, require('./routes/admin/accessConfigurations'));
  r.use(`${prefix}/admin`, require('./routes/admin/twoFactor'));
  r.use(`${prefix}/admin`, require('./routes/admin/alerts'));
  r.use(`${prefix}/admin`, require('./routes/admin/contacts'));
  r.use(`${prefix}/admin`, require('./routes/admin/siteConfig'));
  r.use(`${prefix}/admin`, require('./routes/admin/productDictionary'));
  r.use(`${prefix}/admin`, require('./routes/admin/caseNumbering'));
  r.use(`${prefix}/admin`, require('./routes/admin/caseFormDefinition'));
  r.use(`${prefix}/admin`, require('./routes/admin/workflowActivities'));
  r.use(`${prefix}/admin`, require('./routes/admin/caseAuditTrail'));
  r.use(`${prefix}/admin`, require('./routes/admin/cmAuditTrail'));
  r.use(`${prefix}/admin`, require('./routes/admin/responseErrorLog'));
  r.use(`${prefix}/admin`, require('./routes/admin/transmissionAuditTrail'));
  r.use(`${prefix}/admin`, require('./routes/admin/copyDivision'));
  r.use(`${prefix}/admin`, require('./routes/admin/dppr'));
  r.use(`${prefix}/admin`, require('./routes/admin/rtbf'));
  r.use(`${prefix}/admin`, require('./routes/admin/consent'));
  r.use(`${prefix}/admin`, require('./routes/admin/users'));
  r.use(`${prefix}/admin`, require('./routes/admin/systemParams'));
  r.use(`${prefix}/admin`, require('./routes/admin/customizeForms'));
  r.use(`${prefix}/admin`, require('./routes/admin/caseFormRules'));
  r.use(`${prefix}/admin`, require('./routes/admin/reportsAccess'));
  r.use(`${prefix}/admin`, require('./routes/admin/picklistsTable'));
  r.use(`${prefix}/admin`, require('./routes/admin/dashboardActivity'));
  r.use(`${prefix}/admin`, require('./routes/admin/userPreferences'));
  r.use(`${prefix}/admin`, require('./routes/admin/serviceLogs'));
  r.use(`${prefix}/admin`, require('./routes/admin/systemActivity'));
  r.use(`${prefix}/admin`, require('./routes/admin/serviceDashboard'));
  r.use(`${prefix}/admin`, require('./routes/admin/observability'));
  r.use(`${prefix}/admin`, require('./routes/admin/config'));
  r.use(`${prefix}/admin/orgs`, require('./routes/admin/orgs'));
  r.use(`${prefix}/admin/process-logs`, processExplorerRouter);
  r.use(`${prefix}/admin`, require('./routes/admin/reportAccessRequests'));
  r.use(`${prefix}/admin`, changeApprovals);
  r.use(`${prefix}/admin`, dependencyCheck);
  r.use(`${prefix}/admin`, require('./routes/admin/impactPreview'));
  r.use(`${prefix}/admin`, require('./routes/admin/policyGraph'));
  r.use(`${prefix}/admin`, require('./routes/admin/contentIntelligence'));
  r.use(`${prefix}/admin`, require('./routes/admin/loggedInUsers'));
  r.use(`${prefix}/admin`, require('./routes/integrations/schedulerAdmin'));
  r.use(`${prefix}/admin`, require('./routes/integrations/oauth2Admin'));
  r.use(`${prefix}/admin`, require('./routes/admin/help'));
  r.use(`${prefix}/admin`, require('./routes/admin/icsr'));
  r.use(prefix || '/', require('./routes/admin/haClock'));
  r.use(prefix || '/', require('./routes/admin/caseValidity'));
  r.use(prefix || '/', require('./routes/admin/meddra'));
  r.use(prefix || '/', require('./routes/admin/causality'));
  r.use(prefix || '/', require('./routes/admin/caseDrugs'));
  r.use(prefix || '/', require('./routes/admin/caseConversion'));
  r.use(prefix || '/', require('./routes/admin/piiRedaction'));
  r.use(`${prefix}/admin`, require('./routes/admin/workflowEngine'));
  r.use(`${prefix}/admin`, require('./routes/admin/auditInspectorExport'));
  r.use(`${prefix}/admin`, require('./routes/admin/featureFlags'));
  r.use(prefix || '/', require('./routes/admin/featureFlags'));
  r.use(prefix || '/', require('./routes/admin/casePresence'));
  r.use(prefix || '/', require('./routes/admin/attachments'));
  r.use(prefix || '/', require('./routes/admin/geocoder'));
  r.use(prefix || '/', require('./routes/admin/fieldHistory'));
  r.use(prefix || '/', require('./routes/admin/validation'));
  r.use(prefix || '/', require('./routes/admin/smartFields'));
  r.use(prefix || '/', require('./routes/admin/gridSections'));
  r.use(prefix || '/', require('./routes/admin/richFields'));
  r.use(prefix || '/', require('./routes/admin/documents'));
  r.use(prefix || '/', require('./routes/admin/collab'));
  r.use(prefix || '/', require('./routes/admin/caseActions'));
  r.use(prefix || '/', require('./routes/admin/compliance'));
  // ── Bucket 2 Sprint 2 Week 1 (PV operational depth) ───────────────────────
  r.use(prefix || '/', require('./routes/admin/documentTypes'));   // #15 doc taxonomy
  r.use(prefix || '/', require('./routes/admin/complaintCodes'));  // #19 codes + lot master
  r.use(prefix || '/', require('./routes/admin/fieldActions'));    // #28 recalls / field actions
  r.use(prefix || '/', require('./routes/admin/capa'));            // #20 CAPA workflow
  r.use(prefix || '/', require('./routes/admin/pcTrending'));      // #29 PC trending + signals
  // ── Bucket 2 Sprint 2 Week 2 (workflow + chronology + MI compliance) ──────
  r.use(prefix || '/', require('./routes/admin/workflowSla'));     // #11 SLA timer per state
  r.use(prefix || '/', require('./routes/admin/caseTimeline'));    // #13 chronology
  r.use(prefix || '/', require('./routes/admin/miApproval'));      // #17 two-signer MI
  r.use(prefix || '/', require('./routes/admin/miPromoReview'));   // #16 off-label + promo review
  r.use(prefix || '/', require('./routes/admin/aiAssistant'));

  // Legacy superadmin compatibility + canonical platform-admin alias
  r.use(`${prefix}/superadmin`, require('./routes/platformAdmin'));
  r.use(`${prefix}/superadmin`, require('./routes/platformAdmin/reportsAccess'));
  r.use(`${prefix}/admin/platform`, require('./routes/platformAdmin'));
  r.use(`${prefix}/admin/platform`, require('./routes/platformAdmin/reportsAccess'));

  // Cases & core
  r.use(prefix || '/', require('./routes/cases'));
  r.use(prefix || '/', require('./routes/caseContacts'));
  r.use(prefix || '/', require('./routes/caseMI'));
  r.use(prefix || '/', require('./routes/caseAE'));
  r.use(prefix || '/', require('./routes/casePC'));
  r.use(prefix || '/', require('./routes/caseQA'));
  r.use(prefix || '/', require('./routes/notifications'));
  r.use(prefix || '/', require('./routes/chat'));
  r.use(prefix || '/', require('./routes/reportModule'));
  r.use(prefix || '/', require('./routes/reports'));
  r.use(prefix || '/', require('./routes/help'));
  r.use(prefix || '/', require('./routes/integrations/integrationsAdmin'));
  r.use(prefix || '/', require('./routes/integrations/emirRules'));
  r.use(prefix || '/', require('./routes/integrations/mirIntegration'));
  r.use(prefix || '/', require('./routes/integrations/crmIntegration'));
  r.use(prefix || '/', require('./routes/integrations/caseImport'));
  r.use(prefix || '/', require('./routes/integrations/scheduledExports'));
  r.use(prefix || '/', require('./routes/integrations/vaultAdmin'));
  r.use(prefix || '/', require('./routes/integrations/emirAdmin'));
  r.use(prefix || '/', require('./routes/integrations/vaultQuery'));
  r.use(prefix || '/', require('./routes/integrations/vaultPull'));
  r.use(prefix || '/', require('./routes/integrations/vaultIngest'));
  r.use(prefix || '/', require('./routes/integrations/vaultPollTrigger'));
  r.use(prefix || '/', require('./routes/integrations/emirReceiver'));
  r.use(prefix || '/', require('./routes/integrations/caseExport'));
  r.use(prefix || '/', require('./routes/qa'));

  // Content management
  r.use(`${prefix}/cm`, require('./routes/cm/picklists'));
  r.use(`${prefix}/cm`, require('./routes/cm/settings'));
  r.use(`${prefix}/cm`, require('./routes/cm/folders'));
  r.use(`${prefix}/cm`, require('./routes/cm/documents'));
  r.use(`${prefix}/cm`, require('./routes/cm/modules'));
  r.use(`${prefix}/cm`, require('./routes/cm/faqs'));
  r.use(`${prefix}/cm`, require('./routes/cm/mergeReports'));
  r.use(`${prefix}/cm`, require('./routes/cm/templates'));
  r.use(`${prefix}/cm`, require('./routes/cm/reviews'));

  // Integrations
  r.use(`${prefix}/integrations`, require('./routes/integrations/dataExport'));
  r.use(`${prefix}/telemetry`, require('./routes/telemetry'));
}

// Mount on /api (unversioned — backward compat)
mountRoutes(app, '/api');

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

apiV1Router.get('/health', async (_req, res) => {
  try {
    await pool.execute('SELECT 1');
    res.json({ status: 'ok', version: 'v1', db: 'ok', time: new Date().toISOString() });
  } catch (_) {
    res.status(503).json({ status: 'error', version: 'v1', db: 'unreachable', time: new Date().toISOString() });
  }
});

apiV1Router.get('/version', (_req, res) => {
  res.json(getApiVersionContract('v1'));
});

// Mount same routes on /api/v1 (routers are shared — require() is cached by Node)
mountRoutes(apiV1Router, '');

// SPA fallback — any non-API route returns index.html so client-side routing works
app.use('/api', notFoundHandler)
app.use('/oauth', notFoundHandler)
app.get('/mims', (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')))
app.get('/mims/*', (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')))
// Keep legacy catch-all for dev (Vite handles its own routing)
if (process.env.NODE_ENV !== 'production') {
  app.get('*', (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')))
}
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Architecture Fix A2: child process manager ───────────────────────────────
// emailPoller, scheduler, and emailWorker now run in dedicated child processes.
// processManager forks them after DB init and restarts them on crash.
const { startWorkers, stopWorkers } = require('./services/processManager');

// ─── Start Server (after DB is ready) ────────────────────────────────────────
// Wait for MySQL schema initialization before accepting requests or starting workers.
const { initPromise } = require('./database/db');
let server;
const isTestEnv = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
if (!isTestEnv) {
  initPromise.then(() => {
    ensureMobilePushSchema().catch(() => {});
    startWorkers();        // forks pollerProcess + schedulerProcess as child processes
    startDpprScheduler();
    startSchemaTracker();
    server = app.listen(PORT, HOST, () => {
      logger.info({ host: HOST, port: PORT }, 'MIMS server started');
      logger.info({ static_path: path.join(__dirname, '../frontend') }, 'Frontend static path mounted');
    });
    attachChatRealtime(server);
    attachAppRealtime(server);
    attachCasePresence(server);
    ocrWorker.start();
    server.on('error', (err) => {
      if (err?.code === 'EADDRINUSE') {
        logger.error({ host: HOST, port: PORT }, 'Port already in use');
        process.exit(1)
      }
      logger.error({ err }, 'Server error');
      process.exit(1)
    })
  });
}


function shutdown(signal) {
  logger.info({ signal }, 'Shutting down server');
  try { stopWorkers() } catch (_) {}     // SIGTERM to pollerProcess + schedulerProcess children
  try { stopScheduler() } catch (_) {}   // dpprScheduler still runs in main process
  try { stopSchemaTracker() } catch (_) {}
  try { require('./services/jobQueueService').shutdown() } catch (_) {}
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
