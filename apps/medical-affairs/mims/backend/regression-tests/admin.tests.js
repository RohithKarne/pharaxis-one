'use strict';
/**
 * Admin module regression tests
 */
const pool = require('../database/db')
const { getFirstUser, uniqueName } = require('./helpers');

async function getFirstOrg(makeRequest, token) {
  const res = await makeRequest('GET', '/api/admin/orgs', null, token)
  const orgs = Array.isArray(res.body?.orgs) ? res.body.orgs : []
  return orgs[0] || null
}

module.exports = [
  {
    name: 'GET /api/admin/mi-categories returns categories',
    module: 'Admin — MI Categories',
    covers: ['GET /api/admin/mi-categories'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/mi-categories', null, token)
      return { pass: res.status === 200 && Array.isArray(res.body?.categories ?? []), details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/sites returns sites',
    module: 'Admin — Sites',
    covers: ['GET /api/admin/sites'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/sites', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/workflow-states returns states',
    module: 'Admin — Workflow States',
    covers: ['GET /api/admin/workflow-states'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/workflow-states', null, token)
      return { pass: res.status === 200 && Array.isArray(res.body?.states), details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/source-types returns source types',
    module: 'Admin — Source Types',
    covers: ['GET /api/admin/source-types'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/source-types', null, token)
      return { pass: res.status === 200 && Array.isArray(res.body?.sources), details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/email-accounts returns accounts',
    module: 'Admin — Email Accounts',
    covers: ['GET /api/admin/email-accounts'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/email-accounts', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/picklists returns picklists',
    module: 'Admin — Picklists',
    covers: ['GET /api/admin/picklists'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/picklists', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/products-full returns products',
    module: 'Admin — Products',
    covers: ['GET /api/admin/products-full'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/products-full', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/security-groups returns groups',
    module: 'Admin — Security Groups',
    covers: ['GET /api/admin/security-groups'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/security-groups', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/users returns users',
    module: 'Admin — Users',
    covers: ['GET /api/admin/users'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/users', null, token)
      return { pass: res.status === 200 && Array.isArray(res.body?.users), details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/audit-logs returns audit entries',
    module: 'Admin — Audit Trail',
    covers: ['GET /api/admin/audit-logs'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/audit-logs', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/login-audit returns login audit entries',
    module: 'Admin — Login Audit',
    covers: ['GET /api/admin/login-audit'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/login-audit', null, token)
      return { pass: res.status === 200 && Array.isArray(res.body?.logs), details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/permissions returns role permissions',
    module: 'Admin — Permissions',
    covers: ['GET /api/admin/permissions'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/permissions', null, token)
      return { pass: res.status === 200 && Array.isArray(res.body?.permissions), details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/field-setup returns fields',
    module: 'Admin — Field Setup',
    covers: ['GET /api/admin/field-setup'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/field-setup', null, token)
      return { pass: res.status === 200, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/reports/access returns report access rows',
    module: 'Admin — Report Access',
    covers: ['GET /api/admin/reports/access'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/reports/access', null, token)
      return { pass: res.status === 200 && Array.isArray(res.body?.access), details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/admin/reports/access/requests returns request rows',
    module: 'Admin — Report Access Requests',
    covers: ['GET /api/admin/reports/access/requests'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/admin/reports/access/requests', null, token)
      return { pass: res.status === 200 && Array.isArray(res.body?.requests), details: `Status: ${res.status}` }
    }
  },
  {
    name: 'POST /api/admin/reports/access/request creates request row',
    module: 'Admin — Report Access Requests',
    covers: ['POST /api/admin/reports/access/request'],
    run: async ({ makeRequest, token }) => {
      const user = await getFirstUser(makeRequest, token)
      if (!user?.id) {
        return { pass: false, details: 'No user available for request creation.' }
      }
      const res = await makeRequest('POST', '/api/admin/reports/access/request', {
        user_id: user.id,
        report_key: 'system-health',
      }, token)
      return { pass: res.status === 200 && res.body?.success === true, details: `Status: ${res.status}, id: ${res.body?.id || 'n/a'}` }
    }
  },
  {
    name: 'PUT /api/admin/field-setup saves existing field payload',
    module: 'Admin — Field Setup',
    covers: ['PUT /api/admin/field-setup'],
    run: async ({ makeRequest, token }) => {
      const load = await makeRequest('GET', '/api/admin/field-setup', null, token)
      const field = Array.isArray(load.body?.fields) ? load.body.fields[0] : null
      if (load.status !== 200 || !field?.id) {
        return { pass: false, details: `load status: ${load.status}` }
      }
      const payload = {
        fields: [{
          id: field.id,
          is_required: !!field.is_required,
          is_hidden: !!field.is_hidden,
          is_disabled: !!field.is_disabled,
          custom_label: field.custom_label || null,
          help_text: field.help_text || null,
          picklist_type: field.picklist_type || null,
          lookup_target: field.lookup_target || null,
          do_not_update_master: !!field.do_not_update_master,
          max_length: field.max_length || null,
          default_value: field.default_value || null,
          sort_order: field.sort_order || 0,
          field_type: field.field_type || 'text',
        }],
      }
      const res = await makeRequest('PUT', '/api/admin/field-setup', payload, token)
      return { pass: res.status === 200, details: `Status: ${res.status}, field: ${field.id}` }
    }
  },
  {
    name: 'Field setup flex lifecycle covers create and delete',
    module: 'Admin — Field Setup',
    covers: ['POST /api/admin/field-setup/flex', 'DELETE /api/admin/field-setup/flex/:id'],
    run: async ({ makeRequest, token }) => {
      const create = await makeRequest('POST', '/api/admin/field-setup/flex', {
        section_name: 'Regression',
        field_name: `regression_${Date.now()}`,
        field_type: 'text',
        custom_label: 'Regression Field',
        sort_order: 1,
      }, token)
      const createdId = Number(create.body?.id || 0)
      if (create.status !== 201 || !createdId) {
        return { pass: false, details: `create status: ${create.status}` }
      }
      const del = await makeRequest('DELETE', `/api/admin/field-setup/flex/${createdId}`, null, token)
      return { pass: del.status === 200, details: `create=${create.status}, delete=${del.status}` }
    }
  },
  {
    name: 'MI categories lifecycle covers create update delete',
    module: 'Admin — MI Categories',
    covers: [
      'POST /api/admin/mi-categories',
      'PUT /api/admin/mi-categories/:id',
      'DELETE /api/admin/mi-categories/:id',
    ],
    run: async ({ makeRequest, token }) => {
      const create = await makeRequest('POST', '/api/admin/mi-categories', {
        name: `Regression MI ${Date.now()}`,
        description: 'Regression category',
        sort_order: 50,
      }, token)
      const createdId = Number(create.body?.category?.id || 0)
      if (create.status !== 201 || !createdId) {
        return { pass: false, details: `create status: ${create.status}` }
      }
      const update = await makeRequest('PUT', `/api/admin/mi-categories/${createdId}`, {
        name: `Regression MI Updated ${Date.now()}`,
        description: 'Updated regression category',
        sort_order: 51,
        is_active: 1,
      }, token)
      const del = await makeRequest('DELETE', `/api/admin/mi-categories/${createdId}`, null, token)
      return { pass: update.status === 200 && del.status === 200, details: `create=${create.status}, update=${update.status}, delete=${del.status}` }
    }
  },
  {
    name: 'POST /api/admin/source-types validates required name',
    module: 'Admin — Source Types',
    covers: ['POST /api/admin/source-types'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('POST', '/api/admin/source-types', {}, token)
      return { pass: res.status === 400, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'PUT /api/admin/source-types/:id returns 404 for missing source type',
    module: 'Admin — Source Types',
    covers: ['PUT /api/admin/source-types/:id'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('PUT', '/api/admin/source-types/999999999', { name: 'Regression Missing', is_active: 1 }, token)
      return { pass: res.status === 404, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'Email account lifecycle covers admin email account routes',
    module: 'Admin — Email Accounts',
    covers: [
      'POST /api/admin/email-accounts',
      'PUT /api/admin/email-accounts/:id',
      'PATCH /api/admin/email-accounts/:id/toggle',
      'DELETE /api/admin/email-accounts/:id',
      'POST /api/admin/email-accounts/:id/test-imap',
      'POST /api/admin/email-accounts/:id/test-smtp',
      'POST /api/admin/email-accounts/:id/send-test',
      'POST /api/admin/email-accounts/:id/fetch-now',
    ],
    run: async ({ makeRequest, token }) => {
      const create = await makeRequest('POST', '/api/admin/email-accounts', {
        account_name: `Regression Email ${Date.now()}`,
        provider: 'Generic',
        direction: 'Both',
        mailbox_email: `regression-${Date.now()}@example.com`,
        from_email: `regression-${Date.now()}@example.com`,
        display_name: 'Regression Account',
        mailbox_folder: 'INBOX',
      }, token)
      const createdId = Number(create.body?.account?.id || 0)
      if (create.status !== 201 || !createdId) {
        return { pass: false, details: `create status: ${create.status}` }
      }

      const update = await makeRequest('PUT', `/api/admin/email-accounts/${createdId}`, {
        account_name: `Regression Email Updated ${Date.now()}`,
        provider: 'Generic',
        direction: 'Both',
        is_active: true,
        mailbox_email: `updated-${Date.now()}@example.com`,
        from_email: `updated-${Date.now()}@example.com`,
        display_name: 'Regression Updated',
        mailbox_folder: 'INBOX',
      }, token)
      const toggle = await makeRequest('PATCH', `/api/admin/email-accounts/${createdId}/toggle`, null, token)
      const testImap = await makeRequest('POST', `/api/admin/email-accounts/${createdId}/test-imap`, {}, token)
      const testSmtp = await makeRequest('POST', `/api/admin/email-accounts/${createdId}/test-smtp`, {}, token)
      const sendTest = await makeRequest('POST', `/api/admin/email-accounts/${createdId}/send-test`, {
        recipient: 'regression-recipient@example.com',
      }, token)
      const fetchNow = await makeRequest('POST', `/api/admin/email-accounts/${createdId}/fetch-now`, {}, token)
      const del = await makeRequest('DELETE', `/api/admin/email-accounts/${createdId}`, null, token)

      const pass = update.status === 200 &&
        toggle.status === 200 &&
        testImap.status === 400 &&
        testSmtp.status === 400 &&
        sendTest.status === 400 &&
        fetchNow.status === 400 &&
        del.status === 200

      return {
        pass,
        details: `create=${create.status}, update=${update.status}, toggle=${toggle.status}, imap=${testImap.status}, smtp=${testSmtp.status}, send=${sendTest.status}, fetch=${fetchNow.status}, delete=${del.status}`,
      }
    }
  },
  {
    name: 'Admin org routes cover read paths and superadmin-only write guards',
    module: 'Admin — Orgs and Sites',
    covers: [
      'GET /api/admin/orgs',
      'POST /api/admin/orgs',
      'PUT /api/admin/orgs/:id',
      'GET /api/admin/orgs/:id/sites',
      'POST /api/admin/orgs/:id/sites',
      'GET /api/admin/orgs/:orgId/users',
      'PUT /api/admin/orgs/:orgId/users/:userId/expiry',
      'PUT /api/admin/orgs/sites/:id',
    ],
    run: async ({ makeRequest, token }) => {
      const orgs = await makeRequest('GET', '/api/admin/orgs', null, token)
      const firstOrg = Array.isArray(orgs.body?.orgs) ? orgs.body.orgs[0] : null
      if (orgs.status !== 200 || !firstOrg?.id) {
        return { pass: false, details: `orgs status: ${orgs.status}` }
      }

      const orgSites = await makeRequest('GET', `/api/admin/orgs/${firstOrg.id}/sites`, null, token)
      const orgUsers = await makeRequest('GET', `/api/admin/orgs/${firstOrg.id}/users`, null, token)
      const firstUser = Array.isArray(orgUsers.body?.users) ? orgUsers.body.users[0] : null
      const expiry = await makeRequest('PUT', `/api/admin/orgs/${firstOrg.id}/users/${firstUser?.id || 999999999}/expiry`, {
        access_expires_at: firstUser?.access_expires_at || null,
      }, token)

      const createOrg = await makeRequest('POST', '/api/admin/orgs', { name: `Regression Org ${Date.now()}` }, token)
      const updateOrg = await makeRequest('PUT', `/api/admin/orgs/${firstOrg.id}`, {
        name: firstOrg.name,
        is_active: !!firstOrg.is_active,
      }, token)
      const createOrgSite = await makeRequest('POST', `/api/admin/orgs/${firstOrg.id}/sites`, {
        name: `Regression Site ${Date.now()}`,
        country: 'India',
      }, token)
      const updateOrgSite = await makeRequest('PUT', '/api/admin/orgs/sites/999999999', {
        name: 'Regression Missing Site',
        country: 'India',
        is_primary: false,
        is_active: true,
      }, token)

      const pass = orgSites.status === 200 &&
        orgUsers.status === 200 &&
        expiry.status === 200 &&
        createOrg.status === 403 &&
        updateOrg.status === 403 &&
        createOrgSite.status === 403 &&
        updateOrgSite.status === 403

      return {
        pass,
        details: `orgs=${orgs.status}, orgSites=${orgSites.status}, orgUsers=${orgUsers.status}, expiry=${expiry.status}, createOrg=${createOrg.status}, updateOrg=${updateOrg.status}, createOrgSite=${createOrgSite.status}, updateOrgSite=${updateOrgSite.status}`,
      }
    }
  },
  {
    name: 'Admin site config routes cover validation and existing site read write',
    module: 'Admin — Sites',
    covers: [
      'POST /api/admin/sites',
      'GET /api/admin/sites/:id',
      'PUT /api/admin/sites/:id',
    ],
    run: async ({ makeRequest, token }) => {
      const invalidCreate = await makeRequest('POST', '/api/admin/sites', {}, token)
      const sites = await makeRequest('GET', '/api/admin/sites', null, token)
      const firstSite = Array.isArray(sites.body?.sites) ? sites.body.sites[0] : null

      let getSite
      let updateSite
      if (firstSite?.id) {
        getSite = await makeRequest('GET', `/api/admin/sites/${firstSite.id}`, null, token)
        updateSite = await makeRequest('PUT', `/api/admin/sites/${firstSite.id}`, {
          name: firstSite.name,
          country: firstSite.country || null,
          is_primary: !!firstSite.is_primary,
          is_active: !!firstSite.is_active,
          abbreviation: firstSite.abbreviation || null,
          enable_data_protection: !!firstSite.enable_data_protection,
          retry_enabled: !!firstSite.retry_enabled,
          retry_count: firstSite.retry_count || 3,
          retry_interval_min: firstSite.retry_interval_min || 5,
          alert_config: firstSite.alert_config || null,
          response_config: firstSite.response_config || null,
        }, token)
      } else {
        getSite = await makeRequest('GET', '/api/admin/sites/999999999', null, token)
        updateSite = await makeRequest('PUT', '/api/admin/sites/999999999', {
          name: 'Regression Missing Site',
          is_primary: false,
          is_active: true,
        }, token)
      }

      const pass = invalidCreate.status === 400 &&
        (getSite.status === 200 || getSite.status === 404) &&
        (updateSite.status === 200 || updateSite.status === 404)

      return {
        pass,
        details: `invalidCreate=${invalidCreate.status}, getSite=${getSite.status}, updateSite=${updateSite.status}`,
      }
    }
  },
  {
    name: 'Picklist category and field routes cover lifecycle with cleanup',
    module: 'Admin — Picklists',
    covers: [
      'GET /api/admin/picklists/categories',
      'POST /api/admin/picklists/categories',
      'PUT /api/admin/picklists/categories/:id',
      'GET /api/admin/picklists/fields',
      'POST /api/admin/picklists/fields',
      'PUT /api/admin/picklists/fields/:id',
    ],
    run: async ({ makeRequest, token }) => {
      let categoryId = null
      let fieldId = null
      try {
        const categoriesBefore = await makeRequest('GET', '/api/admin/picklists/categories', null, token)
        const createCategory = await makeRequest('POST', '/api/admin/picklists/categories', {
          name: uniqueName('Regression Category'),
          sort_order: 91,
        }, token)
        categoryId = Number(createCategory.body?.id || 0)
        if (categoriesBefore.status !== 200 || createCategory.status !== 201 || !categoryId) {
          return { pass: false, details: `categories=${categoriesBefore.status}, createCategory=${createCategory.status}` }
        }

        const updateCategory = await makeRequest('PUT', `/api/admin/picklists/categories/${categoryId}`, {
          name: uniqueName('Regression Category Updated'),
          is_active: true,
          sort_order: 92,
        }, token)
        const fieldsBefore = await makeRequest('GET', '/api/admin/picklists/fields', null, token)
        const createField = await makeRequest('POST', '/api/admin/picklists/fields', {
          category_id: categoryId,
          name: uniqueName('Regression Field'),
          legacy_field_type: uniqueName('legacy_field'),
          sort_order: 5,
        }, token)
        fieldId = Number(createField.body?.id || 0)
        if (updateCategory.status !== 200 || fieldsBefore.status !== 200 || createField.status !== 201 || !fieldId) {
          return {
            pass: false,
            details: `updateCategory=${updateCategory.status}, fields=${fieldsBefore.status}, createField=${createField.status}`,
          }
        }

        const updateField = await makeRequest('PUT', `/api/admin/picklists/fields/${fieldId}`, {
          category_id: categoryId,
          name: uniqueName('Regression Field Updated'),
          legacy_field_type: uniqueName('legacy_field_updated'),
          is_active: true,
          sort_order: 6,
        }, token)

        return {
          pass: updateField.status === 200,
          details: `categories=${categoriesBefore.status}, createCategory=${createCategory.status}, updateCategory=${updateCategory.status}, fields=${fieldsBefore.status}, createField=${createField.status}, updateField=${updateField.status}`,
        }
      } finally {
        if (fieldId) await pool.execute('DELETE FROM picklists WHERE field_id = ?', [fieldId]).catch(() => {})
        if (fieldId) await pool.execute('DELETE FROM picklist_fields WHERE id = ?', [fieldId]).catch(() => {})
        if (categoryId) await pool.execute('DELETE FROM picklist_categories WHERE id = ?', [categoryId]).catch(() => {})
      }
    }
  },
  {
    name: 'Picklist value routes cover export import mutation and cleanup',
    module: 'Admin — Picklists',
    covers: [
      'GET /api/admin/picklists/export',
      'GET /api/admin/picklists/export-csv',
      'POST /api/admin/picklists',
      'PUT /api/admin/picklists/:id',
      'PATCH /api/admin/picklists/:id/toggle',
      'POST /api/admin/picklists/bulk-status',
      'POST /api/admin/picklists/import-csv',
      'POST /api/admin/picklists/bulk',
      'DELETE /api/admin/picklists/:id',
    ],
    run: async ({ makeRequest, token }) => {
      let categoryId = null
      let fieldId = null
      let picklistId = null
      try {
        const org = await getFirstOrg(makeRequest, token)
        if (!org?.id) return { pass: false, details: 'No org available for picklist setup.' }

        const categoryName = uniqueName('Regression Category')
        const fieldName = uniqueName('Regression Field')
        const picklistValue = uniqueName('regression-value').toLowerCase()

        const [categoryResult] = await pool.execute(
          'INSERT INTO picklist_categories (org_id, name, is_active, sort_order, created_by) VALUES (?, ?, 1, ?, NULL)',
          [org.id, categoryName, 80]
        )
        categoryId = Number(categoryResult.insertId || 0)
        const [fieldResult] = await pool.execute(
          'INSERT INTO picklist_fields (org_id, category_id, name, legacy_field_type, is_active, sort_order, created_by) VALUES (?, ?, ?, ?, 1, ?, NULL)',
          [org.id, categoryId, fieldName, fieldName, 1]
        )
        fieldId = Number(fieldResult.insertId || 0)

        const exportJson = await makeRequest('GET', '/api/admin/picklists/export', null, token)
        const exportCsv = await makeRequest('GET', '/api/admin/picklists/export-csv', null, token)
        const create = await makeRequest('POST', '/api/admin/picklists', {
          field_id: fieldId,
          value: picklistValue,
          name: picklistValue,
          description: 'Regression picklist',
          status: 'Active',
        }, token)
        picklistId = Number(create.body?.id || create.body?.picklist?.id || 0)
        if (exportJson.status !== 200 || exportCsv.status !== 200 || create.status !== 201 || !picklistId) {
          return { pass: false, details: `exportJson=${exportJson.status}, exportCsv=${exportCsv.status}, create=${create.status}` }
        }

        const update = await makeRequest('PUT', `/api/admin/picklists/${picklistId}`, {
          field_id: fieldId,
          value: `${picklistValue}-updated`,
          name: `${picklistValue}-updated`,
          description: 'Regression updated picklist',
          status: 'Active',
        }, token)
        const toggle = await makeRequest('PATCH', `/api/admin/picklists/${picklistId}/toggle`, null, token)
        const bulkStatus = await makeRequest('POST', '/api/admin/picklists/bulk-status', {
          ids: [picklistId],
          status: 'Active',
          field_id: fieldId,
        }, token)
        const importCsv = await makeRequest('POST', '/api/admin/picklists/import-csv', {
          rows: [{
            name: `${picklistValue}-updated`,
            category: categoryName,
            field_type: fieldName,
            value: `${picklistValue}-updated`,
            description: 'Regression import row',
          }],
        }, token)
        const bulk = await makeRequest('POST', '/api/admin/picklists/bulk', {
          items: [{
            name: `${picklistValue}-updated`,
            category: categoryName,
            field_type: fieldName,
            value: `${picklistValue}-updated`,
            description: 'Regression bulk row',
            status: 'Active',
          }],
        }, token)
        const del = await makeRequest('DELETE', `/api/admin/picklists/${picklistId}`, null, token)

        return {
          pass: Array.isArray(exportJson.body?.picklists) &&
            String(exportCsv.headers?.['content-type'] || '').includes('text/csv') &&
            update.status === 200 &&
            toggle.status === 200 &&
            bulkStatus.status === 200 &&
            importCsv.status === 200 &&
            bulk.status === 200 &&
            del.status === 200,
          details: `exportJson=${exportJson.status}, exportCsv=${exportCsv.status}, create=${create.status}, update=${update.status}, toggle=${toggle.status}, bulkStatus=${bulkStatus.status}, importCsv=${importCsv.status}, bulk=${bulk.status}, delete=${del.status}`,
        }
      } finally {
        if (picklistId) await pool.execute('DELETE FROM picklists WHERE id = ?', [picklistId]).catch(() => {})
        if (fieldId) await pool.execute('DELETE FROM picklists WHERE field_id = ?', [fieldId]).catch(() => {})
        if (fieldId) await pool.execute('DELETE FROM picklist_fields WHERE id = ?', [fieldId]).catch(() => {})
        if (categoryId) await pool.execute('DELETE FROM picklist_categories WHERE id = ?', [categoryId]).catch(() => {})
      }
    }
  },
  {
    name: 'Workflow and case form config routes cover lifecycle and no-op save',
    module: 'Admin — Case Config',
    covers: [
      'GET /api/admin/workflow-rules',
      'POST /api/admin/workflow-rules',
      'PUT /api/admin/workflow-rules/:id',
      'DELETE /api/admin/workflow-rules/:id',
      'GET /api/admin/case-form-definition',
      'GET /api/admin/case-form-definition/sections',
      'POST /api/admin/case-form-definition',
    ],
    run: async ({ makeRequest, token }) => {
      let workflowRuleId = null
      let tempStateIds = []
      const regressionCaseType = `R${Date.now().toString().slice(-6)}`
      try {
        const org = await getFirstOrg(makeRequest, token)
        if (!org?.id) return { pass: false, details: 'No org available for workflow setup.' }

        const stateA = uniqueName('WF_A')
        const stateB = uniqueName('WF_B')
        try {
          const [insertA] = await pool.execute('INSERT INTO workflow_states (name, org_id) VALUES (?, ?)', [stateA, org.id])
          const [insertB] = await pool.execute('INSERT INTO workflow_states (name, org_id) VALUES (?, ?)', [stateB, org.id])
          tempStateIds = [Number(insertA.insertId || 0), Number(insertB.insertId || 0)]
        } catch (_) {
          const [insertA] = await pool.execute('INSERT INTO workflow_states (name) VALUES (?)', [stateA])
          const [insertB] = await pool.execute('INSERT INTO workflow_states (name) VALUES (?)', [stateB])
          tempStateIds = [Number(insertA.insertId || 0), Number(insertB.insertId || 0)]
        }
        if (!tempStateIds[0] || !tempStateIds[1]) {
          return { pass: false, details: 'Failed to create temporary workflow states.' }
        }

        const rulesRes = await makeRequest('GET', '/api/admin/workflow-rules', null, token)
        const createRule = await makeRequest('POST', '/api/admin/workflow-rules', {
          from_state_id: tempStateIds[0],
          to_state_id: tempStateIds[1],
          require_password: false,
          require_checklist: false,
          require_comment: true,
          is_active: true,
        }, token)
        workflowRuleId = Number(createRule.body?.id || createRule.body?.rule?.id || 0)
        if (rulesRes.status !== 200 || createRule.status !== 201 || !workflowRuleId) {
          return { pass: false, details: `rules=${rulesRes.status}, createRule=${createRule.status}` }
        }

        const updateRule = await makeRequest('PUT', `/api/admin/workflow-rules/${workflowRuleId}`, {
          from_state_id: tempStateIds[0],
          to_state_id: tempStateIds[1],
          require_password: true,
          require_checklist: false,
          require_comment: false,
          is_active: true,
        }, token)
        const sectionsRes = await makeRequest('GET', '/api/admin/case-form-definition/sections', null, token)
        const formRes = await makeRequest('GET', '/api/admin/case-form-definition?case_type=MI', null, token)
        const saveForm = await makeRequest('POST', '/api/admin/case-form-definition', {
          case_type: regressionCaseType,
          sections: [
            {
              section_name: 'Regression Section',
              is_visible: true,
              field_overrides: { example_field: { is_required: false, is_hidden: false } },
            },
          ],
        }, token)
        const deleteRule = await makeRequest('DELETE', `/api/admin/workflow-rules/${workflowRuleId}`, null, token)

        return {
          pass: updateRule.status === 200 &&
            sectionsRes.status === 200 &&
            Array.isArray(formRes.body?.sections) &&
            saveForm.status === 200 &&
            deleteRule.status === 200,
          details: `rules=${rulesRes.status}, createRule=${createRule.status}, updateRule=${updateRule.status}, sections=${sectionsRes.status}, form=${formRes.status}, saveForm=${saveForm.status}, deleteRule=${deleteRule.status}`,
        }
      } finally {
        if (workflowRuleId) await pool.execute('DELETE FROM workflow_rules WHERE id = ?', [workflowRuleId]).catch(() => {})
        if (tempStateIds.length) await pool.execute(`DELETE FROM workflow_states WHERE id IN (${tempStateIds.map(() => '?').join(',')})`, tempStateIds).catch(() => {})
        await pool.execute('DELETE FROM case_form_definition WHERE case_type = ?', [regressionCaseType]).catch(() => {})
      }
    }
  },
  {
    name: 'Case numbering routes cover list previews upsert and delete',
    module: 'Admin — Case Config',
    covers: [
      'GET /api/admin/case-number-config',
      'GET /api/admin/case-number-config/preview',
      'POST /api/admin/case-number-config',
      'DELETE /api/admin/case-number-config/:id',
      'POST /api/admin/case-numbering/preview',
    ],
    run: async ({ makeRequest, token }) => {
      let configId = null
      const caseType = `N${Date.now().toString().slice(-6)}`
      try {
        const listRes = await makeRequest('GET', '/api/admin/case-number-config', null, token)
        const previewRes = await makeRequest('GET', '/api/admin/case-number-config/preview?prefix=REG&separator=-&include_year=1&include_month=0&seq_length=5', null, token)
        const createRes = await makeRequest('POST', '/api/admin/case-number-config', {
          case_type: caseType,
          prefix: 'REG',
          separator: '-',
          include_year: true,
          include_month: false,
          seq_length: 5,
        }, token)
        configId = Number(createRes.body?.config?.id || 0)
        if (listRes.status !== 200 || previewRes.status !== 200 || createRes.status !== 200 || !configId) {
          return { pass: false, details: `list=${listRes.status}, preview=${previewRes.status}, create=${createRes.status}` }
        }

        const numberingPreview = await makeRequest('POST', '/api/admin/case-numbering/preview', {
          prefix: 'REG',
          next_number: 11,
          pad_length: 4,
          suffix: 'X',
          include_date: true,
          date_format: 'YYYYMMDD',
        }, token)
        const deleteRes = await makeRequest('DELETE', `/api/admin/case-number-config/${configId}`, null, token)

        return {
          pass: typeof previewRes.body?.preview === 'string' &&
            typeof numberingPreview.body?.preview === 'string' &&
            deleteRes.status === 200,
          details: `list=${listRes.status}, preview=${previewRes.status}, create=${createRes.status}, numberingPreview=${numberingPreview.status}, delete=${deleteRes.status}`,
        }
      } finally {
        if (configId) await pool.execute('DELETE FROM case_number_config WHERE id = ?', [configId]).catch(() => {})
      }
    }
  },
  {
    name: 'Basic product routes cover list create update with cleanup',
    module: 'Admin — Products',
    covers: [
      'GET /api/admin/products',
      'POST /api/admin/products',
      'PUT /api/admin/products/:id',
    ],
    run: async ({ makeRequest, token }) => {
      let productId = null
      try {
        const listRes = await makeRequest('GET', '/api/admin/products', null, token)
        const createRes = await makeRequest('POST', '/api/admin/products', {
          trade_name: uniqueName('Regression Product'),
        }, token)
        productId = Number(createRes.body?.id || 0)
        if (listRes.status !== 200 || createRes.status !== 201 || !productId) {
          return { pass: false, details: `list=${listRes.status}, create=${createRes.status}` }
        }

        const updateRes = await makeRequest('PUT', `/api/admin/products/${productId}`, {
          trade_name: uniqueName('Regression Product Updated'),
          is_active: true,
        }, token)

        return {
          pass: updateRes.status === 200,
          details: `list=${listRes.status}, create=${createRes.status}, update=${updateRes.status}`,
        }
      } finally {
        if (productId) await pool.execute('DELETE FROM product_country_authorizations WHERE product_id = ?', [productId]).catch(() => {})
        if (productId) await pool.execute('DELETE FROM product_approvals WHERE product_id = ?', [productId]).catch(() => {})
        if (productId) await pool.execute('DELETE FROM products WHERE id = ?', [productId]).catch(() => {})
      }
    }
  },
  {
    name: 'Product family and enriched product routes cover lifecycle clone and bulk deactivate',
    module: 'Admin — Products',
    covers: [
      'GET /api/admin/product-families',
      'POST /api/admin/product-families',
      'PUT /api/admin/product-families/:id',
      'POST /api/admin/products-full',
      'PUT /api/admin/products-full/:id',
      'DELETE /api/admin/products-full/:id',
      'POST /api/admin/products/:id/clone',
      'PATCH /api/admin/products/bulk-deactivate',
    ],
    run: async ({ makeRequest, token }) => {
      let familyId = null
      let productId = null
      let cloneId = null
      try {
        const familiesRes = await makeRequest('GET', '/api/admin/product-families', null, token)
        const createFamily = await makeRequest('POST', '/api/admin/product-families', {
          name: uniqueName('Regression Family'),
          ingredients: ['api-1', 'api-2'],
          is_active: true,
        }, token)
        familyId = Number(createFamily.body?.id || createFamily.body?.family?.id || 0)
        if (familiesRes.status !== 200 || createFamily.status !== 201 || !familyId) {
          return { pass: false, details: `families=${familiesRes.status}, createFamily=${createFamily.status}` }
        }

        const updateFamily = await makeRequest('PUT', `/api/admin/product-families/${familyId}`, {
          name: uniqueName('Regression Family Updated'),
          ingredients: ['api-3'],
          is_active: true,
        }, token)
        const createProduct = await makeRequest('POST', '/api/admin/products-full', {
          trade_name: uniqueName('Regression Full Product'),
          family_id: familyId,
          dosage: '10mg',
          atc_code: 'REG123',
          is_active: true,
        }, token)
        productId = Number(createProduct.body?.id || createProduct.body?.product?.id || 0)
        if (updateFamily.status !== 200 || createProduct.status !== 201 || !productId) {
          return { pass: false, details: `updateFamily=${updateFamily.status}, createProduct=${createProduct.status}` }
        }

        const updateProduct = await makeRequest('PUT', `/api/admin/products-full/${productId}`, {
          trade_name: uniqueName('Regression Full Product Updated'),
          family_id: familyId,
          dosage: '20mg',
          atc_code: 'REG456',
          is_active: true,
        }, token)
        const cloneRes = await makeRequest('POST', `/api/admin/products/${productId}/clone`, {}, token)
        cloneId = Number(cloneRes.body?.id || 0)
        const bulkDeactivate = await makeRequest('PATCH', '/api/admin/products/bulk-deactivate', {
          ids: [productId, cloneId].filter(Boolean),
        }, token)
        const deleteProduct = await makeRequest('DELETE', `/api/admin/products-full/${productId}`, null, token)

        return {
          pass: updateProduct.status === 200 &&
            cloneRes.status === 200 &&
            !!cloneId &&
            bulkDeactivate.status === 200 &&
            deleteProduct.status === 200,
          details: `families=${familiesRes.status}, createFamily=${createFamily.status}, updateFamily=${updateFamily.status}, createProduct=${createProduct.status}, updateProduct=${updateProduct.status}, clone=${cloneRes.status}, bulkDeactivate=${bulkDeactivate.status}, deleteProduct=${deleteProduct.status}`,
        }
      } finally {
        if (cloneId) await pool.execute('DELETE FROM product_country_authorizations WHERE product_id = ?', [cloneId]).catch(() => {})
        if (cloneId) await pool.execute('DELETE FROM product_approvals WHERE product_id = ?', [cloneId]).catch(() => {})
        if (cloneId) await pool.execute('DELETE FROM products WHERE id = ?', [cloneId]).catch(() => {})
        if (productId) await pool.execute('DELETE FROM product_country_authorizations WHERE product_id = ?', [productId]).catch(() => {})
        if (productId) await pool.execute('DELETE FROM product_approvals WHERE product_id = ?', [productId]).catch(() => {})
        if (productId) await pool.execute('DELETE FROM products WHERE id = ?', [productId]).catch(() => {})
        if (familyId) await pool.execute('DELETE FROM product_families WHERE id = ?', [familyId]).catch(() => {})
      }
    }
  },
  {
    name: 'Product approvals and country authorizations cover full lifecycle',
    module: 'Admin — Products',
    covers: [
      'GET /api/admin/products/:id/approvals',
      'POST /api/admin/products/:id/approvals',
      'PUT /api/admin/products/approvals/:approvalId',
      'DELETE /api/admin/products/approvals/:approvalId',
      'GET /api/admin/products/:id/country-authorizations',
      'POST /api/admin/products/:id/country-authorizations',
      'PUT /api/admin/products/country-authorizations/:authId',
      'DELETE /api/admin/products/country-authorizations/:authId',
    ],
    run: async ({ makeRequest, token }) => {
      let productId = null
      let approvalId = null
      let authId = null
      try {
        const createProduct = await makeRequest('POST', '/api/admin/products', {
          trade_name: uniqueName('Regression Approval Product'),
        }, token)
        productId = Number(createProduct.body?.id || 0)
        if (createProduct.status !== 201 || !productId) {
          return { pass: false, details: `createProduct=${createProduct.status}` }
        }

        const approvalsRes = await makeRequest('GET', `/api/admin/products/${productId}/approvals`, null, token)
        const createApproval = await makeRequest('POST', `/api/admin/products/${productId}/approvals`, {
          approval_number: uniqueName('APR'),
          regulatory_body: 'CDSCO',
          approval_date: '2026-01-01',
          expiry_date: '2027-01-01',
          status: 'Active',
        }, token)
        approvalId = Number(createApproval.body?.approval?.id || 0)
        if (approvalsRes.status !== 200 || createApproval.status !== 201 || !approvalId) {
          return { pass: false, details: `approvals=${approvalsRes.status}, createApproval=${createApproval.status}` }
        }

        const updateApproval = await makeRequest('PUT', `/api/admin/products/approvals/${approvalId}`, {
          approval_number: uniqueName('APRU'),
          regulatory_body: 'USFDA',
          approval_date: '2026-02-01',
          expiry_date: '2027-02-01',
          status: 'Active',
        }, token)
        const authsRes = await makeRequest('GET', `/api/admin/products/${productId}/country-authorizations`, null, token)
        const createAuth = await makeRequest('POST', `/api/admin/products/${productId}/country-authorizations`, {
          country: 'India',
          auth_number: uniqueName('AUTH'),
          auth_date: '2026-03-01',
          status: 'Active',
        }, token)
        authId = Number(createAuth.body?.authorization?.id || 0)
        if (updateApproval.status !== 200 || authsRes.status !== 200 || createAuth.status !== 201 || !authId) {
          return {
            pass: false,
            details: `updateApproval=${updateApproval.status}, auths=${authsRes.status}, createAuth=${createAuth.status}`,
          }
        }

        const updateAuth = await makeRequest('PUT', `/api/admin/products/country-authorizations/${authId}`, {
          country: 'United States',
          auth_number: uniqueName('AUTHU'),
          auth_date: '2026-04-01',
          status: 'Active',
        }, token)
        const deleteApproval = await makeRequest('DELETE', `/api/admin/products/approvals/${approvalId}`, null, token)
        const deleteAuth = await makeRequest('DELETE', `/api/admin/products/country-authorizations/${authId}`, null, token)

        return {
          pass: updateAuth.status === 200 &&
            deleteApproval.status === 200 &&
            deleteAuth.status === 200,
          details: `approvals=${approvalsRes.status}, createApproval=${createApproval.status}, updateApproval=${updateApproval.status}, auths=${authsRes.status}, createAuth=${createAuth.status}, updateAuth=${updateAuth.status}, deleteApproval=${deleteApproval.status}, deleteAuth=${deleteAuth.status}`,
        }
      } finally {
        if (authId) await pool.execute('DELETE FROM product_country_authorizations WHERE id = ?', [authId]).catch(() => {})
        if (approvalId) await pool.execute('DELETE FROM product_approvals WHERE id = ?', [approvalId]).catch(() => {})
        if (productId) await pool.execute('DELETE FROM product_country_authorizations WHERE product_id = ?', [productId]).catch(() => {})
        if (productId) await pool.execute('DELETE FROM product_approvals WHERE product_id = ?', [productId]).catch(() => {})
        if (productId) await pool.execute('DELETE FROM products WHERE id = ?', [productId]).catch(() => {})
      }
    }
  },
]
