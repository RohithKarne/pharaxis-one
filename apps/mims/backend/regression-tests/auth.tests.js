'use strict';
/**
 * Auth module regression tests
 */

const { signIn } = require('../utils/signInClient');

function getLoginCandidates() {
  const raw = [
    {
      email: process.env.BOOTSTRAP_PLATFORM_ADMIN_EMAIL || 'platform_admin',
      password: process.env.BOOTSTRAP_PLATFORM_ADMIN_PASSWORD || '',
      label: 'bootstrap-platform-admin',
    },
    {
      email: process.env.REGRESSION_FALLBACK_EMAIL || '',
      password: process.env.REGRESSION_FALLBACK_PASSWORD || '',
      label: 'regression-fallback',
    },
    {
      email: process.env.REGRESSION_EMAIL || '',
      password: process.env.REGRESSION_PASSWORD || '',
      label: 'regression-user',
    },
    {
      email: 'vanaja_admin@reviewco.com',
      password: 'Test@1234',
      label: 'local-admin',
    },
  ];

  const seen = new Set();
  return raw.filter((candidate) => {
    const email = String(candidate.email || '').trim();
    const password = String(candidate.password || '');
    if (!email || !password) return false;
    const key = `${email}::${password}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// MIPM-82: sign in as a person does — cookie session, and 2FA with the account's
// authenticator when its organisation requires it. "Skip setup" is refused by design.
async function loginWithCandidates(makeRequest) {
  const errors = [];
  const post = async (path, body) => {
    const res = await makeRequest('POST', path, body, null);
    return { status: res.status, body: res.body, setCookie: res.headers?.['set-cookie'] };
  };
  for (const candidate of getLoginCandidates()) {
    const totpSecret = candidate.label === 'regression-user' ? process.env.REGRESSION_TOTP_SECRET : undefined;
    const result = await signIn(post, { email: candidate.email, password: candidate.password, totpSecret });
    if (result.token) {
      return { ok: true, token: result.token, details: `Session via ${candidate.label} (${result.step})` };
    }
    errors.push(`${candidate.label}: stopped at ${result.step} (${result.status})`);
  }

  return {
    ok: false,
    token: null,
    details: errors.length ? errors.join(' | ') : 'No configured login candidates.',
  };
}

module.exports = [
  {
    name: 'Login with valid configured privileged credentials',
    module: 'Auth',
    run: async ({ makeRequest }) => {
      const login = await loginWithCandidates(makeRequest)
      return { pass: login.ok, details: login.details }
    },
    covers: ['POST /api/auth/login', 'POST /api/auth/2fa/verify'],
  },
  {
    name: 'Login with invalid credentials returns 401',
    module: 'Auth',
    run: async ({ makeRequest }) => {
      const res = await makeRequest('POST', '/api/auth/login', { email: 'nobody@fake.com', password: 'wrong' }, null)
      return { pass: res.status === 401, details: `Status: ${res.status}` }
    },
    covers: ['POST /api/auth/login'],
  },
  {
    name: 'GET /api/auth/me with valid token returns user',
    module: 'Auth',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/auth/me', null, token)
      return { pass: res.status === 200 && !!res.body?.user, details: `Status: ${res.status}` }
    },
  },
  {
    name: 'GET /api/auth/me without token returns 401',
    module: 'Auth',
    run: async ({ makeRequest }) => {
      const res = await makeRequest('GET', '/api/auth/me', null, null)
      return { pass: res.status === 401, details: `Status: ${res.status}` }
    },
  },
  {
    name: 'GET /api/health returns ok',
    module: 'Auth',
    run: async ({ makeRequest }) => {
      const res = await makeRequest('GET', '/api/health', null, null)
      return { pass: res.status === 200 && res.body?.status === 'ok', details: `Status: ${res.status}` }
    },
  },
]
