'use strict';
module.exports = [
  {
    name: 'GET /api/notifications returns notification feed',
    module: 'Notifications',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/notifications', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/version returns version info',
    module: 'System',
    run: async ({ makeRequest }) => {
      const res = await makeRequest('GET', '/api/version', null, null)
      return { pass: res.status === 200 && !!res.body?.latest_version, details: `Status: ${res.status}` }
    }
  },
]
