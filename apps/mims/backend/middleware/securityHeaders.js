'use strict';

// ── Content-Security-Policy ───────────────────────────────────────────────────
// Default: Report-Only (observe violations, don't block).
// Set CSP_ENFORCE=true in .env to switch to enforcing mode.
// Set CSP_REPORT_URI to collect violation reports (e.g. /api/admin/csp-report).
// Directives are deliberately permissive for 'unsafe-inline' styles because
// TipTap rich-text editor and the React app both require it.  Tighten after
// auditing violation reports in production.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "media-src 'none'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const CSP_REPORT_URI = process.env.CSP_REPORT_URI || null;
// M-06: In production, enforce CSP by default; only report-only when CSP_ENFORCE
// is explicitly set to the string 'false'. In non-production, default to
// report-only. NOTE: before shipping enforcing CSP to prod, run a browser
// CSP-violation check (DevTools console / report-uri) to confirm the directives
// above don't break the React app or the TipTap editor.
const CSP_ENFORCE = process.env.NODE_ENV === 'production'
  ? String(process.env.CSP_ENFORCE || '').toLowerCase() !== 'false'
  : String(process.env.CSP_ENFORCE || '').toLowerCase() === 'true';

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // Content-Security-Policy (report-only by default; enforce via env flag)
  const cspValue  = CSP_REPORT_URI ? `${CSP_DIRECTIVES}; report-uri ${CSP_REPORT_URI}` : CSP_DIRECTIVES;
  const cspHeader = CSP_ENFORCE ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';
  res.setHeader(cspHeader, cspValue);

  const isSecure = req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  if (isSecure) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains; preload');
  }

  next();
}

module.exports = { securityHeaders };
