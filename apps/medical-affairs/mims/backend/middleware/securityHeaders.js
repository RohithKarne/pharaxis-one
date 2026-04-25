'use strict';

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  const isSecure = req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  if (isSecure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  next();
}

module.exports = { securityHeaders };
