'use strict';
/**
 * Content Management — Documents regression tests
 */
let createdDocId = null;
let createdFolderId = null;

module.exports = [
  {
    name: 'GET /api/cm/folders returns folders list',
    module: 'CM Folders',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cm/folders', null, token)
      return { pass: res.status === 200 && Array.isArray(res.body?.folders ?? []), details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/cm/documents returns documents list',
    module: 'CM Documents',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cm/documents', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/cm/documents without auth returns 401',
    module: 'CM Documents',
    run: async ({ makeRequest }) => {
      const res = await makeRequest('GET', '/api/cm/documents', null, null)
      return { pass: res.status === 401, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/cm/picklists returns picklists',
    module: 'CM Picklists',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cm/picklists', null, token)
      return { pass: res.status === 200 && Array.isArray(res.body?.picklists ?? []), details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/cm/settings returns settings',
    module: 'CM Settings',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cm/settings', null, token)
      return { pass: res.status === 200 && typeof res.body?.settings === 'object', details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/cm/modules returns modules list',
    module: 'CM Modules',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cm/modules', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/cm/faqs returns FAQs list',
    module: 'CM FAQs',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cm/faqs', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/cm/templates returns templates list',
    module: 'CM Templates',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cm/templates', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
]
