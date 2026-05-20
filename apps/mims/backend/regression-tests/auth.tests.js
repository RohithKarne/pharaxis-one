'use strict';
/**
 * Auth module regression tests
 */

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

async function loginWithCandidates(makeRequest) {
  const errors = [];
  for (const candidate of getLoginCandidates()) {
    const res = await makeRequest('POST', '/api/auth/login', {
      email: candidate.email,
      password: candidate.password,
    }, null);

    if (res.status === 200 && res.body?.token) {
      return { ok: true, token: res.body.token, details: `Status: ${res.status} via ${candidate.label}` };
    }

    if (res.status === 200 && res.body?.challengeToken) {
      const skip = await makeRequest('POST', '/api/auth/2fa/skip-setup', {
        challengeToken: res.body.challengeToken,
      }, null);
      if (skip.status === 200 && skip.body?.token) {
        return { ok: true, token: skip.body.token, details: `Status: ${skip.status} via ${candidate.label}+2fa-skip` };
      }
      errors.push(`${candidate.label}: login=${res.status}, skip=${skip.status}`);
      continue;
    }

    errors.push(`${candidate.label}: status=${res.status}`);
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
    covers: ['POST /api/auth/login', 'POST /api/auth/2fa/skip-setup'],
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
