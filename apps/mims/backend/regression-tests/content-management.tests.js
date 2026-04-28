'use strict';

const pool = require('../database/db');

const {
  getFirstCase,
  getFirstFolder,
  getFirstSecurityGroup,
  getFirstUser,
  uniqueName,
} = require('./helpers');

const REGRESSION_PASSWORD = process.env.REGRESSION_PASSWORD || 'Test@1234';

function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token || '').split('.');
    if (!payload) return {};
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (_) {
    return {};
  }
}

async function createContentFolder(makeRequest, token, label) {
  const create = await makeRequest('POST', '/api/cm/folders', {
    name: uniqueName(label),
    description: `${label} created by regression suite`,
  }, token);
  return {
    status: create.status,
    folderId: Number(create.body?.id || create.body?.folder?.id || 0),
  };
}

async function createTempOrgUser(orgId) {
  const email = `${uniqueName('content-regression-user').toLowerCase()}@example.com`;
  const [result] = await pool.execute(
    `INSERT INTO users (name, email, password, role, is_active)
     VALUES (?, ?, ?, 'admin', 1)`,
    ['Content Regression User', email, 'Temp@1234']
  );
  const userId = Number(result.insertId || 0);
  if (userId && orgId) {
    await pool.execute(
      `INSERT IGNORE INTO user_org_access (user_id, org_id, is_active) VALUES (?, ?, 1)`,
      [userId, orgId]
    );
  }
  return { userId, email };
}

