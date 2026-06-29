'use strict';
/**
 * workers/pollerProcess.js — IMAP Email Poller child process entry point
 *
 * Spawned by processManager.js via child_process.fork().
 * Runs in an isolated process so IMAP hangs or crashes cannot
 * bring down the main HTTP server.
 *
 * On SIGTERM (from processManager graceful shutdown): stops the poller and exits cleanly.
 */

// Load .env from the backend directory.
// IMPORTANT: process.loadEnvFile() reads from CWD, so this process must be
// started with CWD = backend/. processManager.js forks with the parent's CWD
// which is backend/ (the npm start script cd's there). If you run this file
// directly, ensure: cd apps/mims/backend && node workers/pollerProcess.js
try { process.loadEnvFile(); } catch (_) {}

const { startPoller, stopPoller } = require('../services/emailPoller');
const { logger } = require('../services/logger');

logger.info({ pid: process.pid }, 'pollerProcess: email poller worker started');

startPoller();

process.on('SIGTERM', async () => {
  logger.info({ pid: process.pid }, 'pollerProcess: SIGTERM received — stopping poller');
  // WP3: await stopPoller so an in-flight ingest can finish and persist its watermark.
  try { await stopPoller(); } catch (e) { logger.warn({ pid: process.pid, err: e.message }, 'pollerProcess: stopPoller error on SIGTERM'); }
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error({ pid: process.pid, err: err.message }, 'pollerProcess: uncaughtException — exiting for restart');
  try { stopPoller(); } catch (e) { logger.warn({ pid: process.pid, err: e.message }, 'pollerProcess: stopPoller error on uncaughtException'); }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ pid: process.pid, reason: String(reason) }, 'pollerProcess: unhandledRejection');
  // Don't exit — emailPoller handles its own retry logic
});
