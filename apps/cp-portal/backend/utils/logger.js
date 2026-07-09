/**
 * logger.js  (CP-19)
 *
 * Structured JSON logging + optional error tracking. No hard dependency:
 *  - Logs are emitted as single-line JSON (parseable by any log aggregator).
 *  - If SENTRY_DSN is set AND @sentry/node is installed, errors are also sent
 *    to Sentry. Otherwise it degrades gracefully to console only.
 *
 * Usage:
 *   const log = require('./utils/logger');
 *   log.info('portal.login', { userId, clientId });
 *   log.error('scheduler.tick.failed', { err });
 */

let sentry = null;
if (process.env.SENTRY_DSN) {
  try {
    sentry = require('@sentry/node');
    sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    });
  } catch {
    // @sentry/node not installed yet — run `npm i @sentry/node` to enable.
    sentry = null;
  }
}

function serializeErr(err) {
  if (!err) return undefined;
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  return err;
}

function emit(level, event, meta = {}) {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...meta,
    err: serializeErr(meta.err),
  };
  const out = JSON.stringify(line);
  if (level === 'error') process.stderr.write(out + '\n');
  else process.stdout.write(out + '\n');
}

module.exports = {
  info:  (event, meta) => emit('info',  event, meta),
  warn:  (event, meta) => emit('warn',  event, meta),
  debug: (event, meta) => { if (process.env.LOG_LEVEL === 'debug') emit('debug', event, meta); },
  error: (event, meta = {}) => {
    emit('error', event, meta);
    if (sentry && meta.err instanceof Error) sentry.captureException(meta.err, { extra: { event, ...meta } });
  },
  // Expose whether external error tracking is active (for /health etc.)
  sentryEnabled: () => !!sentry,
};
