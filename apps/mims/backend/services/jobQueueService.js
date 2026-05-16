'use strict';

/**
 * jobQueueService.js — background job queue abstraction.
 *
 * Wave 0 piece #5. Used by:
 *   - OCR pipeline (Theme 6, Wave 0 #6)
 *   - Bulk import (CSV / Excel) jobs
 *   - Heavy PDF generation (audit inspector export, letters)
 *   - Scheduled retransmissions (E2B, FDA ESG)
 *   - Email digests, notification fan-out
 *
 * Drivers:
 *   • 'memory' — default; ephemeral, single-process. Fine for dev + smoke tests.
 *   • 'bullmq' — lazy-required; uses ioredis (already a dependency).
 *               Activated by JOB_QUEUE_DRIVER=bullmq.
 *
 * Surface (driver-agnostic):
 *   register(queueName, handler, opts?)        — bind a worker for a queue
 *   enqueue(queueName, payload, opts?)         → Promise<{id}>
 *   shutdown()                                 → drain & close (graceful)
 *
 * Handler signature: async (payload, ctx) => result
 *   ctx = { jobId, attempt, log(message) }
 *
 * Opts:
 *   register: { concurrency, retries }
 *   enqueue:  { delayMs, priority }
 */

const { logger } = require('./logger');

const DRIVER = (process.env.JOB_QUEUE_DRIVER || 'memory').toLowerCase();

// ── In-memory driver ──────────────────────────────────────────────────────────

const _memQueues = new Map(); // name → { handler, opts, pending: [], running: 0 }
let _memJobIdSeq = 1;

function _memDrain(name) {
  const q = _memQueues.get(name);
  if (!q) return;
  while (q.running < (q.opts.concurrency || 1) && q.pending.length) {
    const job = q.pending.shift();
    q.running++;
    _memRun(q, job);
  }
}

async function _memRun(q, job) {
  const ctx = {
    jobId: job.id,
    attempt: job.attempt,
    log: (m) => logger.info({ jobId: job.id, queue: q.name }, m),
  };
  try {
    if (job.delayUntil && job.delayUntil > Date.now()) {
      const wait = job.delayUntil - Date.now();
      await new Promise(r => setTimeout(r, wait));
    }
    await q.handler(job.payload, ctx);
  } catch (err) {
    if (job.attempt < (q.opts.retries || 0)) {
      job.attempt++;
      job.delayUntil = Date.now() + Math.min(1000 * 2 ** job.attempt, 60_000);
      q.pending.push(job);
      logger.warn({ err: err.message, queue: q.name, jobId: job.id, attempt: job.attempt }, 'job retry');
    } else {
      logger.error({ err: err.message, queue: q.name, jobId: job.id }, 'job failed permanently');
    }
  } finally {
    q.running--;
    _memDrain(q.name);
  }
}

function _memRegister(name, handler, opts = {}) {
  if (_memQueues.has(name)) throw new Error(`Queue '${name}' already registered`);
  _memQueues.set(name, { name, handler, opts, pending: [], running: 0 });
}

async function _memEnqueue(name, payload, opts = {}) {
  const q = _memQueues.get(name);
  if (!q) throw new Error(`Queue '${name}' has no registered handler`);
  const id = `mem-${_memJobIdSeq++}`;
  q.pending.push({
    id, payload, attempt: 0,
    delayUntil: opts.delayMs ? Date.now() + opts.delayMs : 0,
  });
  setImmediate(() => _memDrain(name));
  return { id };
}

async function _memShutdown() {
  // Best-effort drain
  for (const q of _memQueues.values()) {
    let safety = 100;
    while ((q.running > 0 || q.pending.length) && safety-- > 0) {
      await new Promise(r => setTimeout(r, 50));
    }
  }
}

// ── BullMQ driver (lazy) ──────────────────────────────────────────────────────

let _bull = null;
const _bullQueues  = new Map(); // name → Queue
const _bullWorkers = new Map(); // name → Worker

function _loadBull() {
  if (_bull) return _bull;
  try {
    _bull = require('bullmq'); // eslint-disable-line global-require
    return _bull;
  } catch (err) {
    const e = new Error(
      "JOB_QUEUE_DRIVER=bullmq but 'bullmq' is not installed. " +
      "Install it or use the 'memory' driver."
    );
    e.cause = err;
    throw e;
  }
}

function _bullConn() {
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  };
}

function _bullRegister(name, handler, opts = {}) {
  const lib = _loadBull();
  if (_bullQueues.has(name)) throw new Error(`Queue '${name}' already registered`);
  const queue  = new lib.Queue(name, { connection: _bullConn() });
  const worker = new lib.Worker(name, async (job) => {
    const ctx = {
      jobId: job.id,
      attempt: job.attemptsMade,
      log: (m) => logger.info({ jobId: job.id, queue: name }, m),
    };
    return handler(job.data, ctx);
  }, {
    connection: _bullConn(),
    concurrency: opts.concurrency || 1,
  });
  worker.on('failed', (job, err) => {
    logger.warn({ err: err.message, queue: name, jobId: job?.id, attempt: job?.attemptsMade }, 'bullmq job failed');
  });
  _bullQueues.set(name, queue);
  _bullWorkers.set(name, worker);
}

async function _bullEnqueue(name, payload, opts = {}) {
  const queue = _bullQueues.get(name);
  if (!queue) throw new Error(`Queue '${name}' has no registered handler`);
  const job = await queue.add(name, payload, {
    delay: opts.delayMs || 0,
    priority: opts.priority || undefined,
    attempts: (opts.retries || 0) + 1,
    backoff:  { type: 'exponential', delay: 1000 },
    removeOnComplete: true,
    removeOnFail:     false,
  });
  return { id: job.id };
}

async function _bullShutdown() {
  for (const w of _bullWorkers.values()) { try { await w.close(); } catch (_) {} }
  for (const q of _bullQueues.values())  { try { await q.close(); } catch (_) {} }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

function register(name, handler, opts) {
  return DRIVER === 'bullmq' ? _bullRegister(name, handler, opts) : _memRegister(name, handler, opts);
}
function enqueue(name, payload, opts) {
  return DRIVER === 'bullmq' ? _bullEnqueue(name, payload, opts) : _memEnqueue(name, payload, opts);
}
function shutdown() {
  return DRIVER === 'bullmq' ? _bullShutdown() : _memShutdown();
}

logger.info({ driver: DRIVER }, 'jobQueueService: driver selected');

module.exports = { DRIVER, register, enqueue, shutdown };
