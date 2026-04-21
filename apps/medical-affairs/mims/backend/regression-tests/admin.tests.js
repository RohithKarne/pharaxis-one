'use strict';
/**
 * Admin module regression tests
 */
module.exports = [
  {
    name: 'GET /api/admin/mi-categories returns categories',
    module: 'Admin — MI Categories',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/mi-categories', null, token)
      return { pass: res.status === 200 && Array.isArray(res.body?.categories ?? []), details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/sites returns sites',
    module: 'Admin — Sites',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/sites', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/email-accounts returns accounts',
    module: 'Admin — Email Accounts',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/email-accounts', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/picklists returns picklists',
    module: 'Admin — Picklists',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/picklists', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/products-full returns products',
    module: 'Admin — Products',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/products-full', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/security-groups returns groups',
    module: 'Admin — Security Groups',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/security-groups', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/audit-logs returns audit entries',
    module: 'Admin — Audit Trail',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/audit-logs', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/field-setup returns fields',
    module: 'Admin — Field Setup',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/field-setup', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
]
