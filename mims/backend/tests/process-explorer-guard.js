'use strict';

const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

function assertIncludes(content, expected, file) {
  if (!content.includes(expected)) {
    throw new Error(`[Guard] Missing "${expected}" in ${file}`);
  }
}

function run() {
  const server = read('server.js');
  const poller = read('services/emailPoller.js');
  const processSvc = read('services/processExplorerService.js');
  const schemaSvc = read('services/schemaTracker.js');
  const processRoutes = read('routes/admin/processExplorer.js');
  const dbFile = read('database/db.js');

  assertIncludes(server, "shouldCaptureBusinessEvent", 'backend/server.js');
  assertIncludes(server, "startSchemaTracker()", 'backend/server.js');
  assertIncludes(server, "app.use('/api/admin/process-logs'", 'backend/server.js');
  assertIncludes(poller, "emitProcessEvent", 'backend/services/emailPoller.js');
  assertIncludes(processSvc, "emitProcessEvent", 'backend/services/processExplorerService.js');
  assertIncludes(schemaSvc, "runSchemaScan", 'backend/services/schemaTracker.js');
  assertIncludes(processRoutes, "router.post('/sql/execute'", 'backend/routes/admin/processExplorer.js');
  assertIncludes(processRoutes, "router.get('/sql/schema'", 'backend/routes/admin/processExplorer.js');
  assertIncludes(processRoutes, "router.get('/sql/graph'", 'backend/routes/admin/processExplorer.js');
  assertIncludes(processRoutes, "router.post('/ops/request'", 'backend/routes/admin/processExplorer.js');
  assertIncludes(processRoutes, "router.post('/ops/requests/:id/approve'", 'backend/routes/admin/processExplorer.js');
  assertIncludes(processRoutes, "router.get('/ops/metrics'", 'backend/routes/admin/processExplorer.js');
  assertIncludes(processRoutes, "router.get('/ops/analytics'", 'backend/routes/admin/processExplorer.js');
  assertIncludes(processRoutes, "finalizeOpsExecution", 'backend/routes/admin/processExplorer.js');
  assertIncludes(dbFile, "CREATE TABLE IF NOT EXISTS process_explorer_saved_queries", 'backend/database/db.js');
  assertIncludes(dbFile, "CREATE TABLE IF NOT EXISTS process_explorer_sql_audit", 'backend/database/db.js');
  assertIncludes(dbFile, "CREATE TABLE IF NOT EXISTS process_explorer_ops_requests", 'backend/database/db.js');
  assertIncludes(dbFile, "CREATE TABLE IF NOT EXISTS process_explorer_ops_snapshots", 'backend/database/db.js');

  console.log('[Guard] Process Explorer coverage guard passed.');
}

try {
  run();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
