'use strict';
/**
 * processManager.js — Child Process Lifecycle Manager
 *
 * Architecture Fix A2: moves emailPoller and scheduler+emailWorker out of the
 * main HTTP server process into dedicated child processes via child_process.fork().
 *
 * Benefits:
 *   • IMAP hangs / cron panics cannot block the HTTP event loop
 *   • Each worker restarts independently on crash (exponential back-off)
 *   • Main process stays lean — only HTTP + WebSocket traffic
 *
 * Back-off: doubles on each crash up to MAX_BACKOFF_MS (30s).
 * Resets after STABLE_UPTIME_MS (60s) of clean running.
 *
 * Owned by: Varun (CTO)
 */

const { fork }   = require('child_process');
const path       = require('path');
const { logger } = require('./logger');

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS     = 30_000;
const STABLE_UPTIME_MS   = 60_000;

const WORKERS = [
  {
    name:   'emailPoller',
    script: path.join(__dirname, '../workers/pollerProcess.js'),
  },
  {
    name:   'scheduler',
    script: path.join(__dirname, '../workers/schedulerProcess.js'),
  },
];

/** Map<name, ChildProcess> — live child references */
const _children = new Map();
/** Map<name, number>       — current back-off per worker */
const _backoffs  = new Map();
/** Map<name, Timer>        — stable-uptime reset timers */
const _stable    = new Map();
/** Whether we have started (prevents double-start) */
let _started = false;

function _clearStableTimer(name) {
  const t = _stable.get(name);
  if (t) { clearTimeout(t); _stable.delete(name); }
}

function _spawnWorker(worker) {
  const child = fork(worker.script, [], {
    env:    process.env,
    silent: false,   // inherit stdio so logs flow to the parent console
  });

  _children.set(worker.name, child);
  logger.info({ worker: worker.name, pid: child.pid }, 'processManager: worker spawned');

  // Reset back-off after stable uptime
  _clearStableTimer(worker.name);
  _stable.set(worker.name, setTimeout(() => {
    _backoffs.delete(worker.name);
    _stable.delete(worker.name);
  }, STABLE_UPTIME_MS));

  child.on('exit', (code, signal) => {
    _children.delete(worker.name);
    _clearStableTimer(worker.name);

    // stopWorkers() calls removeAllListeners('exit') before sending SIGTERM,
    // so this handler only fires on unexpected exits. Guard with _started to
    // be safe against any edge-case where the listener wasn't removed in time.
    const prev    = _backoffs.get(worker.name) || INITIAL_BACKOFF_MS;
    const backoff = Math.min(prev * 2, MAX_BACKOFF_MS);
    _backoffs.set(worker.name, backoff);

    logger.warn({ worker: worker.name, code, signal, backoff_ms: backoff }, 'processManager: worker exited — will restart');
    setTimeout(() => {
      if (_started) _spawnWorker(worker);
    }, backoff);
  });

  child.on('error', (err) => {
    logger.error({ worker: worker.name, err: err.message }, 'processManager: worker error');
  });
}

function startWorkers() {
  if (_started) return;
  _started = true;
  for (const worker of WORKERS) {
    _spawnWorker(worker);
  }
  logger.info({ workers: WORKERS.map((w) => w.name) }, 'processManager: all workers started');
}

function stopWorkers() {
  _started = false;   // prevents auto-restart in exit handler
  for (const [name, child] of _children.entries()) {
    logger.info({ worker: name, pid: child.pid }, 'processManager: sending SIGTERM to worker');
    child.removeAllListeners('exit'); // prevent restart loop on intentional shutdown
    try { child.kill('SIGTERM'); } catch (_) {}
  }
  _children.clear();
  for (const name of _stable.keys()) _clearStableTimer(name);
  logger.info('processManager: all workers stopped');
}

module.exports = { startWorkers, stopWorkers };
