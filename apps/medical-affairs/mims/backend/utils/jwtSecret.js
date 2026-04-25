'use strict';

const crypto = require('crypto');

const configuredSecret = (process.env.JWT_SECRET || '').trim();
const isProd = process.env.NODE_ENV === 'production';

if (isProd && configuredSecret.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters in production.');
}

// Dev/test fallback avoids fixed default secret. New process -> new secret.
const runtimeFallbackSecret = crypto.randomBytes(48).toString('hex');

module.exports = configuredSecret || runtimeFallbackSecret;
