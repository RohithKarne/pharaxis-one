'use strict';
/**
 * Auth module regression tests
 */
module.exports = [
  {
    name: 'Login with valid superadmin credentials',
    module: 'Auth',
    run: async ({ makeRequest }) => {
      const res = await makeRequest('POST', '/api/auth/login', { email: 'superadmin', password: 'Manager@123' }, null)
      return { pass: res.status === 200 && !!res.body?.token, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'Login with invalid credentials returns 401',
    module: 'Auth',
    run: async ({ makeRequest }) => {
      const res = await makeRequest('POST', '/api/auth/login', { email: 'nobody@fake.com', password: 'wrong' }, null)
      return { pass: res.status === 401, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/auth/me with valid token returns user',
    module: 'Auth',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/auth/me', null, token)
      return { pass: res.status === 200 && !!res.body?.user, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/auth/me without token returns 401',
    module: 'Auth',
    run: async ({ makeRequest }) => {
      const res = await makeRequest('GET', '/api/auth/me', null, null)
      return { pass: res.status === 401, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/health returns ok',
    module: 'Auth',
    run: async ({ makeRequest }) => {
      const res = await makeRequest('GET', '/api/health', null, null)
      return { pass: res.status === 200 && res.body?.status === 'ok', details: `Status: ${res.status}` }
    }
  },
]
