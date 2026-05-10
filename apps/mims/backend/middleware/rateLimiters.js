'use strict';

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { getClient, isReady } = require('../services/redisClient');

/**
 * Returns a RedisStore when Redis is available, otherwise undefined
 * (express-rate-limit falls back to in-memory store automatically).
 * Prefix ensures different limiters don't share counter keys.
 */
function makeStore(prefix) {
  if (!isReady()) return undefined;
  return new RedisStore({
    sendCommand: (...args) => getClient().call(...args),
    prefix: `mims:rl:${prefix}:`,
  });
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function envInt(name, fallback) {
  return toPositiveInt(process.env[name], fallback);
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const firstHop = forwarded.split(',')[0].trim();
    if (firstHop) return firstHop;
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function getFingerprint(req) {
  const ip = getClientIp(req);
  const userAgent = String(req.headers['user-agent'] || 'unknown').slice(0, 140);
  return `${ip}:${userAgent}`;
}

function createLimiter({
  windowMs,
  max,
  keyGenerator,
  skip,
  message,
  skipSuccessfulRequests = false,
  storePrefix = 'api',
}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    skip,
    skipSuccessfulRequests,
    store: makeStore(storePrefix), // Redis when available, in-memory fallback
    handler: (_req, res) => {
      res.status(429).json({ error: message });
    },
  });
}

const authRateLimiter = createLimiter({
  windowMs: envInt('RATE_LIMIT_AUTH_WINDOW_MS', 15 * 60 * 1000),
  max: process.env.NODE_ENV === 'production'
    ? envInt('RATE_LIMIT_AUTH_MAX', 90)
    : envInt('RATE_LIMIT_AUTH_MAX_DEV', 600),
  keyGenerator: getFingerprint,
  message: 'Too many authentication requests. Please try again shortly.',
  storePrefix: 'auth',
});

const loginRateLimiter = createLimiter({
  windowMs: envInt('RATE_LIMIT_LOGIN_WINDOW_MS', 15 * 60 * 1000),
  max: process.env.NODE_ENV === 'production'
    ? envInt('RATE_LIMIT_LOGIN_MAX', 8)
    : envInt('RATE_LIMIT_LOGIN_MAX_DEV', 30),
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    return `${getFingerprint(req)}:${email || 'unknown-email'}`;
  },
  skipSuccessfulRequests: true,
  message: 'Too many login attempts. Please try again after 15 minutes.',
  storePrefix: 'login',
});

const accountCreationRateLimiter = createLimiter({
  windowMs: envInt('RATE_LIMIT_ACCOUNT_CREATE_WINDOW_MS', 60 * 60 * 1000),
  max: process.env.NODE_ENV === 'production'
    ? envInt('RATE_LIMIT_ACCOUNT_CREATE_MAX', 8)
    : envInt('RATE_LIMIT_ACCOUNT_CREATE_MAX_DEV', 60),
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    return `${getFingerprint(req)}:${email || 'unknown-email'}`;
  },
  message: 'Too many account creation attempts. Please try again later.',
  storePrefix: 'acct',
});

const recoveryRateLimiter = createLimiter({
  windowMs: envInt('RATE_LIMIT_RECOVERY_WINDOW_MS', 15 * 60 * 1000),
  max: process.env.NODE_ENV === 'production'
    ? envInt('RATE_LIMIT_RECOVERY_MAX', 8)
    : envInt('RATE_LIMIT_RECOVERY_MAX_DEV', 40),
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    return `${getFingerprint(req)}:${email || 'unknown-email'}`;
  },
  message: 'Too many recovery attempts. Try again after 15 minutes.',
  storePrefix: 'recovery',
});

const verificationRateLimiter = createLimiter({
  windowMs: envInt('RATE_LIMIT_VERIFICATION_WINDOW_MS', 15 * 60 * 1000),
  max: process.env.NODE_ENV === 'production'
    ? envInt('RATE_LIMIT_VERIFICATION_MAX', 12)
    : envInt('RATE_LIMIT_VERIFICATION_MAX_DEV', 60),
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    return `${getFingerprint(req)}:${email || 'unknown-email'}`;
  },
  message: 'Too many verification attempts. Try again after 15 minutes.',
  storePrefix: 'verify',
});

const apiRateLimiter = createLimiter({
  windowMs: envInt('RATE_LIMIT_API_WINDOW_MS', 15 * 60 * 1000),
  max: process.env.NODE_ENV === 'production'
    ? envInt('RATE_LIMIT_API_MAX', 1500)
    : envInt('RATE_LIMIT_API_MAX_DEV', 8000),
  keyGenerator: (req) => req.user?.userId ? `user:${req.user.userId}` : getFingerprint(req),
  skip: (req) => {
    const path = req.path || '';
    return (
      path === '/health' ||
      path === '/version' ||
      path === '/v1/health' ||
      path === '/v1/version'
    );
  },
  message: 'Too many API requests. Please slow down and try again shortly.',
  storePrefix: 'api',
});

const aiGenerationRateLimiter = createLimiter({
  windowMs: envInt('RATE_LIMIT_AI_WINDOW_MS', 10 * 60 * 1000),
  max: process.env.NODE_ENV === 'production'
    ? envInt('RATE_LIMIT_AI_MAX', 30)
    : envInt('RATE_LIMIT_AI_MAX_DEV', 200),
  keyGenerator: (req) => req.user?.userId ? `user:${req.user.userId}` : getFingerprint(req),
  message: 'Too many AI generation requests. Please wait a moment and retry.',
  storePrefix: 'ai',
});

module.exports = {
  accountCreationRateLimiter,
  aiGenerationRateLimiter,
  apiRateLimiter,
  authRateLimiter,
  loginRateLimiter,
  recoveryRateLimiter,
  verificationRateLimiter,
};
