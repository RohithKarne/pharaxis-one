'use strict';

const {
  getFirstFolder,
  getFirstSecurityGroup,
  uniqueName,
} = require('./helpers');

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
];
