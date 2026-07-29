'use strict';

require('dotenv').config();
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
