'use strict';
/**
 * Cases module regression tests
 */
module.exports = [
  {
    name: 'GET /api/cases returns list',
    module: 'Cases',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cases', null, token)
      return { pass: res.status === 200 && Array.isArray(res.body?.cases ?? res.body), details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/cases without auth returns 401',
    module: 'Cases',
    run: async ({ makeRequest }) => {
      const res = await makeRequest('GET', '/api/cases', null, null)
      return { pass: res.status === 401, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/cases/:id with non-existent ID returns 404',
    module: 'Cases',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cases/999999999', null, token)
      return { pass: res.status === 404 || res.status === 400, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/users returns active users list',
    module: 'Cases',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/users', null, token)
      return { pass: res.status === 200 && Array.isArray(res.body), details: `Status: ${res.status}, count: ${res.body?.length}` }
    }
  },
]
