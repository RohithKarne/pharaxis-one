'use strict';

require('dotenv').config();

// ssoService pulls in the auth middleware, which exits the process if these are
// unset outside development — and CI runs with NODE_ENV=test. Set before the
// service is required. The values are never used: nothing here signs or verifies
// a token. Same pattern as tests/paud2-remediation.js.
process.env.CP_ADMIN_JWT_SECRET  = process.env.CP_ADMIN_JWT_SECRET  || 'test-only-admin-secret';
process.env.CP_PORTAL_JWT_SECRET = process.env.CP_PORTAL_JWT_SECRET || 'test-only-portal-secret';

const assert = require('assert');
const sso = require('../services/ssoService');

console.log('Running SSO Configuration & URL Resolution unit tests...');

// 1. Verify provider key normalization
assert.strictEqual(sso.normalizeProviderKey('Google'), 'google');
assert.strictEqual(sso.normalizeProviderKey('Microsoft'), 'microsoft');
assert.strictEqual(sso.normalizeProviderKey('invalid'), null);

// 2. Verify domain parser
const domains = sso.parseAllowedDomains('novartis.com, example.org, GMAIL.COM');
assert.deepStrictEqual(domains, ['novartis.com', 'example.org', 'gmail.com']);

console.log('✅ SSO configuration unit tests passed!');
