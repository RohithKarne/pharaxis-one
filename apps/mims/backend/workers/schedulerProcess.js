'use strict';
/**
 * workers/schedulerProcess.js — Cron Scheduler + Email Job Worker child process
 *
 * Spawned by processManager.js via child_process.fork().
 * Runs the node-cron scheduler and the emailWorker poll loop in an isolated
 * process so heavy cron jobs cannot block the main HTTP server event loop.
 *
 * On SIGTERM (from processManager graceful shutdown): stops both workers and exits cleanly.
 */

// Load .env from the backend directory.
// IMPORTANT: process.loadEnvFile() reads from CWD, so this process must be
// started with CWD = backend/. processManager.js forks with the parent's CWD
// which is backend/ (the npm start script cd's there). If you run this file
// directly, ensure: cd apps/mims/backend && node workers/schedulerProcess.js
try { process.loadEnvFile(); } catch (_) {}

const { startScheduler, stopScheduler } = require('../services/scheduler');
const { startEmailWorker, stopEmailWorker } = require('../services/emailWorker');
const { logger } = require('../services/logger');

logger.info({ pid: process.pid }, 'schedulerProcess: scheduler + emailWorker started');

startScheduler();
startEmailWorker();

process.on('SIGTERM', () => {
  logger.info({ pid: process.pid }, 'schedulerProcess: SIGTERM received — stopping scheduler and emailWorker');
  try { stopScheduler(); }   catch (e) { logger.warn({ pid: process.pid, err: e.message }, 'schedulerProcess: stopScheduler error on SIGTERM'); }
  try { stopEmailWorker(); } catch (e) { logger.warn({ pid: process.pid, err: e.message }, 'schedulerProcess: stopEmailWorker error on SIGTERM'); }
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error({ pid: process.pid, err: err.message }, 'schedulerProcess: uncaughtException — exiting for restart');
  try { stopScheduler(); }   catch (e) { logger.warn({ pid: process.pid, err: e.message }, 'schedulerProcess: stopScheduler error on uncaughtException'); }
  try { stopEmailWorker(); } catch (e) { logger.warn({ pid: process.pid, err: e.message }, 'schedulerProcess: stopEmailWorker error on uncaughtException'); }
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ pid: process.pid, reason: String(reason) }, 'schedulerProcess: unhandledRejection');
  // Don't exit — individual job errors are caught inside the scheduler
});
