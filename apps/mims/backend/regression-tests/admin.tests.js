'use strict';
/**
 * Admin module regression tests
 */
const pool = require('../database/db')
let bcrypt
try {
  bcrypt = require('bcryptjs')
} catch (_) {
  bcrypt = require('bcrypt')
}
const { getFirstUser, uniqueName } = require('./helpers');

async function getFirstOrg(makeRequest, token) {
  const res = await makeRequest('GET', '/api/admin/orgs', null, token)
  const orgs = Array.isArray(res.body?.orgs) ? res.body.orgs : []
  return orgs[0] || null
}

async function getFirstSite(makeRequest, token) {
  const res = await makeRequest('GET', '/api/admin/sites', null, token)
  const sites = Array.isArray(res.body?.sites) ? res.body.sites : []
  return sites[0] || null
}

function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token || '').split('.')
    if (!payload) return {}
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch (_) {
    return {}
  }
}

async function loginForToken(makeRequest, email, password) {
  const login = await makeRequest('POST', '/api/auth/login', { email, password }, null)
  if (login.status !== 200) {
    return { status: login.status, token: null, body: login.body }
  }
  if (login.body?.token) {
    return { status: login.status, token: login.body.token, body: login.body }
  }
  if (login.body?.challengeToken) {
    const skip = await makeRequest('POST', '/api/auth/2fa/skip-setup', {
      challengeToken: login.body.challengeToken,
    }, null)
    return { status: skip.status, token: skip.body?.token || null, body: skip.body }
  }
  return { status: login.status, token: null, body: login.body }
}

async function createTemporaryPlatformAdmin(makeRequest) {
  const email = `${uniqueName('regression-superadmin').toLowerCase()}@example.com`
  const password = 'TempPlatformAdmin@123'
  const hash = await bcrypt.hash(password, 10)
  const [insert] = await pool.execute(
    `INSERT INTO users (name, email, password, role, is_active, email_verified)
     VALUES (?, ?, ?, 'superadmin', 1, 1)`,
    ['Regression Platform Admin', email, hash]
  )
  const userId = Number(insert.insertId || 0)
  const login = await loginForToken(makeRequest, email, password)
  return { userId, email, password, token: login.token, status: login.status, body: login.body }
}

