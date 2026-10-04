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

// Load apps/mims/.env — the one settings file MIMS uses.
// process.loadEnvFile() reads from CWD. processManager.js forks with the
// parent's CWD, which is apps/mims (npm run dev / npm start run there), and the
// child inherits the parent's environment anyway. If you run this file
// directly: cd apps/mims && node backend/workers/pollerProcess.js
try { process.loadEnvFile(); } catch (_) {}

const { startPoller, stopPoller } = require('../services/emailPoller');
const { startSlaScheduler, stopSlaScheduler } = require('../services/emailCaseImportService');
const { logger } = require('../services/logger');

logger.info({ pid: process.pid }, 'pollerProcess: email poller worker started');

startPoller();
// Email Case Import (MIMS-38): SLA sweep shares the poller lifecycle — cases
// sitting unreviewed in "Email Intake" past the org window escalate to leads.
startSlaScheduler();

process.on('SIGTERM', async () => {
  logger.info({ pid: process.pid }, 'pollerProcess: SIGTERM received — stopping poller');
  try { stopSlaScheduler(); } catch (_) {}
  // WP3: await stopPoller so an in-flight ingest can finish and persist its watermark.
  try { await stopPoller(); } catch (e) { logger.warn({ pid: process.pid, err: e.message }, 'pollerProcess: stopPoller error on SIGTERM'); }
  process.exit(0);
});

// MIPM-187: if the server dies without a clean shutdown (kill -9, crash), this
// worker used to keep running — old code, against the same job queue and mailbox.
// The parent's IPC channel closes when it dies; stop with it.
process.on('disconnect', () => {
  logger.warn({ pid: process.pid }, 'pollerProcess: parent process gone — shutting down');
  process.kill(process.pid, 'SIGTERM');
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
