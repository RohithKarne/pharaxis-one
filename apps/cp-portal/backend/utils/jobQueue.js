/**
 * jobQueue.js  (CP-21)
 *
 * Lightweight in-process async job runner with retry/backoff, so slow side
 * effects (email, CRM sync, PDF) don't block the request and get retried on
 * transient failures instead of being silently dropped by a `.catch(() => {})`.
 *
 * This is the seam: same enqueue() API can be backed by BullMQ/Redis once Redis
 * is provisioned, for cross-instance durability. In-process is fine pre-scale.
 */

const log = require('./logger');

const jobs = [];
let running = false;

function run() {
  if (running) return;
  running = true;
  (async () => {
    while (jobs.length) {
      const job = jobs.shift();
      try {
        await job.fn();
      } catch (err) {
        job.attempt += 1;
        if (job.attempt < job.retries) {
          log.warn('job.retry', { name: job.name, attempt: job.attempt });
          setTimeout(() => { jobs.push(job); run(); }, job.delayMs * job.attempt);
        } else {
          log.error('job.failed', { name: job.name, err });
        }
      }
    }
    running = false;
  })();
}

/**
 * Queue an async side effect. Returns immediately; never throws.
 * @param {string} name   label for logs
 * @param {() => Promise<any>} fn  the work
 */
function enqueue(name, fn, { retries = 3, delayMs = 2000 } = {}) {
  jobs.push({ name, fn, retries, delayMs, attempt: 0 });
  run();
}

module.exports = { enqueue };