module.exports = [
  {
    name: 'GET /api/cm/settings returns settings object',
    module: 'Content Management',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cm/settings', null, token);
      return {
        pass: res.status === 200 && typeof res.body?.settings === 'object' && res.body.settings !== null,
        details: `Status: ${res.status}`,
      };
    },
  },
  {
    name: 'PUT /api/cm/settings upserts org setting',
    module: 'Content Management',
    run: async ({ makeRequest, token }) => {
      const payload = {
        setting_key: 'regression_cm_setting',
        setting_value: { updated_at: new Date().toISOString(), source: 'regression' },
      };
      const res = await makeRequest('PUT', '/api/cm/settings', payload, token);
      return {
        pass: res.status === 200 && String(res.body?.message || '').includes('saved'),
        details: `Status: ${res.status}`,
      };
    },
  },
  {
    name: 'GET /api/cm/folders returns folders list',
    module: 'Content Management',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cm/folders', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.folders),
        details: `Status: ${res.status}, count: ${res.body?.folders?.length ?? 0}`,
      };
    },
  },
  {
    name: 'POST /api/cm/folders creates folder',
    module: 'Content Management',
    run: async ({ makeRequest, token }) => {
      const payload = {
        name: uniqueName('Regression Folder'),
        description: 'Created by regression suite',
      };
      const create = await makeRequest('POST', '/api/cm/folders', payload, token);
      const folderId = Number(create.body?.id || create.body?.folder?.id || 0);
      if (folderId > 0) {
        await makeRequest('DELETE', `/api/cm/folders/${folderId}`, null, token);
      }
      return {
        pass: create.status === 201 && folderId > 0,
        details: `Status: ${create.status}, id: ${folderId || 'n/a'}`,
      };
    },
  },
  {
    name: 'PUT /api/cm/folders/:id updates folder',
    module: 'Content Management',
    covers: ['PUT /api/cm/folders/:id'],
    run: async ({ makeRequest, token }) => {
      const create = await makeRequest('POST', '/api/cm/folders', {
        name: uniqueName('Regression Folder Update'),
        description: 'Before update',
      }, token);
      const folderId = Number(create.body?.id || create.body?.folder?.id || 0);
      if (create.status !== 201 || !folderId) {
        return { pass: false, details: `create status: ${create.status}` };
      }
      const update = await makeRequest('PUT', `/api/cm/folders/${folderId}`, {
        name: `${create.body?.folder?.name || 'Regression Folder'} Updated`,
        description: 'After update',
      }, token);
      await makeRequest('DELETE', `/api/cm/folders/${folderId}`, null, token);
      return {
        pass: update.status === 200,
        details: `Status: ${update.status}`,
      };
    },
  },
  {
    name: 'DELETE /api/cm/folders/:id deactivates folder',
    module: 'Content Management',
    covers: ['DELETE /api/cm/folders/:id'],
    run: async ({ makeRequest, token }) => {
      const create = await makeRequest('POST', '/api/cm/folders', {
        name: uniqueName('Regression Folder Delete'),
        description: 'Delete candidate',
      }, token);
      const folderId = Number(create.body?.id || create.body?.folder?.id || 0);
      if (create.status !== 201 || !folderId) {
        return { pass: false, details: `create status: ${create.status}` };
      }
      const del = await makeRequest('DELETE', `/api/cm/folders/${folderId}`, null, token);
      return {
        pass: del.status === 200,
        details: `Status: ${del.status}`,
      };
    },
  },
  {
    name: 'GET /api/cm/folders/bookmarks returns bookmarks list',
    module: 'Content Management',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cm/folders/bookmarks', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.bookmarks),
        details: `Status: ${res.status}`,
      };
    },
  },
  {
    name: 'GET /api/cm/folders/:id/permissions returns folder permissions',
    module: 'Content Management',
    covers: ['GET /api/cm/folders/:id/permissions'],
    run: async ({ makeRequest, token }) => {
      const existingFolder = await getFirstFolder(makeRequest, token);
      let folderId = Number(existingFolder?.id || 0);
      let createdForTest = false;

      if (!folderId) {
        const create = await makeRequest('POST', '/api/cm/folders', {
          name: uniqueName('Regression Permission Read'),
          description: 'Folder permission read test',
        }, token);
        folderId = Number(create.body?.id || create.body?.folder?.id || 0);
        createdForTest = create.status === 201 && folderId > 0;
      }

      if (!folderId) {
        return { pass: false, details: 'No folder available and temp folder creation failed.' };
      }
      const res = await makeRequest('GET', `/api/cm/folders/${folderId}/permissions`, null, token);
      if (createdForTest) {
        await makeRequest('DELETE', `/api/cm/folders/${folderId}`, null, token);
      }
      return {
        pass: res.status === 200 && Array.isArray(res.body?.permissions),
        details: `Status: ${res.status}, folder: ${folderId}`,
      };
    },
  },
  {
    name: 'POST /api/cm/folders/:id/permissions assigns folder permission',
    module: 'Content Management',
    covers: ['POST /api/cm/folders/:id/permissions'],
    run: async ({ makeRequest, token }) => {
      const folderCreate = await makeRequest('POST', '/api/cm/folders', {
        name: uniqueName('Regression Permission Folder'),
        description: 'Permission test folder',
      }, token);
      const folderId = Number(folderCreate.body?.id || folderCreate.body?.folder?.id || 0);
      const group = await getFirstSecurityGroup(makeRequest, token);
      if (folderCreate.status !== 201 || !folderId || !group?.id) {
        if (folderId) await makeRequest('DELETE', `/api/cm/folders/${folderId}`, null, token);
        return { pass: false, details: `folder=${folderId || 'n/a'} group=${group?.id || 'n/a'}` };
      }
      const assign = await makeRequest('POST', `/api/cm/folders/${folderId}/permissions`, {
        security_group_id: group.id,
        permission_level: 'read',
      }, token);
      await makeRequest('DELETE', `/api/cm/folders/${folderId}/permissions/${group.id}`, null, token);
      await makeRequest('DELETE', `/api/cm/folders/${folderId}`, null, token);
      return {
        pass: assign.status === 200 && assign.body?.success === true,
        details: `Status: ${assign.status}`,
      };
    },
  },
  {
    name: 'DELETE /api/cm/folders/:id/permissions/:groupId removes folder permission',
    module: 'Content Management',
    covers: ['DELETE /api/cm/folders/:id/permissions/:groupId'],
    run: async ({ makeRequest, token }) => {
      const folderCreate = await makeRequest('POST', '/api/cm/folders', {
        name: uniqueName('Regression Permission Delete'),
        description: 'Permission delete folder',
      }, token);
      const folderId = Number(folderCreate.body?.id || folderCreate.body?.folder?.id || 0);
      const group = await getFirstSecurityGroup(makeRequest, token);
      if (folderCreate.status !== 201 || !folderId || !group?.id) {
        if (folderId) await makeRequest('DELETE', `/api/cm/folders/${folderId}`, null, token);
        return { pass: false, details: `folder=${folderId || 'n/a'} group=${group?.id || 'n/a'}` };
      }
      const assign = await makeRequest('POST', `/api/cm/folders/${folderId}/permissions`, {
        security_group_id: group.id,
        permission_level: 'read',
      }, token);
      const del = await makeRequest('DELETE', `/api/cm/folders/${folderId}/permissions/${group.id}`, null, token);
      await makeRequest('DELETE', `/api/cm/folders/${folderId}`, null, token);
      return {
        pass: assign.status === 200 && del.status === 200 && del.body?.success === true,
        details: `assign=${assign.status}, delete=${del.status}`,
      };
    },
  },
  {
    name: 'GET /api/cm/picklists/field-types returns field type list',
    module: 'Content Management',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cm/picklists/field-types', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.field_types),
        details: `Status: ${res.status}`,
      };
    },
  },
  {
    name: 'GET /api/cm/picklists returns picklist list',
    module: 'Content Management',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cm/picklists', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.picklists),
        details: `Status: ${res.status}, count: ${res.body?.picklists?.length ?? 0}`,
      };
    },
  },
  {
    name: 'POST /api/cm/picklists creates picklist item',
    module: 'Content Management',
    run: async ({ makeRequest, token }) => {
      const value = uniqueName('regression-pick').toLowerCase();
      const create = await makeRequest('POST', '/api/cm/picklists', {
        field_type: 'regression_test',
        value,
        label: `Label ${value}`,
        sort_order: 10,
      }, token);
      const picklistId = Number(create.body?.picklist?.id || 0);
      if (picklistId > 0) {
        await makeRequest('DELETE', `/api/cm/picklists/${picklistId}`, null, token);
      }
      return {
        pass: create.status === 201 && picklistId > 0,
        details: `Status: ${create.status}, id: ${picklistId || 'n/a'}`,
      };
    },
  },
  {
    name: 'PUT /api/cm/picklists/:id updates picklist item',
    module: 'Content Management',
    covers: ['PUT /api/cm/picklists/:id'],
    run: async ({ makeRequest, token }) => {
      const value = uniqueName('regression-pick-update').toLowerCase();
      const create = await makeRequest('POST', '/api/cm/picklists', {
        field_type: 'regression_test',
        value,
        label: `Label ${value}`,
        sort_order: 5,
      }, token);
      const picklistId = Number(create.body?.picklist?.id || 0);
      if (create.status !== 201 || !picklistId) {
        return { pass: false, details: `create status: ${create.status}` };
      }
      const update = await makeRequest('PUT', `/api/cm/picklists/${picklistId}`, {
        field_type: 'regression_test',
        value: `${value}-edited`,
        label: `Edited ${value}`,
        sort_order: 7,
        is_active: true,
      }, token);
      await makeRequest('DELETE', `/api/cm/picklists/${picklistId}`, null, token);
      return {
        pass: update.status === 200 && String(update.body?.picklist?.value || '').includes('-edited'),
        details: `Status: ${update.status}`,
      };
    },
  },
  {
    name: 'DELETE /api/cm/picklists/:id deletes picklist item',
    module: 'Content Management',
    covers: ['DELETE /api/cm/picklists/:id'],
    run: async ({ makeRequest, token }) => {
      const value = uniqueName('regression-pick-delete').toLowerCase();
      const create = await makeRequest('POST', '/api/cm/picklists', {
        field_type: 'regression_test',
        value,
        label: `Delete ${value}`,
      }, token);
      const picklistId = Number(create.body?.picklist?.id || 0);
      if (create.status !== 201 || !picklistId) {
        return { pass: false, details: `create status: ${create.status}` };
      }
      const del = await makeRequest('DELETE', `/api/cm/picklists/${picklistId}`, null, token);
      return {
        pass: del.status === 200 && del.body?.success === true,
        details: `Status: ${del.status}`,
      };
    },
  },
  {
    name: 'GET /api/cm/documents returns documents payload',
    module: 'Content Management',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cm/documents?limit=5', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.documents),
        details: `Status: ${res.status}, total: ${res.body?.total ?? 'n/a'}`,
      };
    },
  },
  {
    name: 'GET /api/cm/faqs returns FAQ payload',
    module: 'Content Management',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cm/faqs?limit=5', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.faqs),
        details: `Status: ${res.status}, total: ${res.body?.total ?? 'n/a'}`,
      };
    },
  },
  {
    name: 'GET /api/cm/modules returns module payload',
    module: 'Content Management',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cm/modules?limit=5', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.modules),
        details: `Status: ${res.status}, total: ${res.body?.total ?? 'n/a'}`,
      };
    },
  },
  {
    name: 'GET /api/cm/templates returns template payload',
    module: 'Content Management',
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cm/templates?limit=5', null, token);
      return {
        pass: res.status === 200 && Array.isArray(res.body?.templates),
        details: `Status: ${res.status}, total: ${res.body?.total ?? 'n/a'}`,
      };
    },
  },
  {
    name: 'POST /api/cm/templates creates template',
    module: 'Content Management',
    run: async ({ makeRequest, token }) => {
      const payload = {
        type: 'Response',
        name: uniqueName('Regression Template'),
        subject: 'Regression Subject',
        body_html: '<p>Regression template body</p>',
        status: 'Active',
      };
      const res = await makeRequest('POST', '/api/cm/templates', payload, token);
      return {
        pass: res.status === 201 && Number(res.body?.id || 0) > 0,
        details: `Status: ${res.status}, id: ${res.body?.id || 'n/a'}`,
      };
    },
  },
  {
    name: 'GET /api/cm/templates/:id returns created template',
    module: 'Content Management',
    covers: ['GET /api/cm/templates/:id'],
    run: async ({ makeRequest, token }) => {
      const create = await makeRequest('POST', '/api/cm/templates', {
        type: 'Response',
        name: uniqueName('Regression Template Read'),
        subject: 'Read Subject',
        body_html: '<p>Read body</p>',
      }, token);
      const templateId = Number(create.body?.id || create.body?.template?.id || 0);
      if (create.status !== 201 || !templateId) {
        return { pass: false, details: `create status: ${create.status}` };
      }
      const read = await makeRequest('GET', `/api/cm/templates/${templateId}`, null, token);
      return {
        pass: read.status === 200 && Number(read.body?.template?.id || 0) === templateId,
        details: `Status: ${read.status}, id: ${templateId}`,
      };
    },
  },
  {
    name: 'PUT /api/cm/templates/:id updates created template',
    module: 'Content Management',
    covers: ['PUT /api/cm/templates/:id'],
    run: async ({ makeRequest, token }) => {
      const create = await makeRequest('POST', '/api/cm/templates', {
        type: 'Response',
        name: uniqueName('Regression Template Update'),
        subject: 'Before',
        body_html: '<p>Before</p>',
      }, token);
      const templateId = Number(create.body?.id || create.body?.template?.id || 0);
      if (create.status !== 201 || !templateId) {
        return { pass: false, details: `create status: ${create.status}` };
      }
      const update = await makeRequest('PUT', `/api/cm/templates/${templateId}`, {
        type: 'Response',
        name: `${create.body?.template?.name || 'Template'} Updated`,
        subject: 'After',
        body_html: '<p>After</p>',
        status: 'Active',
      }, token);
      return {
        pass: update.status === 200,
        details: `Status: ${update.status}`,
      };
    },
  },
  {
    name: 'PATCH /api/cm/templates/:id/status toggles template status',
    module: 'Content Management',
    covers: ['PATCH /api/cm/templates/:id/status'],
    run: async ({ makeRequest, token }) => {
      const create = await makeRequest('POST', '/api/cm/templates', {
        type: 'Response',
        name: uniqueName('Regression Template Status'),
        subject: 'Status',
        body_html: '<p>Status</p>',
        status: 'Active',
      }, token);
      const templateId = Number(create.body?.id || create.body?.template?.id || 0);
      if (create.status !== 201 || !templateId) {
        return { pass: false, details: `create status: ${create.status}` };
      }
      const toggle = await makeRequest('PATCH', `/api/cm/templates/${templateId}/status`, {}, token);
      return {
        pass: toggle.status === 200 && toggle.body?.status === 'Inactive',
        details: `Status: ${toggle.status}, next: ${toggle.body?.status || 'n/a'}`,
      };
    },
  },
  {
    name: 'POST /api/cm/templates/:id/checkin writes version entry',
    module: 'Content Management',
    covers: ['POST /api/cm/templates/:id/checkin'],
    run: async ({ makeRequest, token }) => {
      const create = await makeRequest('POST', '/api/cm/templates', {
        type: 'Response',
        name: uniqueName('Regression Template Checkin'),
        subject: 'Checkin',
        body_html: '<p>Checkin body</p>',
      }, token);
      const templateId = Number(create.body?.id || create.body?.template?.id || 0);
      if (create.status !== 201 || !templateId) {
        return { pass: false, details: `create status: ${create.status}` };
      }
      const checkin = await makeRequest('POST', `/api/cm/templates/${templateId}/checkin`, {
        notes: 'Regression version snapshot',
      }, token);
      return {
        pass: checkin.status === 200 && String(checkin.body?.version || '').includes('.'),
        details: `Status: ${checkin.status}, version: ${checkin.body?.version || 'n/a'}`,
      };
    },
  },
  {
    name: 'GET /api/cm/templates/:id/versions returns version history',
    module: 'Content Management',
    covers: ['GET /api/cm/templates/:id/versions'],
    run: async ({ makeRequest, token }) => {
      const create = await makeRequest('POST', '/api/cm/templates', {
        type: 'Response',
        name: uniqueName('Regression Template Versions'),
        subject: 'Versions',
        body_html: '<p>Versions body</p>',
      }, token);
      const templateId = Number(create.body?.id || create.body?.template?.id || 0);
      if (create.status !== 201 || !templateId) {
        return { pass: false, details: `create status: ${create.status}` };
      }
      await makeRequest('POST', `/api/cm/templates/${templateId}/checkin`, {
        notes: 'Regression versions',
      }, token);
      const versions = await makeRequest('GET', `/api/cm/templates/${templateId}/versions`, null, token);
      return {
        pass: versions.status === 200 && Array.isArray(versions.body?.versions),
        details: `Status: ${versions.status}, count: ${versions.body?.versions?.length ?? 0}`,
      };
    },
  },
  {
    name: 'Content document routes cover full lifecycle relations alerts usage and maintenance',
    module: 'Content Management',
    covers: [
      'POST /api/cm/documents',
      'GET /api/cm/documents/:id',
      'PUT /api/cm/documents/:id',
      'GET /api/cm/documents/search',
      'POST /api/cm/documents/:id/checkout',
      'POST /api/cm/documents/:id/checkin',
      'POST /api/cm/documents/:id/initiate-review',
      'POST /api/cm/documents/:id/approve',
      'POST /api/cm/documents/:id/publish',
      'POST /api/cm/documents/:id/release',
      'POST /api/cm/documents/:id/archive',
      'GET /api/cm/documents/:id/relations',
      'POST /api/cm/documents/:id/relations',
      'DELETE /api/cm/documents/:id/relations/:rel_id',
      'GET /api/cm/documents/:id/alert-config',
      'PUT /api/cm/documents/:id/alert-config',
      'POST /api/cm/documents/:id/alert-subs',
      'DELETE /api/cm/documents/:id/alert-subs/:sub_id',
      'GET /api/cm/documents/:id/versions',
      'GET /api/cm/documents/:id/version-diff',
      'GET /api/cm/documents/:id/activity',
      'POST /api/cm/documents/release-stale-checkouts',
      'POST /api/cm/documents/bulk',
      'POST /api/cm/content-usage',
      'GET /api/cm/content-usage/:contentType/:contentId',
      'GET /api/cm/documents/module-usage/:moduleId',
      'GET /api/cm/documents/:id/download',
      'GET /api/cm/documents/:id/file',
    ],
    run: async ({ makeRequest, token }) => {
      let folderId = null;
      let moduleId = null;
      let primaryDocId = null;
      let relatedDocId = null;
      let moduleDocId = null;
      let staleDocId = null;
      let reviewId = null;
      let relationId = null;
      let alertSubId = null;
      try {
        const auth = decodeJwtPayload(token);
        const ownerUserId = Number(auth.userId || auth.user_id || 0);
        if (!ownerUserId) {
          return { pass: false, details: 'Missing userId on token.' };
        }

        const folder = await createContentFolder(makeRequest, token, 'Regression Document Folder');
        folderId = folder.folderId;
        if (folder.status !== 201 || !folderId) {
          return { pass: false, details: `folderCreate=${folder.status}` };
        }

        const moduleCreate = await makeRequest('POST', '/api/cm/modules', {
          folder_id: folderId,
          name: uniqueName('Regression Usage Module'),
          content_html: '<p>Regression usage module content</p>',
        }, token);
        moduleId = Number(moduleCreate.body?.id || moduleCreate.body?.module?.id || 0);
        if (moduleCreate.status !== 201 || !moduleId) {
          return { pass: false, details: `moduleCreate=${moduleCreate.status}` };
        }

        const createPrimary = await makeRequest('POST', '/api/cm/documents', {
          folder_id: folderId,
          doc_type: 'SRD',
          name: uniqueName('Regression Primary Document'),
          content_html: '<p>Primary document content</p>',
          search_tags: 'regression,primary',
          document_category: 'Regression',
          standard_response_text: 'Regression response text',
        }, token);
        primaryDocId = Number(createPrimary.body?.id || createPrimary.body?.document?.id || 0);
        if (createPrimary.status !== 201 || !primaryDocId) {
          return { pass: false, details: `primaryCreate=${createPrimary.status}` };
        }

        const createRelated = await makeRequest('POST', '/api/cm/documents', {
          folder_id: folderId,
          doc_type: 'SRD',
          name: uniqueName('Regression Related Document'),
          content_html: '<p>Related document content</p>',
        }, token);
        relatedDocId = Number(createRelated.body?.id || createRelated.body?.document?.id || 0);
        if (createRelated.status !== 201 || !relatedDocId) {
          return { pass: false, details: `relatedCreate=${createRelated.status}` };
        }

        const createModuleDoc = await makeRequest('POST', '/api/cm/documents', {
          folder_id: folderId,
          doc_type: 'SRD',
          response_doc_type: 'Module',
          selected_modules: JSON.stringify([moduleId]),
          name: uniqueName('Regression Module Document'),
          content_html: '<p>Module document shell</p>',
        }, token);
        moduleDocId = Number(createModuleDoc.body?.id || createModuleDoc.body?.document?.id || 0);
        if (createModuleDoc.status !== 201 || !moduleDocId) {
          return { pass: false, details: `moduleDocCreate=${createModuleDoc.status}` };
        }

        const createStale = await makeRequest('POST', '/api/cm/documents', {
          folder_id: folderId,
          doc_type: 'SRD',
          name: uniqueName('Regression Stale Checkout Document'),
          content_html: '<p>Stale checkout document</p>',
        }, token);
        staleDocId = Number(createStale.body?.id || createStale.body?.document?.id || 0);
        if (createStale.status !== 201 || !staleDocId) {
          return { pass: false, details: `staleCreate=${createStale.status}` };
        }

        const getOne = await makeRequest('GET', `/api/cm/documents/${primaryDocId}`, null, token);
        const update = await makeRequest('PUT', `/api/cm/documents/${primaryDocId}`, {
          name: `${createPrimary.body?.document?.name || 'Regression Primary'} Updated`,
          content_html: '<p>Primary document content updated</p>',
          search_tags: 'regression,primary,updated',
        }, token);
        const search = await makeRequest('GET', `/api/cm/documents/search?q=${encodeURIComponent('Regression')}`, null, token);

        const relationCreate = await makeRequest('POST', `/api/cm/documents/${primaryDocId}/relations`, {
          related_doc_id: relatedDocId,
          relation_type: 'Supports',
        }, token);
        relationId = Number(relationCreate.body?.id || 0);
        const relationGet = await makeRequest('GET', `/api/cm/documents/${primaryDocId}/relations`, null, token);
        const relationDelete = await makeRequest('DELETE', `/api/cm/documents/${primaryDocId}/relations/${relationId}`, null, token);
        relationId = null;

        const alertConfigGet = await makeRequest('GET', `/api/cm/documents/${primaryDocId}/alert-config`, null, token);
        const alertConfigPut = await makeRequest('PUT', `/api/cm/documents/${primaryDocId}/alert-config`, {
          alert_days: [7, 3, 1],
          alert_email_account_id: null,
        }, token);
        const subscriber = await makeRequest('POST', `/api/cm/documents/${primaryDocId}/alert-subs`, {
          user_id: ownerUserId,
        }, token);
        const [[alertSubRow]] = await pool.execute(
          'SELECT id FROM cm_document_alert_subs WHERE document_id = ? AND user_id = ? ORDER BY id DESC LIMIT 1',
          [primaryDocId, ownerUserId]
        );
        alertSubId = Number(alertSubRow?.id || 0);
        const subscriberDelete = await makeRequest('DELETE', `/api/cm/documents/${primaryDocId}/alert-subs/${alertSubId}`, null, token);
        alertSubId = null;

        const checkout = await makeRequest('POST', `/api/cm/documents/${primaryDocId}/checkout`, {}, token);
        const checkin = await makeRequest('POST', `/api/cm/documents/${primaryDocId}/checkin`, {
          notes: 'Regression checkin',
          bump_type: 'major',
        }, token);
        const initiateReview = await makeRequest('POST', `/api/cm/documents/${primaryDocId}/initiate-review`, {
          title: uniqueName('Regression Document Review'),
          planned_end_date: '2026-05-15',
          reviewer_ids: [ownerUserId],
          is_non_amendable: false,
          description: 'Regression document review',
        }, token);
        reviewId = Number(initiateReview.body?.review_id || 0);
        const approve = await makeRequest('POST', `/api/cm/documents/${primaryDocId}/approve`, {
          password: REGRESSION_PASSWORD,
          reason: 'Regression approval',
        }, token);
        const publish = await makeRequest('POST', `/api/cm/documents/${primaryDocId}/publish`, {
          password: REGRESSION_PASSWORD,
          reason: 'Regression publish',
        }, token);
        const versions = await makeRequest('GET', `/api/cm/documents/${primaryDocId}/versions?page=1&limit=10`, null, token);
        const versionDiff = await makeRequest('GET', `/api/cm/documents/${primaryDocId}/version-diff?v1=2.0&v2=3.0`, null, token);
        const activity = await makeRequest('GET', `/api/cm/documents/${primaryDocId}/activity?page=1&limit=10`, null, token);
        const release = await makeRequest('POST', `/api/cm/documents/${primaryDocId}/release`, {}, token);
        const archive = await makeRequest('POST', `/api/cm/documents/${primaryDocId}/archive`, {
          reason: 'Regression archive',
        }, token);

        await pool.execute(
          `UPDATE cm_documents
           SET checked_out_by = ?, checked_out_at = DATE_SUB(NOW(), INTERVAL 3 HOUR), checkout_expires_at = DATE_SUB(NOW(), INTERVAL 1 HOUR), status = 'CheckedOut'
           WHERE id = ?`,
          [ownerUserId, staleDocId]
        );
        const releaseStale = await makeRequest('POST', '/api/cm/documents/release-stale-checkouts', {}, token);

        const bulk = await makeRequest('POST', '/api/cm/documents/bulk', {
          action: 'archive',
          ids: [relatedDocId, moduleDocId],
        }, token);

        const firstCase = await getFirstCase(makeRequest, token);
        if (!firstCase?.id) {
          return { pass: false, details: 'No case available for content-usage route.' };
        }
        const contentUsagePost = await makeRequest('POST', '/api/cm/content-usage', {
          content_type: 'document',
          content_id: primaryDocId,
          case_id: firstCase.id,
        }, token);
        const contentUsageGet = await makeRequest('GET', `/api/cm/content-usage/document/${primaryDocId}`, null, token);
        const moduleUsage = await makeRequest('GET', `/api/cm/documents/module-usage/${moduleId}`, null, token);
        const download = await makeRequest('GET', `/api/cm/documents/${primaryDocId}/download`, null, token);
        const file = await makeRequest('GET', `/api/cm/documents/${primaryDocId}/file`, null, token);

        return {
          pass: getOne.status === 200 &&
            update.status === 200 &&
            search.status === 200 &&
            relationCreate.status === 201 &&
            relationGet.status === 200 &&
            relationDelete.status === 200 &&
            alertConfigGet.status === 200 &&
            alertConfigPut.status === 200 &&
            subscriber.status === 201 &&
            subscriberDelete.status === 200 &&
            checkout.status === 200 &&
            checkin.status === 200 &&
            initiateReview.status === 201 &&
            reviewId > 0 &&
            approve.status === 200 &&
            publish.status === 200 &&
            versions.status === 200 &&
            versionDiff.status === 200 &&
            activity.status === 200 &&
            release.status === 200 &&
            archive.status === 200 &&
            releaseStale.status === 200 &&
            Number(releaseStale.body?.released || 0) >= 1 &&
            bulk.status === 200 &&
            contentUsagePost.status === 201 &&
            contentUsageGet.status === 200 &&
            moduleUsage.status === 200 &&
            download.status === 404 &&
            file.status === 404,
          details: `get=${getOne.status}, update=${update.status}, search=${search.status}, relationCreate=${relationCreate.status}, relationGet=${relationGet.status}, relationDelete=${relationDelete.status}, alertGet=${alertConfigGet.status}, alertPut=${alertConfigPut.status}, subAdd=${subscriber.status}, subDelete=${subscriberDelete.status}, checkout=${checkout.status}, checkin=${checkin.status}, initiateReview=${initiateReview.status}, approve=${approve.status}, publish=${publish.status}, versions=${versions.status}, versionDiff=${versionDiff.status}, activity=${activity.status}, release=${release.status}, archive=${archive.status}, releaseStale=${releaseStale.status}, bulk=${bulk.status}, usagePost=${contentUsagePost.status}, usageGet=${contentUsageGet.status}, moduleUsage=${moduleUsage.status}, download=${download.status}, file=${file.status}`,
        };
      } finally {
        if (alertSubId) await pool.execute('DELETE FROM cm_document_alert_subs WHERE id = ?', [alertSubId]).catch(() => {});
        if (relationId) await pool.execute('DELETE FROM cm_document_relations WHERE id = ?', [relationId]).catch(() => {});
        if (reviewId) {
          await pool.execute('DELETE FROM cm_reviewers WHERE review_id = ?', [reviewId]).catch(() => {});
          await pool.execute('DELETE FROM cm_reviews WHERE id = ?', [reviewId]).catch(() => {});
        }
        const docIds = [primaryDocId, relatedDocId, moduleDocId, staleDocId].filter(Boolean);
        if (docIds.length) {
          const placeholders = docIds.map(() => '?').join(',');
          await pool.execute(`DELETE FROM cm_content_usage WHERE content_type = 'document' AND content_id IN (${placeholders})`, docIds).catch(() => {});
          await pool.execute(`DELETE FROM cm_document_alert_subs WHERE document_id IN (${placeholders})`, docIds).catch(() => {});
          await pool.execute(`DELETE FROM cm_document_relations WHERE doc_id IN (${placeholders}) OR related_doc_id IN (${placeholders})`, [...docIds, ...docIds]).catch(() => {});
          await pool.execute(`DELETE FROM cm_document_activity_log WHERE doc_id IN (${placeholders})`, docIds).catch(() => {});
          await pool.execute(`DELETE FROM cm_version_history WHERE entity_type = 'document' AND entity_id IN (${placeholders})`, docIds).catch(() => {});
          await pool.execute(`DELETE FROM cm_documents WHERE id IN (${placeholders})`, docIds).catch(() => {});
        }
        if (moduleId) {
          await pool.execute('DELETE FROM cm_content_usage WHERE content_type = ? AND content_id = ?', ['module', moduleId]).catch(() => {});
          await pool.execute('DELETE FROM cm_version_history WHERE entity_type = ? AND entity_id = ?', ['module', moduleId]).catch(() => {});
          await pool.execute('DELETE FROM cm_modules WHERE id = ?', [moduleId]).catch(() => {});
        }
        if (folderId) await pool.execute('DELETE FROM cm_folders WHERE id = ?', [folderId]).catch(() => {});
      }
    },
  },
  {
    name: 'Content FAQ lifecycle routes cover create review engagement and archive',
    module: 'Content Management',
    covers: [
      'POST /api/cm/faqs',
      'GET /api/cm/faqs/:id',
      'PUT /api/cm/faqs/:id',
      'POST /api/cm/faqs/:id/checkout',
      'POST /api/cm/faqs/:id/checkin',
      'POST /api/cm/faqs/:id/approve',
      'POST /api/cm/faqs/:id/publish',
      'POST /api/cm/faqs/:id/view',
      'PATCH /api/cm/faqs/bulk-tags',
      'POST /api/cm/faqs/:id/archive',
    ],
    run: async ({ makeRequest, token }) => {
      let folderId = null;
      let faqId = null;
      try {
        const folder = await createContentFolder(makeRequest, token, 'Regression FAQ Folder');
        folderId = folder.folderId;
        if (folder.status !== 201 || !folderId) {
          return { pass: false, details: `folderCreate=${folder.status}` };
        }

        const create = await makeRequest('POST', '/api/cm/faqs', {
          folder_id: folderId,
          question: uniqueName('Regression FAQ question'),
          answer_html: '<p>Regression FAQ answer</p>',
          category: 'Regression',
          approval_required: true,
        }, token);
        faqId = Number(create.body?.id || create.body?.faq?.id || 0);
        if (create.status !== 201 || !faqId) {
          return { pass: false, details: `create=${create.status}` };
        }

        const getOne = await makeRequest('GET', `/api/cm/faqs/${faqId}`, null, token);
        const update = await makeRequest('PUT', `/api/cm/faqs/${faqId}`, {
          question: `${create.body?.faq?.question || 'Regression FAQ'} Updated`,
          answer_html: '<p>Updated answer</p>',
          category: 'Regression Updated',
          approval_required: true,
        }, token);
        const checkout = await makeRequest('POST', `/api/cm/faqs/${faqId}/checkout`, {}, token);
        const checkin = await makeRequest('POST', `/api/cm/faqs/${faqId}/checkin`, {
          notes: 'Regression FAQ checkin',
        }, token);
        const approve = await makeRequest('POST', `/api/cm/faqs/${faqId}/approve`, {
          password: REGRESSION_PASSWORD,
          reason: 'Regression FAQ approval',
        }, token);
        const publish = await makeRequest('POST', `/api/cm/faqs/${faqId}/publish`, {
          password: REGRESSION_PASSWORD,
          reason: 'Regression FAQ publish',
        }, token);
        const view = await makeRequest('POST', `/api/cm/faqs/${faqId}/view`, {}, token);
        const bulkTags = await makeRequest('PATCH', '/api/cm/faqs/bulk-tags', {
          ids: [faqId],
          tags: ['regression', 'faq'],
        }, token);
        const archive = await makeRequest('POST', `/api/cm/faqs/${faqId}/archive`, {
          reason: 'Regression archive',
        }, token);

        return {
          pass: getOne.status === 200 &&
            update.status === 200 &&
            checkout.status === 200 &&
            checkin.status === 200 &&
            approve.status === 200 &&
            publish.status === 200 &&
            view.status === 200 &&
            bulkTags.status === 200 &&
            Number(bulkTags.body?.updated || 0) >= 1 &&
            archive.status === 200,
          details: `create=${create.status}, get=${getOne.status}, update=${update.status}, checkout=${checkout.status}, checkin=${checkin.status}, approve=${approve.status}, publish=${publish.status}, view=${view.status}, bulkTags=${bulkTags.status}, archive=${archive.status}`,
        };
      } finally {
        if (faqId) {
          await pool.execute('DELETE FROM cm_reviewers WHERE review_id IN (SELECT id FROM cm_reviews WHERE doc_type = ? AND doc_id = ?)', ['faq', faqId]).catch(() => {});
          await pool.execute('DELETE FROM cm_reviews WHERE doc_type = ? AND doc_id = ?', ['faq', faqId]).catch(() => {});
          await pool.execute('DELETE FROM cm_version_history WHERE entity_type = ? AND entity_id = ?', ['faq', faqId]).catch(() => {});
          await pool.execute('DELETE FROM cm_faqs WHERE id = ?', [faqId]).catch(() => {});
        }
        if (folderId) {
          await pool.execute('DELETE FROM cm_folders WHERE id = ?', [folderId]).catch(() => {});
        }
      }
    },
  },
  {
    name: 'Content bookmarks and template render routes cover bookmark lifecycle and render',
    module: 'Content Management',
    covers: [
      'POST /api/cm/folders/bookmarks',
      'DELETE /api/cm/folders/bookmarks/:id',
      'POST /api/cm/templates/:id/render',
    ],
    run: async ({ makeRequest, token }) => {
      let folderId = null;
      let bookmarkId = null;
      let templateId = null;
      try {
        const folder = await createContentFolder(makeRequest, token, 'Regression Bookmark Folder');
        folderId = folder.folderId;
        if (folder.status !== 201 || !folderId) {
          return { pass: false, details: `folderCreate=${folder.status}` };
        }

        const bookmark = await makeRequest('POST', '/api/cm/folders/bookmarks', {
          entity_type: 'folder',
          entity_id: folderId,
        }, token);
        const [[bookmarkRow]] = await pool.execute(
          'SELECT id FROM cm_browse_bookmarks WHERE user_id = ? AND entity_type = ? AND entity_id = ? ORDER BY id DESC LIMIT 1',
          [decodeJwtPayload(token).userId || 0, 'folder', folderId]
        );
        bookmarkId = Number(bookmarkRow?.id || 0);
        const remove = await makeRequest('DELETE', `/api/cm/folders/bookmarks/${bookmarkId}`, null, token);

        const templateCreate = await makeRequest('POST', '/api/cm/templates', {
          type: 'Response',
          name: uniqueName('Regression Render Template'),
          subject: 'Hello {{agent_name}}',
          body_html: '<p>Today is {{date}}</p>',
          status: 'Active',
        }, token);
        templateId = Number(templateCreate.body?.id || templateCreate.body?.template?.id || 0);
        const render = await makeRequest('POST', `/api/cm/templates/${templateId}/render`, {}, token);

        return {
          pass: bookmark.status === 200 &&
            bookmarkId > 0 &&
            remove.status === 200 &&
            templateCreate.status === 201 &&
            render.status === 200 &&
            typeof render.body?.rendered_subject === 'string' &&
            typeof render.body?.rendered_body === 'string',
          details: `bookmark=${bookmark.status}, remove=${remove.status}, templateCreate=${templateCreate.status}, render=${render.status}`,
        };
      } finally {
        if (bookmarkId) await pool.execute('DELETE FROM cm_browse_bookmarks WHERE id = ?', [bookmarkId]).catch(() => {});
        if (templateId) {
          await pool.execute('DELETE FROM cm_version_history WHERE entity_type = ? AND entity_id = ?', ['template', templateId]).catch(() => {});
          await pool.execute('DELETE FROM cm_templates WHERE id = ?', [templateId]).catch(() => {});
        }
        if (folderId) await pool.execute('DELETE FROM cm_folders WHERE id = ?', [folderId]).catch(() => {});
      }
    },
  },
  {
    name: 'Content review routes cover reviewer owner transfer and config lifecycle',
    module: 'Content Management',
    covers: [
      'GET /api/cm/reviews',
      'GET /api/cm/reviews/all',
      'PUT /api/cm/reviews/:id/reviewer-status',
      'POST /api/cm/reviews/:id/close',
      'POST /api/cm/reviews/:id/end',
      'PUT /api/cm/reviews/:id/transfer',
      'GET /api/cm/reviews/:reviewId/config',
      'PATCH /api/cm/reviews/:reviewId/config',
    ],
    run: async ({ makeRequest, token }) => {
      let folderId = null;
      let faqIds = [];
      let reviewIds = [];
      let tempUserId = null;
      try {
        const auth = decodeJwtPayload(token);
        const orgId = Number(auth.orgId || auth.org_id || 0);
        const ownerUserId = Number(auth.userId || auth.user_id || 0);
        if (!orgId || !ownerUserId) {
          return { pass: false, details: 'Missing orgId or userId on token.' };
        }

        const folder = await createContentFolder(makeRequest, token, 'Regression Review Folder');
        folderId = folder.folderId;
        if (folder.status !== 201 || !folderId) {
          return { pass: false, details: `folderCreate=${folder.status}` };
        }

        for (const label of ['Review FAQ A', 'Review FAQ B', 'Review FAQ C']) {
          const createFaq = await makeRequest('POST', '/api/cm/faqs', {
            folder_id: folderId,
            question: uniqueName(label),
            answer_html: '<p>Review FAQ</p>',
            category: 'Review',
            approval_required: true,
          }, token);
          const faqId = Number(createFaq.body?.id || createFaq.body?.faq?.id || 0);
          if (createFaq.status !== 201 || !faqId) {
            return { pass: false, details: `faqCreate=${createFaq.status}` };
          }
          faqIds.push(faqId);
        }

        await pool.execute("UPDATE cm_faqs SET status = 'Under Review' WHERE id IN (?, ?)", [faqIds[1], faqIds[2]]);

        for (const faqId of faqIds) {
          const [reviewResult] = await pool.execute(
            `INSERT INTO cm_reviews (doc_id, doc_type, title, planned_end_date, is_non_amendable, description, status, created_by)
             VALUES (?, 'faq', ?, ?, 0, ?, 'Open', ?)`,
            [faqId, uniqueName('Regression Review'), '2026-05-15', 'Regression review', ownerUserId]
          );
          const reviewId = Number(reviewResult.insertId || 0);
          reviewIds.push(reviewId);
          await pool.execute(
            `INSERT INTO cm_reviewers (review_id, user_id, status) VALUES (?, ?, 'Ongoing')`,
            [reviewId, ownerUserId]
          );
        }

        const transferUser = await createTempOrgUser(orgId);
        tempUserId = transferUser.userId;

        const myReviews = await makeRequest('GET', '/api/cm/reviews', null, token);
        const allReviews = await makeRequest('GET', '/api/cm/reviews/all', null, token);
        const reviewerStatus = await makeRequest('PUT', `/api/cm/reviews/${reviewIds[0]}/reviewer-status`, {
          status: 'Approved',
          reason: 'Regression reviewer status update',
        }, token);
        const configGet = await makeRequest('GET', `/api/cm/reviews/${reviewIds[0]}/config`, null, token);
        const configPatch = await makeRequest('PATCH', `/api/cm/reviews/${reviewIds[0]}/config`, {
          review_mode: 'parallel',
        }, token);
        const close = await makeRequest('POST', `/api/cm/reviews/${reviewIds[1]}/close`, {}, token);
        const end = await makeRequest('POST', `/api/cm/reviews/${reviewIds[2]}/end`, {
          reason: 'Regression cancel',
        }, token);
        const transfer = await makeRequest('PUT', `/api/cm/reviews/${reviewIds[0]}/transfer`, {
          new_owner_id: tempUserId,
        }, token);

        return {
          pass: myReviews.status === 200 &&
            Array.isArray(myReviews.body?.reviews) &&
            allReviews.status === 200 &&
            Array.isArray(allReviews.body?.reviews) &&
            reviewerStatus.status === 200 &&
            configGet.status === 200 &&
            configPatch.status === 200 &&
            close.status === 200 &&
            end.status === 200 &&
            transfer.status === 200,
          details: `myReviews=${myReviews.status}, allReviews=${allReviews.status}, reviewerStatus=${reviewerStatus.status}, configGet=${configGet.status}, configPatch=${configPatch.status}, close=${close.status}, end=${end.status}, transfer=${transfer.status}`,
        };
      } finally {
        if (reviewIds.length) {
          await pool.execute(`DELETE FROM cm_reviewers WHERE review_id IN (${reviewIds.map(() => '?').join(',')})`, reviewIds).catch(() => {});
          await pool.execute(`DELETE FROM cm_reviews WHERE id IN (${reviewIds.map(() => '?').join(',')})`, reviewIds).catch(() => {});
          await pool.execute(`DELETE FROM cm_review_config WHERE doc_id IN (${faqIds.map(() => '?').join(',') || '0'})`, faqIds).catch(() => {});
        }
        if (faqIds.length) {
          await pool.execute(`DELETE FROM cm_version_history WHERE entity_type = 'faq' AND entity_id IN (${faqIds.map(() => '?').join(',')})`, faqIds).catch(() => {});
          await pool.execute(`DELETE FROM cm_faqs WHERE id IN (${faqIds.map(() => '?').join(',')})`, faqIds).catch(() => {});
        }
        if (tempUserId) {
          await pool.execute('DELETE FROM user_org_access WHERE user_id = ?', [tempUserId]).catch(() => {});
          await pool.execute('DELETE FROM users WHERE id = ?', [tempUserId]).catch(() => {});
        }
        if (folderId) await pool.execute('DELETE FROM cm_folders WHERE id = ?', [folderId]).catch(() => {});
      }
    },
  },
  {
    name: 'Content module and merge report routes cover lifecycle generation and scheduling',
    module: 'Content Management',
    covers: [
      'GET /api/cm/merge-reports',
      'POST /api/cm/modules',
      'GET /api/cm/modules/:id',
      'PUT /api/cm/modules/:id',
      'POST /api/cm/modules/:id/archive',
      'POST /api/cm/merge-reports',
      'GET /api/cm/merge-reports/:id',
      'PUT /api/cm/merge-reports/:id',
      'POST /api/cm/merge-reports/:id/checkout',
      'POST /api/cm/merge-reports/:id/checkin',
      'POST /api/cm/merge-reports/:id/generate',
      'GET /api/cm/merge-reports/:id/schedule',
      'POST /api/cm/merge-reports/:id/schedule',
      'POST /api/cm/merge-reports/:id/archive',
    ],
    run: async ({ makeRequest, token }) => {
      let folderId = null;
      let moduleId = null;
      let reportId = null;
      let scheduledJobNames = [];
      try {
        const auth = decodeJwtPayload(token);
        const orgId = Number(auth.orgId || auth.org_id || 0);
        if (!orgId) {
          return { pass: false, details: 'Missing orgId on token.' };
        }

        const folder = await createContentFolder(makeRequest, token, 'Regression Module Folder');
        folderId = folder.folderId;
        if (folder.status !== 201 || !folderId) {
          return { pass: false, details: `folderCreate=${folder.status}` };
        }

        const reportList = await makeRequest('GET', '/api/cm/merge-reports?limit=5', null, token);

        const moduleCreate = await makeRequest('POST', '/api/cm/modules', {
          folder_id: folderId,
          name: uniqueName('Regression Module'),
          content_html: '<p>Regression module content</p>',
          document_category: 'Regression',
          standard_response_text: 'Regression response',
        }, token);
        moduleId = Number(moduleCreate.body?.id || moduleCreate.body?.module?.id || 0);
        if (moduleCreate.status !== 201 || !moduleId) {
          return { pass: false, details: `moduleCreate=${moduleCreate.status}` };
        }

        const moduleGet = await makeRequest('GET', `/api/cm/modules/${moduleId}`, null, token);
        const moduleUpdate = await makeRequest('PUT', `/api/cm/modules/${moduleId}`, {
          name: `${moduleCreate.body?.module?.name || 'Regression Module'} Updated`,
          content_html: '<p>Regression module content updated</p>',
        }, token);
        const moduleArchive = await makeRequest('POST', `/api/cm/modules/${moduleId}/archive`, {
          reason: 'Regression archive',
        }, token);

        const reportCreate = await makeRequest('POST', '/api/cm/merge-reports', {
          folder_id: folderId,
          name: uniqueName('Regression Merge Report'),
          content_html: '<p>Merge report for {{report_name}} on {{date}}</p>',
        }, token);
        reportId = Number(reportCreate.body?.id || reportCreate.body?.report?.id || 0);
        if (reportCreate.status !== 201 || !reportId) {
          return { pass: false, details: `reportCreate=${reportCreate.status}` };
        }

        const reportGet = await makeRequest('GET', `/api/cm/merge-reports/${reportId}`, null, token);
        const reportUpdate = await makeRequest('PUT', `/api/cm/merge-reports/${reportId}`, {
          name: `${reportCreate.body?.report?.name || 'Regression Merge'} Updated`,
          content_html: '<p>Updated merge content for {{report_name}}</p>',
        }, token);
        const checkout = await makeRequest('POST', `/api/cm/merge-reports/${reportId}/checkout`, {}, token);
        const checkin = await makeRequest('POST', `/api/cm/merge-reports/${reportId}/checkin`, {
          notes: 'Regression merge report checkin',
        }, token);
        const generate = await makeRequest('POST', `/api/cm/merge-reports/${reportId}/generate`, {}, token);
        const schedulePost = await makeRequest('POST', `/api/cm/merge-reports/${reportId}/schedule`, {
          cron_expression: '0 8 * * *',
          email_recipients: ['regression@example.com'],
          is_active: true,
        }, token);
        const scheduleGet = await makeRequest('GET', `/api/cm/merge-reports/${reportId}/schedule`, null, token);
        const archive = await makeRequest('POST', `/api/cm/merge-reports/${reportId}/archive`, {
          reason: 'Regression archive',
        }, token);

        const [jobRows] = await pool.execute(
          `SELECT job_name FROM scheduled_jobs
           WHERE job_type = 'cm_merge_report'
             AND JSON_UNQUOTE(JSON_EXTRACT(job_config, '$.merge_report_id')) = ?
             AND org_id = ?`,
          [String(reportId), orgId]
        ).catch(() => [ [] ]);
        scheduledJobNames = Array.isArray(jobRows) ? jobRows.map((row) => row.job_name).filter(Boolean) : [];

        return {
          pass: reportList.status === 200 &&
            moduleGet.status === 200 &&
            moduleUpdate.status === 200 &&
            moduleArchive.status === 200 &&
            reportGet.status === 200 &&
            reportUpdate.status === 200 &&
            checkout.status === 200 &&
            checkin.status === 200 &&
            generate.status === 200 &&
            schedulePost.status === 200 &&
            scheduleGet.status === 200 &&
            archive.status === 200,
          details: `reportList=${reportList.status}, moduleCreate=${moduleCreate.status}, moduleGet=${moduleGet.status}, moduleUpdate=${moduleUpdate.status}, moduleArchive=${moduleArchive.status}, reportCreate=${reportCreate.status}, reportGet=${reportGet.status}, reportUpdate=${reportUpdate.status}, checkout=${checkout.status}, checkin=${checkin.status}, generate=${generate.status}, schedulePost=${schedulePost.status}, scheduleGet=${scheduleGet.status}, archive=${archive.status}`,
        };
      } finally {
        if (scheduledJobNames.length) {
          await pool.execute(`DELETE FROM scheduled_jobs WHERE job_name IN (${scheduledJobNames.map(() => '?').join(',')})`, scheduledJobNames).catch(() => {});
        }
        if (reportId) {
          await pool.execute('DELETE FROM cm_version_history WHERE entity_type = ? AND entity_id = ?', ['merge_report', reportId]).catch(() => {});
          await pool.execute('DELETE FROM cm_merge_reports WHERE id = ?', [reportId]).catch(() => {});
        }
        if (moduleId) {
          await pool.execute('DELETE FROM cm_version_history WHERE entity_type = ? AND entity_id = ?', ['module', moduleId]).catch(() => {});
          await pool.execute('DELETE FROM cm_modules WHERE id = ?', [moduleId]).catch(() => {});
        }
        if (folderId) await pool.execute('DELETE FROM cm_folders WHERE id = ?', [folderId]).catch(() => {});
      }
    },
  },
];
