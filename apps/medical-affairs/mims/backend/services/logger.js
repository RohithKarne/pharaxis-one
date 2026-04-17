const pino = require('pino');

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const redact = {
  paths: [
    'req.headers.authorization',
    'req.headers.cookie',
    '*.password',
    '*.token',
    '*.refreshToken',
    '*.jwt',
    '*.secret',
    '*.apiKey',
    '*.smtp_pass',
  ],
  censor: '[REDACTED]',
};

const logger = pino({
  level,
  redact,
  base: {
    service: 'mims-backend',
    env: process.env.APP_ENV || process.env.NODE_ENV || 'development',
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = { logger };