async function createTemporaryOrgScopedPlatformAdmin(makeRequest, orgId, siteId) {
  const email = `${uniqueName('regression-org-superadmin').toLowerCase()}@example.com`
  const password = 'TempOrgPlatformAdmin@123'
  const hash = await bcrypt.hash(password, 10)
  const [insert] = await pool.execute(
    `INSERT INTO users (name, email, password, role, is_active, email_verified)
     VALUES (?, ?, ?, 'admin', 1, 1)`,
    ['Regression Org Platform Admin', email, hash]
  )
  const userId = Number(insert.insertId || 0)
  await pool.execute(
    `INSERT INTO user_org_access (user_id, org_id, primary_site_id, role_at_org, site_permission, is_active, last_accessed_at)
     VALUES (?, ?, ?, 'superadmin', 'all', 1, NOW())`,
    [userId, orgId, siteId || null]
  )
  const login = await loginForToken(makeRequest, email, password)
  return { userId, email, password, token: login.token, status: login.status, body: login.body }
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
    name: 'Admin contacts routes cover CRUD lifecycle with cleanup',
    module: 'Admin — Contacts',
    covers: [
      'GET /api/admin/contacts',
      'POST /api/admin/contacts',
      'GET /api/admin/contacts/:id',
      'PUT /api/admin/contacts/:id',
      'DELETE /api/admin/contacts/:id',
    ],
    run: async ({ makeRequest, token }) => {
      let contactId = null
      try {
        const site = await getFirstSite(makeRequest, token)
        const firstName = uniqueName('RegressionContact')
        const email = `${firstName.toLowerCase()}@example.com`

        const listBefore = await makeRequest('GET', `/api/admin/contacts?search=${encodeURIComponent(firstName)}`, null, token)
        const create = await makeRequest('POST', '/api/admin/contacts', {
          type: 'HCP',
          first_name: firstName,
          last_name: 'User',
          specialty: 'Oncology',
          institution: 'Regression Institute',
          email,
          phone: '9999991111',
          site_id: site?.id || null,
          notes: 'Regression contact notes',
          address: 'Regression address',
          do_not_update_master: false,
        }, token)
        contactId = Number(create.body?.id || create.body?.contact?.id || 0)
        if (listBefore.status !== 200 || create.status !== 201 || !contactId) {
          return { pass: false, details: `listBefore=${listBefore.status}, create=${create.status}, contactId=${contactId}` }
        }

        const getOne = await makeRequest('GET', `/api/admin/contacts/${contactId}`, null, token)
        const update = await makeRequest('PUT', `/api/admin/contacts/${contactId}`, {
          type: 'HCP',
          first_name: `${firstName}Updated`,
          last_name: 'User',
          specialty: 'Medical',
          institution: 'Regression Institute Updated',
          email,
          phone: '9999992222',
          site_id: site?.id || null,
          notes: 'Regression contact notes updated',
          address: 'Regression address updated',
          do_not_update_master: true,
        }, token)
        const del = await makeRequest('DELETE', `/api/admin/contacts/${contactId}`, null, token)

        return {
          pass: getOne.status === 200 && update.status === 200 && del.status === 200,
          details: `listBefore=${listBefore.status}, create=${create.status}, getOne=${getOne.status}, update=${update.status}, delete=${del.status}`,
        }
      } finally {
        if (contactId) {
          await pool.execute('UPDATE contacts SET is_active = 0 WHERE id = ?', [contactId]).catch(() => {})
        }
      }
    }
  },
  {
    name: 'Admin company reps routes cover CRUD and import lifecycle with cleanup',
    module: 'Admin — Company Reps',
    covers: [
      'GET /api/admin/company-reps',
      'POST /api/admin/company-reps',
      'PUT /api/admin/company-reps/:id',
      'POST /api/admin/company-reps/import',
      'DELETE /api/admin/company-reps/:id',
    ],
    run: async ({ makeRequest, token }) => {
      let repId = null
      let importedRepId = null
      try {
        const repName = uniqueName('Regression Rep')
        const repEmail = `${repName.toLowerCase().replace(/\s+/g, '-')}@example.com`
        const importedName = uniqueName('Imported Rep')
        const importedEmail = `${importedName.toLowerCase().replace(/\s+/g, '-')}@example.com`

        const listBefore = await makeRequest('GET', `/api/admin/company-reps?search=${encodeURIComponent(repName)}`, null, token)
        const create = await makeRequest('POST', '/api/admin/company-reps', {
          name: repName,
          title: 'MSL',
          territory: 'South',
          email: repEmail,
          phone: '8888881111',
        }, token)
        repId = Number(create.body?.id || create.body?.rep?.id || 0)
        if (listBefore.status !== 200 || create.status !== 201 || !repId) {
          return { pass: false, details: `listBefore=${listBefore.status}, create=${create.status}, repId=${repId}` }
        }

        const update = await makeRequest('PUT', `/api/admin/company-reps/${repId}`, {
          name: `${repName} Updated`,
          title: 'Senior MSL',
          territory: 'West',
          email: repEmail,
          phone: '8888882222',
        }, token)
        const importRes = await makeRequest('POST', '/api/admin/company-reps/import', {
          rows: [{ name: importedName, email: importedEmail, phone: '8888883333', territory: 'North' }],
        }, token)
        const [[importedRow]] = await pool.execute('SELECT id FROM company_reps WHERE email = ? ORDER BY id DESC LIMIT 1', [importedEmail])
        importedRepId = Number(importedRow?.id || 0)
        const del = await makeRequest('DELETE', `/api/admin/company-reps/${repId}`, null, token)

        return {
          pass: update.status === 200 && importRes.status === 200 && Number(importRes.body?.imported || 0) >= 1 && del.status === 200,
          details: `listBefore=${listBefore.status}, create=${create.status}, update=${update.status}, import=${importRes.status}, imported=${importRes.body?.imported || 0}, delete=${del.status}`,
        }
      } finally {
        if (repId) {
          await pool.execute('UPDATE company_reps SET is_active = 0 WHERE id = ?', [repId]).catch(() => {})
        }
        if (importedRepId) {
          await pool.execute('UPDATE company_reps SET is_active = 0 WHERE id = ?', [importedRepId]).catch(() => {})
        }
      }
    }
  },
  {
    name: 'Admin scheduled exports routes cover lifecycle',
    module: 'Admin — Scheduled Exports',
    covers: [
      'GET /api/admin/exports/scheduled',
      'POST /api/admin/exports/scheduled',
      'PUT /api/admin/exports/scheduled/:id',
      'DELETE /api/admin/exports/scheduled/:id',
    ],
    run: async ({ makeRequest, token }) => {
      let configId = null
      try {
        const listBefore = await makeRequest('GET', '/api/admin/exports/scheduled', null, token)
        const create = await makeRequest('POST', '/api/admin/exports/scheduled', {
          export_name: uniqueName('Regression Export'),
          report_key: 'daily-case-summary',
          schedule_frequency: 'daily',
          schedule_time_local: '08:00',
          timezone_name: 'Asia/Kolkata',
          delivery_method: 'email',
          delivery_target: 'regression@example.com',
          email_subject: 'Regression Scheduled Export',
        }, token)
        configId = Number(create.body?.id || 0)
        if (listBefore.status !== 200 || create.status !== 200 || !configId) {
          return { pass: false, details: `listBefore=${listBefore.status}, create=${create.status}, configId=${configId}` }
        }

        const update = await makeRequest('PUT', `/api/admin/exports/scheduled/${configId}`, {
          export_name: uniqueName('Regression Export Updated'),
          schedule_frequency: 'weekly',
          schedule_weekday: 2,
          schedule_time_local: '09:15',
          timezone_name: 'UTC',
          delivery_target: 'regression-updated@example.com',
          email_subject: 'Regression Scheduled Export Updated',
          is_active: true,
        }, token)
        const del = await makeRequest('DELETE', `/api/admin/exports/scheduled/${configId}`, null, token)

        return {
          pass: update.status === 200 && del.status === 200,
          details: `listBefore=${listBefore.status}, create=${create.status}, update=${update.status}, delete=${del.status}`,
        }
      } finally {
        if (configId) await pool.execute('DELETE FROM scheduled_export_configs WHERE id = ?', [configId]).catch(() => {})
      }
    }
  },
  {
    name: 'Admin esig verify and impact preview routes cover validation flow',
    module: 'Admin — eSig and Impact Preview',
    covers: [
      'POST /api/admin/esig-verify',
      'POST /api/admin/impact-preview',
    ],
    run: async ({ makeRequest, token }) => {
      const esig = await makeRequest('POST', '/api/admin/esig-verify', {
        password: process.env.REGRESSION_PASSWORD || 'Test@1234',
        reason: 'Regression verification',
        action: 'APPROVE',
        entity: 'regression_suite',
        entity_id: 1,
      }, token)
      const impact = await makeRequest('POST', '/api/admin/impact-preview', {
        change_type: 'taxonomy',
        entity_id: 1,
      }, token)

      return {
        pass: esig.status === 200 &&
          esig.body?.verified === true &&
          impact.status === 200 &&
          String(impact.body?.change_type || '') === 'taxonomy',
        details: `esig=${esig.status}, impact=${impact.status}`,
      }
    }
  },
  {
    name: 'Admin help routes cover article lifecycle review import and cache flows',
    module: 'Admin — Help',
    covers: [
      'GET /api/admin/help',
      'POST /api/admin/help',
      'GET /api/admin/help/:id',
      'PUT /api/admin/help/:id',
      'DELETE /api/admin/help/:id',
      'PATCH /api/admin/help/:id/reviewed',
      'POST /api/admin/help/bulk-import',
      'POST /api/admin/help/cache-bust',
      'GET /api/admin/help/coverage',
      'GET /api/admin/help/stale',
    ],
    run: async ({ makeRequest, token }) => {
      let articleId = null
      let importedArticleId = null
      try {
        const featureKey = 'admin.picklists'
        const title = uniqueName('Regression Help')
        const importedTitle = uniqueName('Regression Help Imported')

        const cacheBust = await makeRequest('POST', '/api/admin/help/cache-bust', {}, token)
        const listBefore = await makeRequest('GET', `/api/admin/help?feature_key=${encodeURIComponent(featureKey)}`, null, token)
        const create = await makeRequest('POST', '/api/admin/help', {
          feature_key: featureKey,
          feature_group: 'admin',
          tags: ['regression', 'help'],
          title,
          content_html: '<p>Regression help content</p>',
          summary: 'Regression help summary',
          audience: ['all'],
          sort_order: 7,
          is_active: true,
        }, token)
        articleId = Number(create.body?.id || 0)
        if (cacheBust.status !== 200 || listBefore.status !== 200 || create.status !== 201 || !articleId) {
          return { pass: false, details: `cacheBust=${cacheBust.status}, listBefore=${listBefore.status}, create=${create.status}, articleId=${articleId}` }
        }

        const getOne = await makeRequest('GET', `/api/admin/help/${articleId}`, null, token)
        const update = await makeRequest('PUT', `/api/admin/help/${articleId}`, {
          feature_key: featureKey,
          feature_group: 'admin',
          tags: ['regression', 'updated'],
          title,
          content_html: '<p>Regression help content updated</p>',
          summary: 'Regression help summary updated',
          audience: ['all'],
          sort_order: 8,
          is_active: true,
        }, token)
        const reviewed = await makeRequest('PATCH', `/api/admin/help/${articleId}/reviewed`, {}, token)
        const stale = await makeRequest('GET', '/api/admin/help/stale', null, token)
        const coverage = await makeRequest('GET', '/api/admin/help/coverage', null, token)
        const bulkImport = await makeRequest('POST', '/api/admin/help/bulk-import', {
          articles: [{
            feature_key: 'reports',
            feature_group: 'reports',
            tags: ['bulk', 'regression'],
            title: importedTitle,
            content_html: '<p>Imported regression help article</p>',
            summary: 'Imported regression help summary',
            audience: ['all'],
            sort_order: 9,
            is_active: true,
          }],
        }, token)
        const [[importedRow]] = await pool.execute(
          'SELECT id FROM help_articles WHERE title = ? ORDER BY id DESC LIMIT 1',
          [importedTitle]
        )
        importedArticleId = Number(importedRow?.id || 0)
        const del = await makeRequest('DELETE', `/api/admin/help/${articleId}`, null, token)

        const coverageRows = Array.isArray(coverage.body?.coverage) ? coverage.body.coverage : []
        return {
          pass: getOne.status === 200 &&
            update.status === 200 &&
            reviewed.status === 200 &&
            stale.status === 200 &&
            coverage.status === 200 &&
            coverageRows.some((row) => row?.feature_key === featureKey) &&
            bulkImport.status === 200 &&
            del.status === 200,
          details: `cacheBust=${cacheBust.status}, listBefore=${listBefore.status}, create=${create.status}, getOne=${getOne.status}, update=${update.status}, reviewed=${reviewed.status}, stale=${stale.status}, coverage=${coverage.status}, bulkImport=${bulkImport.status}, delete=${del.status}`,
        }
      } finally {
        if (articleId) await pool.execute('DELETE FROM help_articles WHERE id = ?', [articleId]).catch(() => {})
        if (importedArticleId) await pool.execute('DELETE FROM help_articles WHERE id = ?', [importedArticleId]).catch(() => {})
      }
    }
  },
  {
    name: 'Admin integrations routes cover CRM MIR OAuth2 and Vault flows',
    module: 'Admin — Integrations',
    covers: [
      'POST /api/admin/integrations/crm/sync-case/:caseId',
      'GET /api/admin/integrations/crm/sync-log',
      'POST /api/admin/integrations/crm/test-connection',
      'POST /api/admin/integrations/mir/send-case/:caseId',
      'GET /api/admin/integrations/mir/sync-log',
      'POST /api/admin/integrations/mir/test-connection',
      'POST /api/admin/integrations/oauth2/token',
      'DELETE /api/admin/integrations/oauth2/token',
      'POST /api/admin/integrations/vault/test-connection',
    ],
    run: async ({ makeRequest, token }) => {
      let caseId = null
      let crmLogId = null
      let mirLogId = null
      let vaultConfigId = null
      try {
        const auth = decodeJwtPayload(token)
        const orgId = Number(auth.orgId || auth.org_id || 0)
        if (!orgId) return { pass: false, details: 'No orgId on admin token.' }

        const site = await getFirstSite(makeRequest, token)
        if (!site?.id) return { pass: false, details: 'No site available for integrations case.' }

        const createCase = await makeRequest('POST', '/api/cases', {
          site_id: site.id,
          case_type: 'MI',
          intake_channel: 'manual',
          date_received: '2026-04-25',
        }, token)
        caseId = Number(createCase.body?.id || 0)
        if (createCase.status !== 201 || !caseId) {
          return { pass: false, details: `createCase=${createCase.status}` }
        }

        const [crmInsert] = await pool.execute(
          `INSERT INTO crm_sync_log (org_id, case_id, platform, direction, status, crm_reference, error_message, payload)
           VALUES (?, ?, 'salesforce', 'outbound', 'failed', NULL, 'Regression CRM sync log', ?)`,
          [orgId, caseId, JSON.stringify({ source: 'regression-crm-log' })]
        )
        crmLogId = Number(crmInsert.insertId || 0)
        const [mirInsert] = await pool.execute(
          `INSERT INTO mir_sync_log (org_id, case_id, direction, status, mir_reference, error_message, payload)
           VALUES (?, ?, 'outbound', 'error', NULL, 'Regression MIR sync log', ?)`,
          [orgId, caseId, JSON.stringify({ source: 'regression-mir-log' })]
        )
        mirLogId = Number(mirInsert.insertId || 0)

        const crmTest = await makeRequest('POST', '/api/admin/integrations/crm/test-connection', {}, token)
        const crmSync = await makeRequest('POST', `/api/admin/integrations/crm/sync-case/${caseId}`, {}, token)
        const crmLog = await makeRequest('GET', '/api/admin/integrations/crm/sync-log', null, token)

        const mirTest = await makeRequest('POST', '/api/admin/integrations/mir/test-connection', {}, token)
        const mirSend = await makeRequest('POST', `/api/admin/integrations/mir/send-case/${caseId}`, {}, token)
        const mirLog = await makeRequest('GET', '/api/admin/integrations/mir/sync-log', null, token)

        const oauthPost = await makeRequest('POST', '/api/admin/integrations/oauth2/token', {
          integrationType: 'salesforce',
        }, token)
        const oauthDelete = await makeRequest('DELETE', '/api/admin/integrations/oauth2/token', {
          integrationType: 'salesforce',
        }, token)

        const [vaultInsert] = await pool.execute(
          `INSERT INTO org_vault_config
           (org_id, vault_domain, vault_username, vault_password, vault_api_version, poll_interval_hours, enabled)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [orgId, 'http://127.0.0.1:1', 'vault-user', 'vault-pass', 'v24.1', 12]
        )
        vaultConfigId = Number(vaultInsert.insertId || 0)
        const vaultTest = await makeRequest('POST', '/api/admin/integrations/vault/test-connection', {}, token)

        return {
          pass: crmTest.status === 200 &&
            crmTest.body?.success === false &&
            crmSync.status === 500 &&
            crmLog.status === 200 &&
            Array.isArray(crmLog.body?.logs) &&
            crmLog.body.logs.some((row) => Number(row?.id || 0) === crmLogId) &&
            mirTest.status === 200 &&
            mirTest.body?.success === false &&
            mirSend.status === 500 &&
            mirLog.status === 200 &&
            Array.isArray(mirLog.body?.logs) &&
            mirLog.body.logs.some((row) => Number(row?.id || 0) === mirLogId) &&
            oauthPost.status === 400 &&
            oauthDelete.status === 200 &&
            vaultTest.status === 400,
          details: `crmTest=${crmTest.status}, crmSync=${crmSync.status}, crmLog=${crmLog.status}, mirTest=${mirTest.status}, mirSend=${mirSend.status}, mirLog=${mirLog.status}, oauthPost=${oauthPost.status}, oauthDelete=${oauthDelete.status}, vaultTest=${vaultTest.status}`,
        }
      } finally {
        if (crmLogId) await pool.execute('DELETE FROM crm_sync_log WHERE id = ?', [crmLogId]).catch(() => {})
        if (mirLogId) await pool.execute('DELETE FROM mir_sync_log WHERE id = ?', [mirLogId]).catch(() => {})
        if (vaultConfigId) await pool.execute('DELETE FROM org_vault_config WHERE id = ?', [vaultConfigId]).catch(() => {})
        if (caseId) await pool.execute('DELETE FROM cases WHERE id = ?', [caseId]).catch(() => {})
      }
    }
  },
  {
    name: 'Admin observability permissions and process explorer SQL routes cover lifecycle',
    module: 'Admin — Observability and Process Explorer',
    covers: [
      'GET /api/admin/observability/exceptions',
      'GET /api/admin/observability/summary',
      'PUT /api/admin/permissions',
      'GET /api/admin/process-logs',
      'GET /api/admin/process-logs/config',
      'POST /api/admin/process-logs/flow-map',
      'GET /api/admin/process-logs/library',
      'POST /api/admin/process-logs/refresh',
      'DELETE /api/admin/process-logs/purge',
      'GET /api/admin/process-logs/sql/audit',
      'POST /api/admin/process-logs/sql/execute',
      'POST /api/admin/process-logs/sql/explain',
      'GET /api/admin/process-logs/sql/graph',
      'POST /api/admin/process-logs/sql/nl2sql',
      'GET /api/admin/process-logs/sql/saved',
      'POST /api/admin/process-logs/sql/saved',
      'PUT /api/admin/process-logs/sql/saved/:id',
      'DELETE /api/admin/process-logs/sql/saved/:id',
      'GET /api/admin/process-logs/sql/schema',
      'GET /api/admin/process-logs/sql/suggest',
      'POST /api/admin/process-logs/sql/validate',
    ],
    run: async ({ makeRequest, token }) => {
      let savedQueryId = null
      let originalProcessExplorerEnabled = null
      try {
        const auth = decodeJwtPayload(token)
        const orgId = Number(auth.orgId || auth.org_id || 0)
        if (!orgId) return { pass: false, details: 'No orgId on admin token.' }

        const [[orgRow]] = await pool.execute(
          'SELECT process_explorer_enabled FROM organisations WHERE id = ? LIMIT 1',
          [orgId]
        )
        originalProcessExplorerEnabled = orgRow ? Number(orgRow.process_explorer_enabled || 0) : 0
        if (!originalProcessExplorerEnabled) {
          await pool.execute('UPDATE organisations SET process_explorer_enabled = 1 WHERE id = ?', [orgId])
        }

        const [[permRow]] = await pool.execute(
          'SELECT can_access FROM role_permissions WHERE role = ? AND module = ? LIMIT 1',
          ['admin', 'reports']
        )
        const originalCanAccess = permRow ? Number(permRow.can_access || 0) : 1

        const observabilitySummary = await makeRequest('GET', '/api/admin/observability/summary', null, token)
        const observabilityExceptions = await makeRequest('GET', '/api/admin/observability/exceptions', null, token)
        const permissionsUpdate = await makeRequest('PUT', '/api/admin/permissions', {
          role: 'admin',
          module: 'reports',
          can_access: !!originalCanAccess,
        }, token)

        const config = await makeRequest('GET', '/api/admin/process-logs/config', null, token)
        const schema = await makeRequest('GET', '/api/admin/process-logs/sql/schema', null, token)
        const suggest = await makeRequest('GET', '/api/admin/process-logs/sql/suggest?q=case', null, token)
        const explain = await makeRequest('POST', '/api/admin/process-logs/sql/explain', {
          sql: 'SELECT id FROM cases WHERE id = :id',
        }, token)
        const validate = await makeRequest('POST', '/api/admin/process-logs/sql/validate', {
          sql: 'SELECT id FROM cases LIMIT 5',
        }, token)
        const nl2sql = await makeRequest('POST', '/api/admin/process-logs/sql/nl2sql', {
          prompt: 'show failed cases this week',
        }, token)
        const graph = await makeRequest('GET', '/api/admin/process-logs/sql/graph', null, token)
        const execute = await makeRequest('POST', '/api/admin/process-logs/sql/execute', {
          sql: 'SELECT id FROM organisations WHERE id = :id',
          params: { id: orgId },
          mode: 'dry_run',
          limit_rows: 10,
        }, token)
        const audit = await makeRequest('GET', '/api/admin/process-logs/sql/audit?limit=20', null, token)
        const savedListBefore = await makeRequest('GET', '/api/admin/process-logs/sql/saved', null, token)
        const savedCreate = await makeRequest('POST', '/api/admin/process-logs/sql/saved', {
          name: uniqueName('Regression Saved SQL'),
          description: 'Regression saved SQL query',
          category: 'regression',
          tags: ['regression', 'sql'],
          sql_text: 'SELECT id FROM organisations LIMIT 5',
          is_shared: false,
        }, token)
        savedQueryId = Number(savedCreate.body?.id || 0)
        const savedUpdate = await makeRequest('PUT', `/api/admin/process-logs/sql/saved/${savedQueryId}`, {
          name: uniqueName('Regression Saved SQL Updated'),
          description: 'Regression saved SQL query updated',
          category: 'regression',
          tags: ['updated'],
          sql_text: 'SELECT id FROM organisations LIMIT 3',
          is_shared: false,
          is_active: true,
        }, token)
        const processLogs = await makeRequest('GET', '/api/admin/process-logs?limit=20', null, token)
        const library = await makeRequest('GET', '/api/admin/process-logs/library', null, token)
        const flowMap = await makeRequest('POST', '/api/admin/process-logs/flow-map', {
          method: 'POST',
          path_pattern: '/api/admin/process-logs/sql/execute',
        }, token)
        const refresh = await makeRequest('POST', '/api/admin/process-logs/refresh', {}, token)
        const purge = await makeRequest('DELETE', '/api/admin/process-logs/purge?days=365', null, token)
        const savedDelete = await makeRequest('DELETE', `/api/admin/process-logs/sql/saved/${savedQueryId}`, null, token)

        return {
          pass: observabilitySummary.status === 200 &&
            observabilityExceptions.status === 200 &&
            permissionsUpdate.status === 200 &&
            config.status === 200 &&
            config.body?.allowed === true &&
            schema.status === 200 &&
            suggest.status === 200 &&
            explain.status === 200 &&
            validate.status === 200 &&
            nl2sql.status === 200 &&
            graph.status === 200 &&
            execute.status === 200 &&
            audit.status === 200 &&
            savedListBefore.status === 200 &&
            savedCreate.status === 201 &&
            savedQueryId > 0 &&
            savedUpdate.status === 200 &&
            processLogs.status === 200 &&
            library.status === 200 &&
            flowMap.status === 200 &&
            refresh.status === 200 &&
            purge.status === 200 &&
            savedDelete.status === 200,
          details: `obsSummary=${observabilitySummary.status}, obsExceptions=${observabilityExceptions.status}, permissions=${permissionsUpdate.status}, config=${config.status}, schema=${schema.status}, suggest=${suggest.status}, explain=${explain.status}, validate=${validate.status}, nl2sql=${nl2sql.status}, graph=${graph.status}, execute=${execute.status}, audit=${audit.status}, savedList=${savedListBefore.status}, savedCreate=${savedCreate.status}, savedUpdate=${savedUpdate.status}, processLogs=${processLogs.status}, library=${library.status}, flowMap=${flowMap.status}, refresh=${refresh.status}, purge=${purge.status}, savedDelete=${savedDelete.status}`,
        }
      } finally {
        if (savedQueryId) await pool.execute('DELETE FROM process_explorer_saved_queries WHERE id = ?', [savedQueryId]).catch(() => {})
        if (originalProcessExplorerEnabled != null) {
          await pool.execute('UPDATE organisations SET process_explorer_enabled = ? WHERE id = ?', [originalProcessExplorerEnabled, Number(decodeJwtPayload(token).orgId || 0)]).catch(() => {})
        }
      }
    }
  },
  {
    name: 'Admin process explorer ops routes cover request approval rejection analytics and snapshots',
    module: 'Admin — Process Explorer Ops',
    covers: [
      'GET /api/admin/process-logs/ops/analytics',
      'GET /api/admin/process-logs/ops/metrics',
      'POST /api/admin/process-logs/ops/request',
      'GET /api/admin/process-logs/ops/requests',
      'POST /api/admin/process-logs/ops/requests/:id/approve',
      'POST /api/admin/process-logs/ops/requests/:id/reject',
      'GET /api/admin/process-logs/ops/requests/:id/snapshots',
    ],
    run: async ({ makeRequest, token }) => {
      let originalProcessExplorerEnabled = null
      let approveRequestId = null
      let rejectRequestId = null
      let tempPlatformAdminUserId = null
      try {
        const auth = decodeJwtPayload(token)
        const orgId = Number(auth.orgId || auth.org_id || 0)
        if (!orgId) return { pass: false, details: 'No orgId on admin token.' }
        const site = await getFirstSite(makeRequest, token)

        const [[orgRow]] = await pool.execute(
          'SELECT process_explorer_enabled FROM organisations WHERE id = ? LIMIT 1',
          [orgId]
        )
        originalProcessExplorerEnabled = orgRow ? Number(orgRow.process_explorer_enabled || 0) : 0
        if (!originalProcessExplorerEnabled) {
          await pool.execute('UPDATE organisations SET process_explorer_enabled = 1 WHERE id = ?', [orgId])
        }

        const scopedPlatformAdmin = await createTemporaryOrgScopedPlatformAdmin(makeRequest, orgId, site?.id || null)
        tempPlatformAdminUserId = scopedPlatformAdmin.userId
        if (scopedPlatformAdmin.status !== 200 || !scopedPlatformAdmin.token) {
          return { pass: false, details: `scopedPlatformAdminLogin=${scopedPlatformAdmin.status}` }
        }

        const requestListBefore = await makeRequest('GET', '/api/admin/process-logs/ops/requests?status=all', null, token)
        const approveRequest = await makeRequest('POST', '/api/admin/process-logs/ops/request', {
          action_type: 'rollback',
          route_method: 'POST',
          route_path_pattern: '/api/admin/process-logs/ops/rollback',
          entity_type: 'org',
          entity_id: String(orgId),
          reason: 'Regression rollback approval path validation',
          request_payload: {
            rollback_sql: 'UPDATE organisations SET updated_at = NOW() WHERE id = :id',
            rollback_params: { id: orgId },
          },
          confirmation_text: 'CONFIRM SAFE OPS',
        }, token)
        approveRequestId = Number(approveRequest.body?.request_id || 0)

        const rejectRequest = await makeRequest('POST', '/api/admin/process-logs/ops/request', {
          action_type: 'rollback',
          route_method: 'POST',
          route_path_pattern: '/api/admin/process-logs/ops/rollback',
          entity_type: 'org',
          entity_id: String(orgId),
          reason: 'Regression rollback rejection path validation',
          request_payload: {
            rollback_sql: 'UPDATE organisations SET updated_at = NOW() WHERE id = :id',
            rollback_params: { id: orgId },
          },
          confirmation_text: 'CONFIRM SAFE OPS',
        }, token)
        rejectRequestId = Number(rejectRequest.body?.request_id || 0)

        const approve = await makeRequest('POST', `/api/admin/process-logs/ops/requests/${approveRequestId}/approve`, {
          confirmation_text: 'CONFIRM SAFE OPS',
        }, scopedPlatformAdmin.token)
        const reject = await makeRequest('POST', `/api/admin/process-logs/ops/requests/${rejectRequestId}/reject`, {
          reason: 'Regression rejection approved by superadmin',
        }, scopedPlatformAdmin.token)

        const requestsAfter = await makeRequest('GET', '/api/admin/process-logs/ops/requests?status=all', null, token)
        const metrics = await makeRequest('GET', '/api/admin/process-logs/ops/metrics', null, token)
        const analytics = await makeRequest('GET', '/api/admin/process-logs/ops/analytics', null, token)
        const snapshots = await makeRequest('GET', `/api/admin/process-logs/ops/requests/${approveRequestId}/snapshots`, null, token)

        return {
          pass: requestListBefore.status === 200 &&
            approveRequest.status === 201 &&
            approveRequestId > 0 &&
            rejectRequest.status === 201 &&
            rejectRequestId > 0 &&
            approve.status === 200 &&
            reject.status === 200 &&
            requestsAfter.status === 200 &&
            Array.isArray(requestsAfter.body?.requests) &&
            requestsAfter.body.requests.some((row) => Number(row?.id || 0) === approveRequestId) &&
            metrics.status === 200 &&
            analytics.status === 200 &&
            snapshots.status === 200 &&
            Array.isArray(snapshots.body?.snapshots),
          details: `requestsBefore=${requestListBefore.status}, createApprove=${approveRequest.status}, createReject=${rejectRequest.status}, approve=${approve.status}, reject=${reject.status}, requestsAfter=${requestsAfter.status}, metrics=${metrics.status}, analytics=${analytics.status}, snapshots=${snapshots.status}`,
        }
      } finally {
        if (approveRequestId) await pool.execute('DELETE FROM process_explorer_ops_snapshots WHERE ops_request_id = ?', [approveRequestId]).catch(() => {})
        if (approveRequestId) await pool.execute('DELETE FROM process_explorer_ops_requests WHERE id = ?', [approveRequestId]).catch(() => {})
        if (rejectRequestId) await pool.execute('DELETE FROM process_explorer_ops_snapshots WHERE ops_request_id = ?', [rejectRequestId]).catch(() => {})
        if (rejectRequestId) await pool.execute('DELETE FROM process_explorer_ops_requests WHERE id = ?', [rejectRequestId]).catch(() => {})
        if (tempPlatformAdminUserId) await pool.execute('DELETE FROM sessions WHERE user_id = ?', [tempPlatformAdminUserId]).catch(() => {})
        if (tempPlatformAdminUserId) await pool.execute('DELETE FROM user_org_access WHERE user_id = ?', [tempPlatformAdminUserId]).catch(() => {})
        if (tempPlatformAdminUserId) await pool.execute('DELETE FROM users WHERE id = ?', [tempPlatformAdminUserId]).catch(() => {})
        if (originalProcessExplorerEnabled != null) {
          await pool.execute('UPDATE organisations SET process_explorer_enabled = ? WHERE id = ?', [originalProcessExplorerEnabled, Number(decodeJwtPayload(token).orgId || 0)]).catch(() => {})
        }
      }
    }
  },
  {
    name: 'Admin copy division routes cover superadmin org preview and execute flow',
    module: 'Admin — Copy Division',
    covers: [
      'GET /api/admin/copy-division/orgs',
      'GET /api/admin/copy-division/categories',
      'POST /api/admin/copy-division/preview',
      'POST /api/admin/copy-division/execute',
    ],
    run: async ({ makeRequest }) => {
      let sourceOrgId = null
      let targetOrgId = null
      let tempPlatformAdminUserId = null
      try {
        const superadmin = await createTemporaryPlatformAdmin(makeRequest)
        tempPlatformAdminUserId = superadmin.userId
        if (superadmin.status !== 200 || !superadmin.token) {
          return { pass: false, details: `superadminLogin=${superadmin.status}` }
        }

        const sourceOrgName = uniqueName('Regression Copy Source')
        const targetOrgName = uniqueName('Regression Copy Target')
        const [sourceInsert] = await pool.execute(
          'INSERT INTO organisations (name, is_active) VALUES (?, 1)',
          [sourceOrgName]
        )
        sourceOrgId = Number(sourceInsert.insertId || 0)
        const [targetInsert] = await pool.execute(
          'INSERT INTO organisations (name, is_active) VALUES (?, 1)',
          [targetOrgName]
        )
        targetOrgId = Number(targetInsert.insertId || 0)

        const orgs = await makeRequest('GET', '/api/admin/copy-division/orgs', null, superadmin.token)
        const categories = await makeRequest('GET', '/api/admin/copy-division/categories', null, superadmin.token)
        const preview = await makeRequest('POST', '/api/admin/copy-division/preview', {
          source_org_id: sourceOrgId,
          categories: ['products'],
        }, superadmin.token)
        const execute = await makeRequest('POST', '/api/admin/copy-division/execute', {
          source_org_id: sourceOrgId,
          target_org_id: targetOrgId,
          categories: ['products'],
          overwrite: false,
        }, superadmin.token)

        const listedOrgs = Array.isArray(orgs.body?.orgs) ? orgs.body.orgs : []
        const categoryRows = Array.isArray(categories.body?.categories) ? categories.body.categories : []
        const productsPreview = preview.body?.preview?.products || {}

        return {
          pass: orgs.status === 200 &&
            listedOrgs.some((row) => Number(row?.id || 0) === sourceOrgId) &&
            listedOrgs.some((row) => Number(row?.id || 0) === targetOrgId) &&
            categories.status === 200 &&
            categoryRows.some((row) => row?.key === 'products') &&
            preview.status === 200 &&
            Object.prototype.hasOwnProperty.call(productsPreview, 'products') &&
            execute.status === 200 &&
            execute.body?.ok === true,
          details: `superadminLogin=${superadmin.status}, orgs=${orgs.status}, categories=${categories.status}, preview=${preview.status}, execute=${execute.status}`,
        }
      } finally {
        if (targetOrgId) await pool.execute(`DELETE FROM audit_logs WHERE entity = 'org_config_copy' AND entity_id = ?`, [targetOrgId]).catch(() => {})
        if (targetOrgId) await pool.execute('DELETE FROM organisations WHERE id = ?', [targetOrgId]).catch(() => {})
        if (sourceOrgId) await pool.execute('DELETE FROM organisations WHERE id = ?', [sourceOrgId]).catch(() => {})
        if (tempPlatformAdminUserId) await pool.execute('DELETE FROM sessions WHERE user_id = ?', [tempPlatformAdminUserId]).catch(() => {})
        if (tempPlatformAdminUserId) await pool.execute('DELETE FROM user_module_permissions WHERE user_id = ?', [tempPlatformAdminUserId]).catch(() => {})
        if (tempPlatformAdminUserId) await pool.execute('DELETE FROM users WHERE id = ?', [tempPlatformAdminUserId]).catch(() => {})
      }
    }
  },
  {
    name: 'Admin EMIR routes cover sender routing and receive lifecycle',
    module: 'Admin — EMIR',
    covers: [
      'POST /api/admin/emir/receive',
      'GET /api/admin/emir/routing-rules',
      'POST /api/admin/emir/routing-rules',
      'PUT /api/admin/emir/routing-rules/:id',
      'DELETE /api/admin/emir/routing-rules/:id',
      'GET /api/admin/emir/sender-rules',
      'POST /api/admin/emir/sender-rules',
      'PUT /api/admin/emir/sender-rules/:id',
      'DELETE /api/admin/emir/sender-rules/:id',
    ],
    run: async ({ makeRequest, token }) => {
      let senderRuleId = null
      let routingRuleId = null
      let emirRequestId = null
      let createdCaseId = null
      let createdConfigId = null
      let restoreConfig = null
      try {
        const auth = decodeJwtPayload(token)
        const orgId = Number(auth.orgId || auth.org_id || 0)
        const userId = Number(auth.userId || auth.user_id || 0)
        if (!orgId || !userId) {
          return { pass: false, details: 'Unable to resolve orgId/userId from auth token.' }
        }

        const trustedSender = `${uniqueName('emir.sender').toLowerCase()}@example.com`
        const [[existingConfig]] = await pool.execute(
          'SELECT * FROM org_emir_config WHERE org_id = ? LIMIT 1',
          [orgId]
        )
        if (existingConfig) {
          restoreConfig = {
            inbound_email: existingConfig.inbound_email,
            sender_whitelist: existingConfig.sender_whitelist,
            ack_template: existingConfig.ack_template,
            enabled: existingConfig.enabled,
          }
          let whitelist = existingConfig.sender_whitelist
          if (typeof whitelist === 'string' && whitelist) {
            try { whitelist = JSON.parse(whitelist) } catch (_) {}
          }
          whitelist = Array.isArray(whitelist) ? whitelist : []
          if (!whitelist.includes(trustedSender)) whitelist.push(trustedSender)
          await pool.execute(
            `UPDATE org_emir_config
             SET inbound_email = ?, sender_whitelist = ?, ack_template = ?, enabled = 1
             WHERE org_id = ?`,
            [
              existingConfig.inbound_email || `emir-${orgId}@example.com`,
              JSON.stringify(whitelist),
              existingConfig.ack_template || 'Regression ACK {{reference}}',
              orgId,
            ]
          )
        } else {
          const [configInsert] = await pool.execute(
            `INSERT INTO org_emir_config (org_id, inbound_email, sender_whitelist, ack_template, enabled)
             VALUES (?, ?, ?, ?, 1)`,
            [orgId, `emir-${orgId}@example.com`, JSON.stringify([trustedSender]), 'Regression ACK {{reference}}']
          )
          createdConfigId = Number(configInsert.insertId || 0)
        }

        const senderList = await makeRequest('GET', '/api/admin/emir/sender-rules', null, token)
        const senderCreate = await makeRequest('POST', '/api/admin/emir/sender-rules', {
          sender_email: trustedSender,
          sender_name: 'Regression Sender',
          is_trusted: true,
          notes: 'Regression sender rule',
        }, token)
        senderRuleId = Number(senderCreate.body?.id || 0)
        const senderUpdate = await makeRequest('PUT', `/api/admin/emir/sender-rules/${senderRuleId}`, {
          sender_email: trustedSender,
          sender_name: 'Regression Sender Updated',
          is_trusted: true,
          notes: 'Regression sender rule updated',
        }, token)

        const routingList = await makeRequest('GET', '/api/admin/emir/routing-rules', null, token)
        const routingCreate = await makeRequest('POST', '/api/admin/emir/routing-rules', {
          rule_name: uniqueName('Regression EMIR Route'),
          match_field: 'from_email',
          match_value: trustedSender,
          route_to_queue: 'Medical',
          route_to_user_id: userId,
          priority: 1,
          is_active: true,
        }, token)
        routingRuleId = Number(routingCreate.body?.id || 0)
        const routingUpdate = await makeRequest('PUT', `/api/admin/emir/routing-rules/${routingRuleId}`, {
          rule_name: uniqueName('Regression EMIR Route Updated'),
          match_field: 'subject',
          match_value: 'Regression Subject',
          route_to_queue: 'General',
          route_to_user_id: userId,
          priority: 2,
          is_active: true,
        }, token)

        const receive = await makeRequest('POST', '/api/admin/emir/receive', {
          from_email: trustedSender,
          subject: 'Regression Subject',
          body: 'Regression EMIR body',
          attachments: [],
        }, token)
        createdCaseId = Number(receive.body?.case_id || 0)
        if (receive.status === 200 && receive.body?.reference_number) {
          const [[requestRow]] = await pool.execute(
            'SELECT id FROM emir_requests WHERE reference_number = ? LIMIT 1',
            [receive.body.reference_number]
          )
          emirRequestId = Number(requestRow?.id || 0)
        }

        const routingDelete = await makeRequest('DELETE', `/api/admin/emir/routing-rules/${routingRuleId}`, null, token)
        const senderDelete = await makeRequest('DELETE', `/api/admin/emir/sender-rules/${senderRuleId}`, null, token)

        return {
          pass: senderList.status === 200 &&
            Array.isArray(senderList.body) &&
            senderCreate.status === 200 &&
            senderRuleId > 0 &&
            senderUpdate.status === 200 &&
            routingList.status === 200 &&
            Array.isArray(routingList.body) &&
            routingCreate.status === 200 &&
            routingRuleId > 0 &&
            routingUpdate.status === 200 &&
            receive.status === 200 &&
            createdCaseId > 0 &&
            routingDelete.status === 200 &&
            senderDelete.status === 200,
          details: `senderList=${senderList.status}, senderCreate=${senderCreate.status}, senderUpdate=${senderUpdate.status}, routingList=${routingList.status}, routingCreate=${routingCreate.status}, routingUpdate=${routingUpdate.status}, receive=${receive.status}, routingDelete=${routingDelete.status}, senderDelete=${senderDelete.status}`,
        }
      } finally {
        if (createdCaseId) await pool.execute('DELETE FROM cases WHERE id = ?', [createdCaseId]).catch(() => {})
        if (emirRequestId) await pool.execute('DELETE FROM emir_audit_log WHERE emir_request_id = ?', [emirRequestId]).catch(() => {})
        if (emirRequestId) await pool.execute('DELETE FROM emir_attachments WHERE emir_request_id = ?', [emirRequestId]).catch(() => {})
        if (emirRequestId) await pool.execute('DELETE FROM emir_requests WHERE id = ?', [emirRequestId]).catch(() => {})
        if (routingRuleId) await pool.execute('DELETE FROM emir_routing_rules WHERE id = ?', [routingRuleId]).catch(() => {})
        if (senderRuleId) await pool.execute('DELETE FROM emir_sender_rules WHERE id = ?', [senderRuleId]).catch(() => {})
        if (createdConfigId) {
          await pool.execute('DELETE FROM org_emir_config WHERE id = ?', [createdConfigId]).catch(() => {})
        } else if (restoreConfig && decodeJwtPayload(token).orgId) {
          await pool.execute(
            `UPDATE org_emir_config
             SET inbound_email = ?, sender_whitelist = ?, ack_template = ?, enabled = ?
             WHERE org_id = ?`,
            [
              restoreConfig.inbound_email,
              restoreConfig.sender_whitelist,
              restoreConfig.ack_template,
              restoreConfig.enabled,
              Number(decodeJwtPayload(token).orgId),
            ]
          ).catch(() => {})
        }
      }
    }
  },
  {
    name: 'Admin DPPR routes cover rule lifecycle and execution flow',
    module: 'Admin — DPPR',
    covers: [
      'GET /api/admin/dppr/domains',
      'GET /api/admin/dppr',
      'POST /api/admin/dppr',
      'GET /api/admin/dppr/:id',
      'PUT /api/admin/dppr/:id',
      'PATCH /api/admin/dppr/:id/toggle',
      'GET /api/admin/dppr/execution-log',
      'POST /api/admin/dppr/run-now',
      'DELETE /api/admin/dppr/:id',
    ],
    run: async ({ makeRequest, token }) => {
      let ruleId = null
      try {
        const domains = await makeRequest('GET', '/api/admin/dppr/domains', null, token)
        const listBefore = await makeRequest('GET', '/api/admin/dppr', null, token)
        const create = await makeRequest('POST', '/api/admin/dppr', {
          rule_name: uniqueName('Regression DPPR'),
          domain: 'reporter_info',
          contact_type: 'all',
          consent_type: 'all',
          action: 'Anonymize',
          retention_days: 180,
          is_active: true,
        }, token)
        ruleId = Number(create.body?.id || 0)
        if (domains.status !== 200 || listBefore.status !== 200 || create.status !== 201 || !ruleId) {
          return {
            pass: false,
            details: `domains=${domains.status}, listBefore=${listBefore.status}, create=${create.status}, ruleId=${ruleId}`,
          }
        }

        const getOne = await makeRequest('GET', `/api/admin/dppr/${ruleId}`, null, token)
        const update = await makeRequest('PUT', `/api/admin/dppr/${ruleId}`, {
          rule_name: uniqueName('Regression DPPR Updated'),
          domain: 'reporter_info',
          contact_type: 'hcp',
          consent_type: 'all',
          action: 'Delete',
          retention_days: 200,
          is_active: true,
        }, token)
        const runNow = await makeRequest('POST', '/api/admin/dppr/run-now', {}, token)
        const executionLog = await makeRequest('GET', '/api/admin/dppr/execution-log', null, token)
        const toggle = await makeRequest('PATCH', `/api/admin/dppr/${ruleId}/toggle`, null, token)
        const del = await makeRequest('DELETE', `/api/admin/dppr/${ruleId}`, null, token)

        return {
          pass: getOne.status === 200 &&
            update.status === 200 &&
            runNow.status === 200 &&
            executionLog.status === 200 &&
            toggle.status === 200 &&
            del.status === 200,
          details: `domains=${domains.status}, listBefore=${listBefore.status}, create=${create.status}, getOne=${getOne.status}, update=${update.status}, runNow=${runNow.status}, executionLog=${executionLog.status}, toggle=${toggle.status}, delete=${del.status}`,
        }
      } finally {
        if (ruleId) {
          await pool.execute('DELETE FROM dppr_rules WHERE id = ?', [ruleId]).catch(() => {})
        }
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
    name: 'Product groups cover CRUD members assignments and resolve',
    module: 'Admin — Products',
    covers: [
      'GET /api/admin/product-group-types',
      'GET /api/admin/product-groups',
      'POST /api/admin/product-groups',
      'PUT /api/admin/product-groups/:id',
      'GET /api/admin/product-groups/:id/members',
      'POST /api/admin/product-groups/:id/members',
      'DELETE /api/admin/product-groups/:id/members/:memberId',
      'GET /api/admin/product-groups/:id/assignments',
      'POST /api/admin/product-groups/:id/assignments',
      'DELETE /api/admin/product-groups/:id/assignments/:assignmentId',
      'GET /api/admin/product-groups/resolve',
    ],
    run: async ({ makeRequest, token }) => {
      let familyId = null
      let productId = null
      let countryAuthId = null
      let groupId = null
      let memberId = null
      let assignmentId = null
      try {
        const typeRes = await makeRequest('GET', '/api/admin/product-group-types', null, token)
        const createFamily = await makeRequest('POST', '/api/admin/product-families', {
          name: uniqueName('Regression Group Family'),
          ingredients: ['group-api'],
          is_active: true,
        }, token)
        familyId = Number(createFamily.body?.id || createFamily.body?.family?.id || 0)
        const createProduct = await makeRequest('POST', '/api/admin/products-full', {
          trade_name: uniqueName('Regression Group Product'),
          family_id: familyId,
          mah: 'Regression MAH',
          dosage: '50mg',
          atc_code: 'RG001',
          authorization_country: 'India',
          is_active: true,
        }, token)
        productId = Number(createProduct.body?.id || createProduct.body?.product?.id || 0)
        const createCountryAuth = await makeRequest('POST', `/api/admin/products/${productId}/country-authorizations`, {
          country: 'India',
          auth_number: uniqueName('RGAUTH'),
          auth_date: '2026-05-01',
          status: 'Active',
        }, token)
        countryAuthId = Number(createCountryAuth.body?.authorization?.id || 0)
        const createGroup = await makeRequest('POST', '/api/admin/product-groups', {
          name: uniqueName('Regression Transmission Group'),
          group_type: 'transmissions',
          description: 'Regression transmission product group',
          is_active: true,
        }, token)
        groupId = Number(createGroup.body?.id || createGroup.body?.group?.id || 0)

        if (typeRes.status !== 200 || createFamily.status !== 201 || !familyId || createProduct.status !== 201 || !productId || createCountryAuth.status !== 201 || !countryAuthId || createGroup.status !== 201 || !groupId) {
          return { pass: false, details: `types=${typeRes.status}, family=${createFamily.status}, product=${createProduct.status}, countryAuth=${createCountryAuth.status}, group=${createGroup.status}` }
        }

        const listGroups = await makeRequest('GET', '/api/admin/product-groups?group_type=transmissions', null, token)
        const updateGroup = await makeRequest('PUT', `/api/admin/product-groups/${groupId}`, {
          name: createGroup.body?.group?.name || createGroup.body?.name || uniqueName('Regression Transmission Group Updated'),
          group_type: 'transmissions',
          description: 'Regression transmission product group updated',
          is_active: true,
        }, token)
        const addFamilyMember = await makeRequest('POST', `/api/admin/product-groups/${groupId}/members`, {
          member_type: 'product_family',
          member_id: familyId,
        }, token)
        const addProductMember = await makeRequest('POST', `/api/admin/product-groups/${groupId}/members`, {
          member_type: 'product',
          member_id: productId,
        }, token)
        memberId = Number(addProductMember.body?.id || 0)
        const addAuthMember = await makeRequest('POST', `/api/admin/product-groups/${groupId}/members`, {
          member_type: 'country_authorization',
          member_id: countryAuthId,
        }, token)
        const membersRes = await makeRequest('GET', `/api/admin/product-groups/${groupId}/members`, null, token)
        const addAssignment = await makeRequest('POST', `/api/admin/product-groups/${groupId}/assignments`, {
          target_type: 'transmission_rule',
          metadata: { label: 'Regression transmission selector' },
        }, token)
        assignmentId = Number(addAssignment.body?.id || 0)
        const assignmentsRes = await makeRequest('GET', `/api/admin/product-groups/${groupId}/assignments`, null, token)
        const resolveRes = await makeRequest('GET', `/api/admin/product-groups/resolve?group_type=transmissions&target_type=transmission_rule&product_id=${productId}&country=India`, null, token)
        const deleteMember = await makeRequest('DELETE', `/api/admin/product-groups/${groupId}/members/${memberId}`, null, token)
        const deleteAssignment = await makeRequest('DELETE', `/api/admin/product-groups/${groupId}/assignments/${assignmentId}`, null, token)

        return {
          pass: listGroups.status === 200 &&
            updateGroup.status === 200 &&
            addFamilyMember.status === 201 &&
            addProductMember.status === 201 &&
            addAuthMember.status === 201 &&
            membersRes.status === 200 &&
            addAssignment.status === 201 &&
            assignmentsRes.status === 200 &&
            Array.isArray(resolveRes.body?.groups) &&
            resolveRes.body.groups.some(group => Number(group.id) === groupId) &&
            deleteMember.status === 200 &&
            deleteAssignment.status === 200,
          details: `list=${listGroups.status}, update=${updateGroup.status}, members=${addFamilyMember.status}/${addProductMember.status}/${addAuthMember.status}, membersList=${membersRes.status}, assignment=${addAssignment.status}, assignmentsList=${assignmentsRes.status}, resolve=${resolveRes.status}, deleteMember=${deleteMember.status}, deleteAssignment=${deleteAssignment.status}`,
        }
      } finally {
        if (groupId) await pool.execute('DELETE FROM product_group_assignments WHERE group_id = ?', [groupId]).catch(() => {})
        if (groupId) await pool.execute('DELETE FROM product_group_members WHERE group_id = ?', [groupId]).catch(() => {})
        if (groupId) await pool.execute('DELETE FROM product_groups WHERE id = ?', [groupId]).catch(() => {})
        if (countryAuthId) await pool.execute('DELETE FROM product_country_authorizations WHERE id = ?', [countryAuthId]).catch(() => {})
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
  {
    name: 'Admin case audit routes cover summary list detail and create',
    module: 'Admin — Case Operations',
    covers: [
      'GET /api/admin/case-audit-trail/cases-summary',
      'GET /api/admin/case-audit-trail',
      'GET /api/admin/case-audit-trail/:caseId',
      'POST /api/admin/case-audit-trail',
    ],
    run: async ({ makeRequest, token }) => {
      let caseId = null
      let auditId = null
      try {
        const site = await getFirstSite(makeRequest, token)
        if (!site?.id) return { pass: false, details: 'No site available for admin case audit test.' }

        const createCase = await makeRequest('POST', '/api/cases', {
          site_id: site.id,
          case_type: 'MI',
          intake_channel: 'manual',
          date_received: '2026-04-25',
        }, token)
        caseId = Number(createCase.body?.id || 0)
        if (createCase.status !== 201 || !caseId) {
          return { pass: false, details: `createCase=${createCase.status}` }
        }

        const createAudit = await makeRequest('POST', '/api/admin/case-audit-trail', {
          case_id: caseId,
          action_type: 'REGRESSION_UPDATE',
          field_name: 'priority',
          old_value: 'normal',
          new_value: 'high',
        }, token)
        auditId = Number(createAudit.body?.id || 0)
        const summaryRes = await makeRequest('GET', `/api/admin/case-audit-trail/cases-summary?search=${caseId}`, null, token)
        const listRes = await makeRequest('GET', `/api/admin/case-audit-trail?case_id=${caseId}`, null, token)
        const detailRes = await makeRequest('GET', `/api/admin/case-audit-trail/${caseId}`, null, token)

        return {
          pass: createAudit.status === 201 &&
            auditId > 0 &&
            summaryRes.status === 200 &&
            Array.isArray(summaryRes.body?.cases) &&
            listRes.status === 200 &&
            Array.isArray(listRes.body?.entries) &&
            listRes.body.entries.some((entry) => Number(entry?.id || 0) === auditId) &&
            detailRes.status === 200 &&
            Array.isArray(detailRes.body?.entries) &&
            detailRes.body.entries.some((entry) => Number(entry?.id || 0) === auditId),
          details: `createAudit=${createAudit.status}, summary=${summaryRes.status}, list=${listRes.status}, detail=${detailRes.status}`,
        }
      } finally {
        if (caseId) await pool.execute('DELETE FROM case_audit_trail WHERE case_id = ?', [caseId]).catch(() => {})
        if (caseId) await pool.execute('DELETE FROM cases WHERE id = ?', [caseId]).catch(() => {})
      }
    }
  },
  {
    name: 'Admin audit trail routes cover list export and CM summaries',
    module: 'Admin — Audit Trail',
    covers: [
      'GET /api/admin/audit-trail',
      'GET /api/admin/audit-trail/export',
      'GET /api/admin/cm-audit-trail',
      'GET /api/admin/cm-audit-trail/entities-summary',
    ],
    run: async ({ makeRequest, token }) => {
      let standardAuditId = null
      let cmAuditId = null
      try {
        const user = await getFirstUser(makeRequest, token)
        if (!user?.id) return { pass: false, details: 'No user available for audit trail test.' }
        const standardEntityId = Math.floor(Date.now() / 1000)
        const cmEntityId = String(standardEntityId + 1)

        const [standardInsert] = await pool.execute(
          `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [user.id, user.name || user.email || 'Regression User', 'REGRESSION_AUDIT', 'contact', standardEntityId, JSON.stringify({ source: 'regression-standard-audit' })]
        )
        standardAuditId = Number(standardInsert.insertId || 0)

        const [cmInsert] = await pool.execute(
          `INSERT INTO audit_logs (user_id, user_name, action, entity, entity_id, details)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [user.id, user.name || user.email || 'Regression User', 'REGRESSION_CM_AUDIT', 'cm_document', cmEntityId, JSON.stringify({ source: 'regression-cm-audit' })]
        )
        cmAuditId = Number(cmInsert.insertId || 0)

        const auditList = await makeRequest('GET', '/api/admin/audit-trail?action=REGRESSION_AUDIT&entity=contact', null, token)
        const auditExport = await makeRequest('GET', '/api/admin/audit-trail/export?action=REGRESSION_AUDIT&entity=contact', null, token)
        const cmList = await makeRequest('GET', `/api/admin/cm-audit-trail?entity=cm_document&entity_id=${encodeURIComponent(cmEntityId)}`, null, token)
        const cmSummary = await makeRequest('GET', '/api/admin/cm-audit-trail/entities-summary?entity=cm_document', null, token)

        return {
          pass: auditList.status === 200 &&
            Array.isArray(auditList.body?.entries) &&
            auditList.body.entries.some((entry) => Number(entry?.id || 0) === standardAuditId) &&
            auditExport.status === 200 &&
            typeof auditExport.body === 'string' &&
            auditExport.body.includes('id,user_id,user_name,action,entity,entity_id,details,created_at') &&
            cmList.status === 200 &&
            Array.isArray(cmList.body?.entries) &&
            cmList.body.entries.some((entry) => Number(entry?.id || 0) === cmAuditId) &&
            cmSummary.status === 200 &&
            Array.isArray(cmSummary.body?.entities) &&
            cmSummary.body.entities.some((entry) => String(entry?.entity || '') === 'cm_document'),
          details: `auditList=${auditList.status}, auditExport=${auditExport.status}, cmList=${cmList.status}, cmSummary=${cmSummary.status}`,
        }
      } finally {
        if (standardAuditId) await pool.execute('DELETE FROM audit_logs WHERE id = ?', [standardAuditId]).catch(() => {})
        if (cmAuditId) await pool.execute('DELETE FROM audit_logs WHERE id = ?', [cmAuditId]).catch(() => {})
      }
    }
  },
  {
    name: 'Admin case export import and transmission routes cover operational flow',
    module: 'Admin — Case Operations',
    covers: [
      'GET /api/admin/cases/export',
      'GET /api/admin/cases/export/e2b',
      'GET /api/admin/cases/export/xlsx',
      'GET /api/admin/cases/export/pdf',
      'POST /api/admin/cases/import/upload',
      'GET /api/admin/cases/import/jobs',
      'GET /api/admin/cases/import/jobs/:id',
      'GET /api/admin/transmission-audit-trail/cases-summary',
    ],
    run: async ({ makeRequest, token }) => {
      let caseId = null
      let importJobId = null
      let firstUserId = null
      try {
        const site = await getFirstSite(makeRequest, token)
        const firstUser = await getFirstUser(makeRequest, token)
        if (!site?.id) return { pass: false, details: 'No site available for admin ops export/import test.' }
        if (!firstUser?.id) return { pass: false, details: 'No user available for admin ops export/import test.' }
        firstUserId = Number(firstUser.id)

        const createCase = await makeRequest('POST', '/api/cases', {
          site_id: site.id,
          case_type: 'AE',
          intake_channel: 'manual',
          date_received: '2026-04-25',
        }, token)
        caseId = Number(createCase.body?.id || 0)
        const orgId = Number(createCase.body?.org_id || 0)
        if (createCase.status !== 201 || !caseId || !orgId) {
          return { pass: false, details: `createCase=${createCase.status}` }
        }

        await pool.execute(
          `INSERT INTO transmission_audit_trail (case_id, user_id, user_name, target_system, payload_summary, status, response_code)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [caseId, firstUserId, firstUser.name || firstUser.email || 'Regression User', 'Argus', 'Regression transmission', 'Sent', '200']
        ).catch(() => {})

        const [jobInsert] = await pool.execute(
          `INSERT INTO case_import_jobs (org_id, filename, status, total_rows, imported_rows, failed_rows, error_log, created_by)
           VALUES (?, ?, 'completed', ?, ?, ?, ?, ?)`,
          [orgId, `regression-${Date.now()}.csv`, 1, 1, 0, JSON.stringify([]), firstUserId]
        ).catch(() => [{ insertId: 0 }])
        importJobId = Number(jobInsert?.insertId || 0)

        const exportCsv = await makeRequest('GET', '/api/admin/cases/export?case_type=AE', null, token)
        const exportE2b = await makeRequest('GET', `/api/admin/cases/export/e2b?case_id=${caseId}`, null, token)
        const exportXlsx = await makeRequest('GET', '/api/admin/cases/export/xlsx?case_type=AE', null, token)
        const exportPdf = await makeRequest('GET', '/api/admin/cases/export/pdf?case_type=AE', null, token)
        const importUpload = await makeRequest('POST', '/api/admin/cases/import/upload', {}, token)
        const importJobs = await makeRequest('GET', '/api/admin/cases/import/jobs', null, token)
        const importJobDetail = importJobId
          ? await makeRequest('GET', `/api/admin/cases/import/jobs/${importJobId}`, null, token)
          : { status: 0, body: null }
        const transmissionSummary = await makeRequest('GET', `/api/admin/transmission-audit-trail/cases-summary?search=${caseId}`, null, token)

        const xlsxPass = exportXlsx.status === 200
          ? String(exportXlsx.headers?.['content-type'] || '').includes('spreadsheetml')
          : exportXlsx.status === 500 && String(exportXlsx.body?.error || '').includes('exceljs')
        const pdfPass = exportPdf.status === 200
          ? String(exportPdf.headers?.['content-type'] || '').includes('application/pdf')
          : exportPdf.status === 500 && String(exportPdf.body?.error || '').includes('pdfkit')

        return {
          pass: exportCsv.status === 200 &&
            String(exportCsv.headers?.['content-type'] || '').includes('text/csv') &&
            exportE2b.status === 200 &&
            String(exportE2b.headers?.['content-type'] || '').includes('application/xml') &&
            xlsxPass &&
            pdfPass &&
            importUpload.status === 400 &&
            importJobs.status === 200 &&
            Array.isArray(importJobs.body?.jobs) &&
            importJobId > 0 &&
            importJobDetail.status === 200 &&
            Number(importJobDetail.body?.job?.id || 0) === importJobId &&
            transmissionSummary.status === 200 &&
            Array.isArray(transmissionSummary.body?.cases),
          details: `csv=${exportCsv.status}, e2b=${exportE2b.status}, xlsx=${exportXlsx.status}, pdf=${exportPdf.status}, importUpload=${importUpload.status}, importJobs=${importJobs.status}, importJobDetail=${importJobDetail.status}, transmissionSummary=${transmissionSummary.status}`,
        }
      } finally {
        if (importJobId) await pool.execute('DELETE FROM case_import_jobs WHERE id = ?', [importJobId]).catch(() => {})
        if (caseId) await pool.execute('DELETE FROM transmission_audit_trail WHERE case_id = ?', [caseId]).catch(() => {})
        if (caseId) await pool.execute('DELETE FROM case_audit_trail WHERE case_id = ?', [caseId]).catch(() => {})
        if (caseId) await pool.execute('DELETE FROM cases WHERE id = ?', [caseId]).catch(() => {})
      }
    }
  },
  {
    name: 'Admin DPPR case override routes cover lifecycle',
    module: 'Admin — DPPR',
    covers: [
      'GET /api/admin/dppr/cases/:caseId/overrides',
      'PUT /api/admin/dppr/cases/:caseId/overrides',
      'DELETE /api/admin/dppr/cases/:caseId/overrides/:domain',
    ],
    run: async ({ makeRequest, token }) => {
      let caseId = null
      try {
        const site = await getFirstSite(makeRequest, token)
        if (!site?.id) return { pass: false, details: 'No site available for DPPR override test.' }

        const createCase = await makeRequest('POST', '/api/cases', {
          site_id: site.id,
          case_type: 'MI',
          intake_channel: 'manual',
          date_received: '2026-04-25',
        }, token)
        caseId = Number(createCase.body?.id || 0)
        if (createCase.status !== 201 || !caseId) {
          return { pass: false, details: `createCase=${createCase.status}` }
        }

        const getBefore = await makeRequest('GET', `/api/admin/dppr/cases/${caseId}/overrides`, null, token)
        const putOverride = await makeRequest('PUT', `/api/admin/dppr/cases/${caseId}/overrides`, {
          domain: 'reporter_info',
          action: 'Delete',
          retention_days: 30,
          override_reason: 'Regression override',
        }, token)
        const getAfter = await makeRequest('GET', `/api/admin/dppr/cases/${caseId}/overrides`, null, token)
        const deleteOverride = await makeRequest('DELETE', `/api/admin/dppr/cases/${caseId}/overrides/reporter_info`, null, token)
        const getFinal = await makeRequest('GET', `/api/admin/dppr/cases/${caseId}/overrides`, null, token)

        return {
          pass: getBefore.status === 200 &&
            Array.isArray(getBefore.body?.overrides) &&
            putOverride.status === 200 &&
            getAfter.status === 200 &&
            Array.isArray(getAfter.body?.overrides) &&
            getAfter.body.overrides.some((row) => String(row?.domain || '') === 'reporter_info') &&
            deleteOverride.status === 200 &&
            getFinal.status === 200 &&
            Array.isArray(getFinal.body?.overrides) &&
            !getFinal.body.overrides.some((row) => String(row?.domain || '') === 'reporter_info'),
          details: `getBefore=${getBefore.status}, putOverride=${putOverride.status}, getAfter=${getAfter.status}, deleteOverride=${deleteOverride.status}, getFinal=${getFinal.status}`,
        }
      } finally {
        if (caseId) await pool.execute('DELETE FROM case_dppr_overrides WHERE case_id = ?', [caseId]).catch(() => {})
        if (caseId) await pool.execute('DELETE FROM case_audit_trail WHERE case_id = ?', [caseId]).catch(() => {})
        if (caseId) await pool.execute('DELETE FROM cases WHERE id = ?', [caseId]).catch(() => {})
      }
    }
  },
]
