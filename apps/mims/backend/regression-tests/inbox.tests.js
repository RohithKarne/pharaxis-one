'use strict';

const { uniqueName, getFirstInquiry } = require('./helpers');

module.exports = [
  {
    name: 'GET /api/inbox returns inquiry payload',
    module: 'Inbox',
    covers: ['GET /api/inbox'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/inbox', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.inquiries) && typeof res.body?.total === 'number',
        details: `Status: ${res.status}, total: ${res.body?.total ?? 'n/a'}`,
      };
    },
  },
  {
    name: 'GET /api/inbox/summary returns summary counts',
    module: 'Inbox',
    covers: ['GET /api/inbox/summary'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/inbox/summary', null, token);
      return {
        pass: res.status === 200 && typeof res.body?.total === 'number' && typeof res.body?.triage === 'object',
        details: `Status: ${res.status}`,
      };
    },
  },
  {
    name: 'GET /api/inbox/users returns assignable users',
    module: 'Inbox',
    covers: ['GET /api/inbox/users'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/inbox/users', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body?.users), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/inbox/templates returns template list',
    module: 'Inbox',
    covers: ['GET /api/inbox/templates'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/inbox/templates', null, token);
      return { pass: res.status === 200 && Array.isArray(res.body?.templates), details: `Status: ${res.status}` };
    },
  },
  {
    name: 'POST /api/inbox/templates validates required fields',
    module: 'Inbox',
    covers: ['POST /api/inbox/templates'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('POST', '/api/inbox/templates', { name: '', body: '' }, token);
      return { pass: res.status === 400, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'POST /api/inbox/templates creates template',
    module: 'Inbox',
    covers: ['POST /api/inbox/templates'],
    run: async ({ makeRequest, token }) => {
      const payload = {
        name: uniqueName('Regression Template'),
        subject: 'Regression Subject',
        body: 'Regression Body',
      };
      const res = await makeRequest('POST', '/api/inbox/templates', payload, token);
      const createdId = Number(res.body?.id || 0);
      if (createdId > 0) {
        await makeRequest('DELETE', `/api/inbox/templates/${createdId}`, null, token);
      }
      return { pass: res.status === 201 && createdId > 0, details: `Status: ${res.status}, id: ${createdId || 'n/a'}` };
    },
  },
  {
    name: 'PATCH /api/inbox/templates/:tid updates template',
    module: 'Inbox',
    covers: ['PATCH /api/inbox/templates/:tid'],
    run: async ({ makeRequest, token }) => {
      const create = await makeRequest('POST', '/api/inbox/templates', {
        name: uniqueName('Regression Template Update'),
        subject: 'Before',
        body: 'Before body',
      }, token);
      const createdId = Number(create.body?.id || 0);
      if (create.status !== 201 || !createdId) {
        return { pass: false, details: `create status: ${create.status}` };
      }
      const patch = await makeRequest('PATCH', `/api/inbox/templates/${createdId}`, {
        subject: 'After',
        body: 'After body',
      }, token);
      await makeRequest('DELETE', `/api/inbox/templates/${createdId}`, null, token);
      return { pass: patch.status === 200, details: `Status: ${patch.status}` };
    },
  },
  {
    name: 'DELETE /api/inbox/templates/:tid soft deletes template',
    module: 'Inbox',
    covers: ['DELETE /api/inbox/templates/:tid'],
    run: async ({ makeRequest, token }) => {
      const create = await makeRequest('POST', '/api/inbox/templates', {
        name: uniqueName('Regression Template Delete'),
        subject: 'Delete',
        body: 'Delete body',
      }, token);
      const createdId = Number(create.body?.id || 0);
      if (create.status !== 201 || !createdId) {
        return { pass: false, details: `create status: ${create.status}` };
      }
      const del = await makeRequest('DELETE', `/api/inbox/templates/${createdId}`, null, token);
      return { pass: del.status === 200, details: `Status: ${del.status}` };
    },
  },
  {
    name: 'GET /api/inbox/case/:caseId/correspondence returns 404 for missing case',
    module: 'Inbox',
    covers: ['GET /api/inbox/case/:caseId/correspondence'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/inbox/case/999999999/correspondence', null, token);
      return { pass: res.status === 404, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/inbox/routing-rules returns routing payload',
    module: 'Inbox',
    covers: ['GET /api/inbox/routing-rules'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/inbox/routing-rules', null, token);
      return { pass: res.status === 200, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/inbox/:id/history returns 404 for missing inquiry',
    module: 'Inbox',
    covers: ['GET /api/inbox/:id/history'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/inbox/999999999/history', null, token);
      return { pass: res.status === 404, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/inbox/:id/recommendations returns 404 for missing inquiry',
    module: 'Inbox',
    covers: ['GET /api/inbox/:id/recommendations'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/inbox/999999999/recommendations', null, token);
      return { pass: res.status === 404, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/inbox/:id/read-receipts returns payload for a real inquiry when available',
    module: 'Inbox',
    covers: ['GET /api/inbox/:id/read-receipts'],
    run: async ({ makeRequest, token }) => {
      const inquiry = await getFirstInquiry(makeRequest, token);
      if (!inquiry?.id) {
        return { pass: true, details: 'Skipped: no inquiry available in inbox.' };
      }
      const res = await makeRequest('GET', `/api/inbox/${inquiry.id}/read-receipts`, null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.receipts) && typeof res.body?.total === 'number',
        details: `Status: ${res.status}, total: ${res.body?.total ?? 'n/a'}`,
      };
    },
  },
  {
    name: 'GET /api/inbox/:id/notes returns 404 for missing inquiry',
    module: 'Inbox',
    covers: ['GET /api/inbox/:id/notes'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/inbox/999999999/notes', null, token);
      return { pass: res.status === 404, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'POST /api/inbox/:id/notes returns 404 for missing inquiry',
    module: 'Inbox',
    covers: ['POST /api/inbox/:id/notes'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('POST', '/api/inbox/999999999/notes', { note: 'Regression note' }, token);
      return { pass: res.status === 404, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/inbox/:id/thread returns 404 for missing inquiry',
    module: 'Inbox',
    covers: ['GET /api/inbox/:id/thread'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/inbox/999999999/thread', null, token);
      return { pass: res.status === 404, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/inbox/:id/attachments returns 404 for missing inquiry',
    module: 'Inbox',
    covers: ['GET /api/inbox/:id/attachments'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/inbox/999999999/attachments', null, token);
      return { pass: res.status === 404, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'PATCH /api/inbox/:id returns 404 for missing inquiry',
    module: 'Inbox',
    covers: ['PATCH /api/inbox/:id'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('PATCH', '/api/inbox/999999999', {
        status: 'new',
        color: null,
      }, token);
      return { pass: res.status === 404, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'PATCH /api/inbox/:id marks an inquiry as read and persists the receipt when available',
    module: 'Inbox',
    covers: ['PATCH /api/inbox/:id', 'GET /api/inbox/:id/read-receipts'],
    run: async ({ makeRequest, token }) => {
      const inquiry = await getFirstInquiry(makeRequest, token);
      if (!inquiry?.id) {
        return { pass: true, details: 'Skipped: no inquiry available in inbox.' };
      }
      const patch = await makeRequest('PATCH', `/api/inbox/${inquiry.id}`, { is_read: true }, token);
      const receipts = await makeRequest('GET', `/api/inbox/${inquiry.id}/read-receipts`, null, token);
      return {
        pass: patch.status === 200 && receipts.status === 200 && Array.isArray(receipts.body?.receipts) && receipts.body.receipts.length >= 1,
        details: `patch=${patch.status}, receipts=${receipts.status}, total=${receipts.body?.total ?? 'n/a'}`,
      };
    },
  },
  {
    name: 'POST /api/inbox/:id/reply validates required fields',
    module: 'Inbox',
    covers: ['POST /api/inbox/:id/reply'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('POST', '/api/inbox/999999999/reply', {}, token);
      return { pass: res.status === 400, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'POST /api/inbox/:id/forward validates required fields',
    module: 'Inbox',
    covers: ['POST /api/inbox/:id/forward'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('POST', '/api/inbox/999999999/forward', {}, token);
      return { pass: res.status === 400, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'POST /api/inbox/:id/link-case validates required case id',
    module: 'Inbox',
    covers: ['POST /api/inbox/:id/link-case'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('POST', '/api/inbox/999999999/link-case', {}, token);
      return { pass: res.status === 400, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'GET /api/inbox/attachments/:aid/download returns 404 for missing attachment',
    module: 'Inbox',
    covers: ['GET /api/inbox/attachments/:aid/download'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/inbox/attachments/999999999/download', null, token);
      return { pass: res.status === 404, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'POST /api/inbox/bulk-update validates required ids',
    module: 'Inbox',
    covers: ['POST /api/inbox/bulk-update'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('POST', '/api/inbox/bulk-update', {}, token);
      return { pass: res.status === 400, details: `Status: ${res.status}` };
    },
  },
  {
    name: 'POST /api/inbox/fetch returns ingest summary',
    module: 'Inbox',
    covers: ['POST /api/inbox/fetch'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('POST', '/api/inbox/fetch', {}, token);
      return {
        pass: res.status === 200 && typeof res.body?.ingested === 'number',
        details: `Status: ${res.status}, ingested: ${res.body?.ingested ?? 'n/a'}`,
      };
    },
  },
  {
    name: 'Routing rules lifecycle covers create update delete',
    module: 'Inbox',
    covers: [
      'POST /api/inbox/routing-rules',
      'PUT /api/inbox/routing-rules/:id',
      'DELETE /api/inbox/routing-rules/:id',
    ],
    run: async ({ makeRequest, token }) => {
      const payload = {
        name: uniqueName('Regression Routing Rule'),
        queue_name: 'General',
        priority: 101,
        sender_contains: 'regression@example.com',
        routing_note: 'Regression rule',
      };
      const create = await makeRequest('POST', '/api/inbox/routing-rules', payload, token);
      const createdId = Number(create.body?.id || 0);
      if (create.status !== 201 || !createdId) {
        return { pass: false, details: `create status: ${create.status}` };
      }
      const update = await makeRequest('PUT', `/api/inbox/routing-rules/${createdId}`, {
        name: `${payload.name} Updated`,
        queue_name: 'General',
        priority: 102,
        is_active: true,
      }, token);
      const remove = await makeRequest('DELETE', `/api/inbox/routing-rules/${createdId}`, null, token);
      return {
        pass: update.status === 200 && remove.status === 200,
        details: `create=${create.status}, update=${update.status}, delete=${remove.status}`,
      };
    },
  },
];
