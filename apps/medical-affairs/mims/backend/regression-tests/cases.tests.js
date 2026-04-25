'use strict';
/**
 * Cases module regression tests
 */
const pool = require('../database/db')
const { uniqueName, getFirstCase } = require('./helpers');

async function getFirstSite(makeRequest, token) {
  const res = await makeRequest('GET', '/api/admin/sites', null, token)
  const sites = Array.isArray(res.body?.sites) ? res.body.sites : []
  return sites[0] || null
}

async function getFirstAssignableUser(makeRequest, token) {
  const res = await makeRequest('GET', '/api/admin/users', null, token)
  const users = Array.isArray(res.body?.users) ? res.body.users : []
  return users[0] || null
}

async function getActivePicklistValue(orgId, fieldType) {
  if (!orgId || !fieldType) return null
  const [rows] = await pool.execute(
    `SELECT p.value
       FROM picklists p
       LEFT JOIN picklist_fields pf ON pf.id = p.field_id
      WHERE p.org_id = ?
        AND p.status = 'Active'
        AND (
          LOWER(TRIM(COALESCE(p.field_type, ''))) = LOWER(TRIM(?))
          OR LOWER(TRIM(COALESCE(pf.legacy_field_type, ''))) = LOWER(TRIM(?))
          OR LOWER(TRIM(REPLACE(COALESCE(pf.name, ''), ' ', '_'))) = LOWER(TRIM(?))
        )
      ORDER BY p.id DESC
      LIMIT 1`,
    [orgId, fieldType, fieldType, fieldType]
  )
  return rows[0]?.value || null
}

async function cleanupCaseArtifacts(caseId) {
  if (!caseId) return
  const deletions = [
    ['DELETE FROM product_country_authorizations WHERE product_id IN (SELECT product_id FROM case_mi WHERE case_id = ?)', [caseId]],
    ['DELETE FROM product_approvals WHERE product_id IN (SELECT product_id FROM case_mi WHERE case_id = ?)', [caseId]],
    ['DELETE FROM case_comments WHERE case_id = ?', [caseId]],
    ['DELETE FROM case_contacts WHERE case_id = ?', [caseId]],
    ['DELETE FROM case_mi_responses WHERE case_id = ?', [caseId]],
    ['DELETE FROM case_mi WHERE case_id = ?', [caseId]],
    ['DELETE FROM case_ae_events WHERE version_id IN (SELECT id FROM case_ae_versions WHERE case_id = ?)', [caseId]],
    ['DELETE FROM case_ae_lab_results WHERE version_id IN (SELECT id FROM case_ae_versions WHERE case_id = ?)', [caseId]],
    ['DELETE FROM case_ae_medical_history WHERE version_id IN (SELECT id FROM case_ae_versions WHERE case_id = ?)', [caseId]],
    ['DELETE FROM case_ae_product_info WHERE version_id IN (SELECT id FROM case_ae_versions WHERE case_id = ?)', [caseId]],
    ['DELETE FROM case_ae_general WHERE version_id IN (SELECT id FROM case_ae_versions WHERE case_id = ?)', [caseId]],
    ['DELETE FROM case_ae_patient_info WHERE version_id IN (SELECT id FROM case_ae_versions WHERE case_id = ?)', [caseId]],
    ['DELETE FROM case_ae_lab_notes WHERE version_id IN (SELECT id FROM case_ae_versions WHERE case_id = ?)', [caseId]],
    ['DELETE FROM case_ae_medical_notes WHERE version_id IN (SELECT id FROM case_ae_versions WHERE case_id = ?)', [caseId]],
    ['DELETE FROM case_ae_flex_fields WHERE version_id IN (SELECT id FROM case_ae_versions WHERE case_id = ?)', [caseId]],
    ['DELETE FROM case_ae_versions WHERE case_id = ?', [caseId]],
    ['DELETE FROM case_ae_transmissions WHERE case_id = ?', [caseId]],
    ['DELETE FROM case_pc_transmissions WHERE case_id = ?', [caseId]],
    ['DELETE FROM case_dynamic_field_values WHERE case_id = ?', [caseId]],
    ['DELETE FROM case_reporter WHERE case_id = ?', [caseId]],
    ['DELETE FROM case_patient WHERE case_id = ?', [caseId]],
    ['DELETE FROM case_ae_intake WHERE case_id = ?', [caseId]],
    ['DELETE FROM case_pc_intake WHERE case_id = ?', [caseId]],
    ['DELETE FROM case_audit_trail WHERE case_id = ?', [caseId]],
    ['DELETE FROM transmission_audit_trail WHERE case_id = ?', [caseId]],
    ['DELETE FROM cases WHERE id = ?', [caseId]],
  ]
  for (const [sql, params] of deletions) {
    await pool.execute(sql, params).catch(() => {})
  }
}

module.exports = [
  {
    name: 'GET /api/cases returns list',
    module: 'Cases',
    covers: ['GET /api/cases'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cases', null, token)
      return { pass: res.status === 200 && Array.isArray(res.body?.cases ?? res.body), details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/cases without auth returns 401',
    module: 'Cases',
    covers: ['GET /api/cases'],
    run: async ({ makeRequest }) => {
      const res = await makeRequest('GET', '/api/cases', null, null)
      return { pass: res.status === 401, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/cases with include_meta returns rows and total',
    module: 'Cases',
    covers: ['GET /api/cases'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cases?include_meta=true&limit=5', null, token)
      return {
        pass: res.status === 200 && Array.isArray(res.body?.rows) && typeof res.body?.total === 'number',
        details: `Status: ${res.status}, total: ${res.body?.total}`,
      }
    }
  },
  {
    name: 'GET /api/cases/my returns list',
    module: 'Cases',
    covers: ['GET /api/cases/my'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cases/my?limit=5', null, token)
      return { pass: res.status === 200 && Array.isArray(res.body), details: `Status: ${res.status}, count: ${res.body?.length}` }
    }
  },
  {
    name: 'GET /api/cases/unassigned returns list',
    module: 'Cases',
    covers: ['GET /api/cases/unassigned'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cases/unassigned?limit=5', null, token)
      return { pass: res.status === 200 && Array.isArray(res.body), details: `Status: ${res.status}, count: ${res.body?.length}` }
    }
  },
  {
    name: 'GET /api/cases/dashboard-summary returns stats payload',
    module: 'Cases',
    covers: ['GET /api/cases/dashboard-summary'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cases/dashboard-summary', null, token)
      return {
        pass: res.status === 200 && typeof res.body?.stats === 'object' && Array.isArray(res.body?.recentCases) && Array.isArray(res.body?.alerts),
        details: `Status: ${res.status}`,
      }
    }
  },
  {
    name: 'GET /api/cases/form-config requires case_type',
    module: 'Cases',
    covers: ['GET /api/cases/form-config'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cases/form-config', null, token)
      return { pass: res.status === 400, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/cases/form-config returns config for MI',
    module: 'Cases',
    covers: ['GET /api/cases/form-config'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cases/form-config?case_type=MI', null, token)
      return {
        pass: res.status === 200 && Array.isArray(res.body?.sections) && res.body.sections.every(section => Array.isArray(section?.fields)),
        details: `Status: ${res.status}, sections: ${res.body?.sections?.length ?? 0}`,
      }
    }
  },
  {
    name: 'GET /api/cases/saved-views returns views payload',
    module: 'Cases',
    covers: ['GET /api/cases/saved-views'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cases/saved-views', null, token)
      return { pass: res.status === 200 && Array.isArray(res.body?.views), details: `Status: ${res.status}` }
    }
  },
  {
    name: 'POST /api/cases/saved-views creates personal view',
    module: 'Cases',
    covers: ['POST /api/cases/saved-views'],
    run: async ({ makeRequest, token }) => {
      const payload = {
        name: uniqueName('Regression View'),
        filters: { status_id: null, search: 'regression' },
        is_shared: false,
      };
      const res = await makeRequest('POST', '/api/cases/saved-views', payload, token)
      const createdId = Number(res.body?.view?.id || 0)
      if (createdId > 0) {
        await makeRequest('DELETE', `/api/cases/saved-views/${createdId}`, null, token)
      }
      return { pass: res.status === 201 && createdId > 0, details: `Status: ${res.status}, id: ${createdId || 'n/a'}` }
    }
  },
  {
    name: 'PUT /api/cases/saved-views/:viewId updates personal view',
    module: 'Cases',
    covers: ['PUT /api/cases/saved-views/:viewId'],
    run: async ({ makeRequest, token }) => {
      const create = await makeRequest('POST', '/api/cases/saved-views', {
        name: uniqueName('Regression View Update'),
        filters: { search: 'before-update' },
        is_shared: false,
      }, token)
      const createdId = Number(create.body?.view?.id || 0)
      if (create.status !== 201 || !createdId) {
        return { pass: false, details: `create status: ${create.status}` }
      }
      const update = await makeRequest('PUT', `/api/cases/saved-views/${createdId}`, {
        name: `${create.body.view.name}-edited`,
        filters: { search: 'after-update' },
        is_shared: false,
      }, token)
      await makeRequest('DELETE', `/api/cases/saved-views/${createdId}`, null, token)
      return {
        pass: update.status === 200 && String(update.body?.view?.name || '').endsWith('-edited'),
        details: `Status: ${update.status}`,
      }
    }
  },
  {
    name: 'DELETE /api/cases/saved-views/:viewId deletes personal view',
    module: 'Cases',
    covers: ['DELETE /api/cases/saved-views/:viewId'],
    run: async ({ makeRequest, token }) => {
      const create = await makeRequest('POST', '/api/cases/saved-views', {
        name: uniqueName('Regression View Delete'),
        filters: { search: 'delete-me' },
        is_shared: false,
      }, token)
      const createdId = Number(create.body?.view?.id || 0)
      if (create.status !== 201 || !createdId) {
        return { pass: false, details: `create status: ${create.status}` }
      }
      const del = await makeRequest('DELETE', `/api/cases/saved-views/${createdId}`, null, token)
      return { pass: del.status === 200, details: `Status: ${del.status}` }
    }
  },
  {
    name: 'POST /api/cases/duplicate-check validates case_type',
    module: 'Cases',
    covers: ['POST /api/cases/duplicate-check'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('POST', '/api/cases/duplicate-check', { case_type: 'bad' }, token)
      return { pass: res.status === 400, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/cases/:id with non-existent ID returns 404',
    module: 'Cases',
    covers: ['GET /api/cases/:id'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/cases/999999999', null, token)
      return { pass: res.status === 404 || res.status === 400, details: `Status: ${res.status}` }
    }
  },
  {
    name: 'GET /api/cases/:id/comments returns rows for sample case or guarded failure for missing case',
    module: 'Cases',
    covers: ['GET /api/cases/:id/comments'],
    run: async ({ makeRequest, token }) => {
      const sample = await getFirstCase(makeRequest, token)
      const targetId = Number(sample?.id || 999999999)
      const res = await makeRequest('GET', `/api/cases/${targetId}/comments`, null, token)
      const pass = sample
        ? (res.status === 200 && Array.isArray(res.body))
        : (res.status === 403 || res.status === 404)
      return { pass, details: `Status: ${res.status}, target: ${targetId}` }
    }
  },
  {
    name: 'GET /api/users returns active users list',
    module: 'Cases',
    covers: ['GET /api/users'],
    run: async ({ makeRequest, token }) => {
      const res = await makeRequest('GET', '/api/users', null, token)
      return { pass: res.status === 200 && Array.isArray(res.body), details: `Status: ${res.status}, count: ${res.body?.length}` }
    }
  },
  {
    name: 'Case core lifecycle covers create detail update assign reassign snapshots and delete',
    module: 'Cases',
    covers: [
      'POST /api/cases',
      'GET /api/cases/:id',
      'PUT /api/cases/:id',
      'POST /api/cases/:id/assign-number',
      'POST /api/cases/:id/reassign',
      'GET /api/cases/:id/duplicates',
      'GET /api/cases/:id/schema-snapshot',
      'GET /api/cases/:id/intake-schema-snapshot',
      'DELETE /api/cases/:id',
    ],
    run: async ({ makeRequest, token }) => {
      let caseId = null
      try {
        const site = await getFirstSite(makeRequest, token)
        const owner = await getFirstAssignableUser(makeRequest, token)
        if (!site?.id) return { pass: false, details: 'No site available for case creation.' }
        if (!owner?.id) return { pass: false, details: 'No user available for case reassignment.' }

        const createRes = await makeRequest('POST', '/api/cases', {
          site_id: site.id,
          case_type: 'MI',
          intake_channel: 'manual',
          date_received: '2026-04-25',
        }, token)
        caseId = Number(createRes.body?.id || 0)
        if (createRes.status !== 201 || !caseId) {
          return { pass: false, details: `create=${createRes.status}` }
        }

        const detailRes = await makeRequest('GET', `/api/cases/${caseId}`, null, token)
        const assignRes = await makeRequest('POST', `/api/cases/${caseId}/assign-number`, {}, token)
        const updateRes = await makeRequest('PUT', `/api/cases/${caseId}`, {
          priority: 'High',
          description: 'Regression case description',
          internal_notes: 'Regression internal note',
          intake_channel: 'email',
        }, token)
        const reassignRes = await makeRequest('POST', `/api/cases/${caseId}/reassign`, {
          new_owner_id: owner.id,
          reason: 'Regression reassignment',
        }, token)
        const duplicatesRes = await makeRequest('GET', `/api/cases/${caseId}/duplicates`, null, token)
        const schemaRes = await makeRequest('GET', `/api/cases/${caseId}/schema-snapshot`, null, token)
        const intakeSchemaRes = await makeRequest('GET', `/api/cases/${caseId}/intake-schema-snapshot`, null, token)
        const deleteRes = await makeRequest('DELETE', `/api/cases/${caseId}`, null, token)

        return {
          pass: detailRes.status === 200 &&
            assignRes.status === 200 &&
            typeof assignRes.body?.case_number === 'string' &&
            updateRes.status === 200 &&
            reassignRes.status === 200 &&
            duplicatesRes.status === 200 &&
            schemaRes.status === 200 &&
            intakeSchemaRes.status === 200 &&
            deleteRes.status === 200,
          details: `create=${createRes.status}, detail=${detailRes.status}, assign=${assignRes.status}, update=${updateRes.status}, reassign=${reassignRes.status}, duplicates=${duplicatesRes.status}, schema=${schemaRes.status}, intakeSchema=${intakeSchemaRes.status}, delete=${deleteRes.status}`,
        }
      } finally {
        await cleanupCaseArtifacts(caseId)
      }
    }
  },
  {
    name: 'Case comments contacts and intake cover lifecycle',
    module: 'Cases',
    covers: [
      'GET /api/cases/:id/comments',
      'POST /api/cases/:id/comments',
      'GET /api/cases/:id/contacts',
      'POST /api/cases/:id/contacts',
      'PUT /api/cases/contacts/:ccId',
      'DELETE /api/cases/contacts/:ccId',
      'GET /api/cases/contacts/search',
      'GET /api/cases/:id/intake',
      'PUT /api/cases/:id/intake',
    ],
    run: async ({ makeRequest, token }) => {
      let caseId = null
      let contactId = null
      try {
        const site = await getFirstSite(makeRequest, token)
        if (!site?.id) return { pass: false, details: 'No site available for case creation.' }

        const createRes = await makeRequest('POST', '/api/cases', {
          site_id: site.id,
          case_type: 'MI',
          intake_channel: 'manual',
          date_received: '2026-04-25',
        }, token)
        caseId = Number(createRes.body?.id || 0)
        const orgId = Number(createRes.body?.org_id || 0)
        if (createRes.status !== 201 || !caseId) {
          return { pass: false, details: `create=${createRes.status}` }
        }

        const reporterType = await getActivePicklistValue(orgId, 'reporter_type')
        if (!reporterType) {
          return { pass: false, details: `No active reporter_type value for org ${orgId || 'n/a'}` }
        }

        const commentsBefore = await makeRequest('GET', `/api/cases/${caseId}/comments`, null, token)
        const commentRes = await makeRequest('POST', `/api/cases/${caseId}/comments`, {
          comment: 'Regression case comment',
        }, token)
        const contactsBefore = await makeRequest('GET', `/api/cases/${caseId}/contacts`, null, token)
        const createContact = await makeRequest('POST', `/api/cases/${caseId}/contacts`, {
          contact_role: 'reporter',
          is_primary: true,
          first_name: 'Regr',
          last_name: 'Contact',
          phone: '9999999999',
          email: 'regression.contact@example.com',
        }, token)
        contactId = Number(createContact.body?.id || 0)
        if (commentsBefore.status !== 200 || commentRes.status !== 201 || contactsBefore.status !== 200 || createContact.status !== 201 || !contactId) {
          return { pass: false, details: `commentsBefore=${commentsBefore.status}, comment=${commentRes.status}, contactsBefore=${contactsBefore.status}, createContact=${createContact.status}` }
        }

        const updateContact = await makeRequest('PUT', `/api/cases/contacts/${contactId}`, {
          phone: '8888888888',
          institution: 'Regression Institution',
        }, token)
        const searchContacts = await makeRequest('GET', '/api/cases/contacts/search?q=re', null, token)
        const intakeBefore = await makeRequest('GET', `/api/cases/${caseId}/intake`, null, token)
        const intakeUpdate = await makeRequest('PUT', `/api/cases/${caseId}/intake`, {
          reporter: {
            first_name: 'Reporter',
            last_name: 'Updated',
            email: 'reporter.updated@example.com',
            phone: '7777777777',
            reporter_type: reporterType,
          },
        }, token)
        const deleteContact = await makeRequest('DELETE', `/api/cases/contacts/${contactId}`, null, token)

        return {
          pass: updateContact.status === 200 &&
            searchContacts.status === 200 &&
            Array.isArray(searchContacts.body) &&
            intakeBefore.status === 200 &&
            intakeUpdate.status === 200 &&
            deleteContact.status === 200,
          details: `commentsBefore=${commentsBefore.status}, comment=${commentRes.status}, contactsBefore=${contactsBefore.status}, createContact=${createContact.status}, updateContact=${updateContact.status}, searchContacts=${searchContacts.status}, intakeBefore=${intakeBefore.status}, intakeUpdate=${intakeUpdate.status}, deleteContact=${deleteContact.status}`,
        }
      } finally {
        await cleanupCaseArtifacts(caseId)
      }
    }
  },
  {
    name: 'Case MI tabs and responses cover lifecycle',
    module: 'Cases',
    covers: [
      'GET /api/cases/:id/mi',
      'POST /api/cases/:id/mi',
      'PUT /api/cases/mi/:miId',
      'DELETE /api/cases/mi/:miId',
      'GET /api/cases/:id/mi-responses',
      'POST /api/cases/:id/mi-responses',
      'PATCH /api/cases/:id/mi-responses/:responseId/discard',
    ],
    run: async ({ makeRequest, token }) => {
      let caseId = null
      let miId = null
      let responseId = null
      try {
        const site = await getFirstSite(makeRequest, token)
        if (!site?.id) return { pass: false, details: 'No site available for case creation.' }

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

        const miBefore = await makeRequest('GET', `/api/cases/${caseId}/mi`, null, token)
        const createMi = await makeRequest('POST', `/api/cases/${caseId}/mi`, {
          mi_category: 'General',
          question_summary: 'Regression MI summary',
          detailed_question: 'Regression detailed question',
          status: 'Open',
        }, token)
        miId = Number(createMi.body?.id || 0)
        if (miBefore.status !== 200 || createMi.status !== 201 || !miId) {
          return { pass: false, details: `miBefore=${miBefore.status}, createMi=${createMi.status}` }
        }

        const updateMi = await makeRequest('PUT', `/api/cases/mi/${miId}`, {
          question_summary: 'Regression MI summary updated',
          status: 'Closed',
        }, token)
        const responsesBefore = await makeRequest('GET', `/api/cases/${caseId}/mi-responses`, null, token)
        const createResponse = await makeRequest('POST', `/api/cases/${caseId}/mi-responses`, {
          mi_tab_id: miId,
          response_text: 'Regression MI response body',
          response_channel: 'Email',
          response_status: 'DRAFT',
        }, token)
        responseId = Number(createResponse.body?.id || 0)
        if (updateMi.status !== 200 || responsesBefore.status !== 200 || createResponse.status !== 201 || !responseId) {
          return { pass: false, details: `updateMi=${updateMi.status}, responsesBefore=${responsesBefore.status}, createResponse=${createResponse.status}` }
        }

        const discardResponse = await makeRequest('PATCH', `/api/cases/${caseId}/mi-responses/${responseId}/discard`, {
          reason: 'Regression discard',
        }, token)
        const deleteMi = await makeRequest('DELETE', `/api/cases/mi/${miId}`, null, token)

        return {
          pass: discardResponse.status === 200 && deleteMi.status === 200,
          details: `miBefore=${miBefore.status}, createMi=${createMi.status}, updateMi=${updateMi.status}, responsesBefore=${responsesBefore.status}, createResponse=${createResponse.status}, discardResponse=${discardResponse.status}, deleteMi=${deleteMi.status}`,
        }
      } finally {
        await cleanupCaseArtifacts(caseId)
      }
    }
  },
  {
    name: 'AE versioned tabs cover lifecycle',
    module: 'Cases',
    covers: [
      'GET /api/cases/:id/ae/versions',
      'POST /api/cases/:id/ae/versions',
      'PUT /api/cases/ae/versions/:versionId/status',
      'GET /api/cases/ae/versions/:versionId/general',
      'PUT /api/cases/ae/versions/:versionId/general',
      'GET /api/cases/ae/versions/:versionId/events',
      'POST /api/cases/ae/versions/:versionId/events',
      'PUT /api/cases/ae/events/:eventId',
      'DELETE /api/cases/ae/events/:eventId',
      'GET /api/cases/ae/versions/:versionId/patient-info',
      'PUT /api/cases/ae/versions/:versionId/patient-info',
      'GET /api/cases/ae/versions/:versionId/lab-results',
      'POST /api/cases/ae/versions/:versionId/lab-results',
      'DELETE /api/cases/ae/lab-results/:labId',
      'GET /api/cases/ae/versions/:versionId/lab-notes',
      'PUT /api/cases/ae/versions/:versionId/lab-notes',
      'GET /api/cases/ae/versions/:versionId/medical-history',
      'POST /api/cases/ae/versions/:versionId/medical-history',
      'DELETE /api/cases/ae/medical-history/:mhId',
      'GET /api/cases/ae/versions/:versionId/medical-notes',
      'PUT /api/cases/ae/versions/:versionId/medical-notes',
      'GET /api/cases/ae/versions/:versionId/product-info',
      'POST /api/cases/ae/versions/:versionId/product-info',
      'DELETE /api/cases/ae/product-info/:piId',
      'GET /api/cases/ae/versions/:versionId/ae-flex-fields',
      'PUT /api/cases/ae/versions/:versionId/ae-flex-fields',
    ],
    run: async ({ makeRequest, token }) => {
      let caseId = null
      try {
        const site = await getFirstSite(makeRequest, token)
        if (!site?.id) return { pass: false, details: 'No site available for AE version lifecycle.' }

        const createCase = await makeRequest('POST', '/api/cases', {
          site_id: site.id,
          case_type: 'AE',
          intake_channel: 'manual',
          date_received: '2026-04-25',
        }, token)
        caseId = Number(createCase.body?.id || 0)
        if (createCase.status !== 201 || !caseId) {
          return { pass: false, details: `createCase=${createCase.status}` }
        }

        const versionsBefore = await makeRequest('GET', `/api/cases/${caseId}/ae/versions`, null, token)
        const createVersion = await makeRequest('POST', `/api/cases/${caseId}/ae/versions`, {}, token)
        const versionId = Number(createVersion.body?.id || 0)
        if (versionsBefore.status !== 200 || createVersion.status !== 201 || !versionId) {
          return { pass: false, details: `versionsBefore=${versionsBefore.status}, createVersion=${createVersion.status}` }
        }

        const statusRes = await makeRequest('PUT', `/api/cases/ae/versions/${versionId}/status`, {
          status: 'In Review',
        }, token)

        const generalBefore = await makeRequest('GET', `/api/cases/ae/versions/${versionId}/general`, null, token)
        const generalUpdate = await makeRequest('PUT', `/api/cases/ae/versions/${versionId}/general`, {
          report_type: 'Initial',
          date_of_onset: '2026-04-20',
          date_of_report: '2026-04-21',
          reporter_awareness_date: '2026-04-22',
          additional_info: 'Regression AE general notes',
        }, token)

        const eventsBefore = await makeRequest('GET', `/api/cases/ae/versions/${versionId}/events`, null, token)
        const createEvent = await makeRequest('POST', `/api/cases/ae/versions/${versionId}/events`, {
          event_description: 'Regression AE event',
          outcome: 'Recovered',
          start_date: '2026-04-20',
          end_date: '2026-04-21',
          is_serious: true,
        }, token)
        const eventId = Number(createEvent.body?.id || 0)
        const updateEvent = await makeRequest('PUT', `/api/cases/ae/events/${eventId}`, {
          outcome: 'Recovering',
          is_hospitalization: true,
        }, token)

        const patientBefore = await makeRequest('GET', `/api/cases/ae/versions/${versionId}/patient-info`, null, token)
        const patientUpdate = await makeRequest('PUT', `/api/cases/ae/versions/${versionId}/patient-info`, {
          age: 42,
          age_unit: 'years',
          sex: 'Female',
          weight_kg: 64,
          height_cm: 170,
          ethnicity: 'Asian',
          pregnant: false,
          additional_info: 'Regression patient info',
        }, token)

        const labBefore = await makeRequest('GET', `/api/cases/ae/versions/${versionId}/lab-results`, null, token)
        const createLab = await makeRequest('POST', `/api/cases/ae/versions/${versionId}/lab-results`, {
          test_name: 'ALT',
          result: '42',
          unit: 'U/L',
          normal_range: '0-56',
          test_date: '2026-04-22',
        }, token)
        const labId = Number(createLab.body?.id || 0)
        const labNotesBefore = await makeRequest('GET', `/api/cases/ae/versions/${versionId}/lab-notes`, null, token)
        const labNotesUpdate = await makeRequest('PUT', `/api/cases/ae/versions/${versionId}/lab-notes`, {
          notes: 'Regression AE lab notes',
        }, token)

        const historyBefore = await makeRequest('GET', `/api/cases/ae/versions/${versionId}/medical-history`, null, token)
        const createHistory = await makeRequest('POST', `/api/cases/ae/versions/${versionId}/medical-history`, {
          condition_name: 'Regression condition',
          start_date: '2025-01-01',
          is_ongoing: true,
          notes: 'Regression medical history',
        }, token)
        const historyId = Number(createHistory.body?.id || 0)
        const medicalNotesBefore = await makeRequest('GET', `/api/cases/ae/versions/${versionId}/medical-notes`, null, token)
        const medicalNotesUpdate = await makeRequest('PUT', `/api/cases/ae/versions/${versionId}/medical-notes`, {
          notes: 'Regression AE medical notes',
        }, token)

        const productBefore = await makeRequest('GET', `/api/cases/ae/versions/${versionId}/product-info`, null, token)
        const createProduct = await makeRequest('POST', `/api/cases/ae/versions/${versionId}/product-info`, {
          product_name: 'Regression AE Product',
          dose: '5',
          dose_unit: 'mg',
          route_of_admin: 'Oral',
          frequency: 'Daily',
          start_date: '2026-04-20',
          indication: 'Regression indication',
          is_suspect: true,
        }, token)
        const productId = Number(createProduct.body?.id || 0)

        const flexBefore = await makeRequest('GET', `/api/cases/ae/versions/${versionId}/ae-flex-fields`, null, token)
        const flexUpdate = await makeRequest('PUT', `/api/cases/ae/versions/${versionId}/ae-flex-fields`, {
          ae_flex_1: 'Flex 1',
          ae_flex_2: 'Flex 2',
          ae_flex_3: 'Flex 3',
        }, token)

        const deleteEvent = await makeRequest('DELETE', `/api/cases/ae/events/${eventId}`, null, token)
        const deleteLab = await makeRequest('DELETE', `/api/cases/ae/lab-results/${labId}`, null, token)
        const deleteHistory = await makeRequest('DELETE', `/api/cases/ae/medical-history/${historyId}`, null, token)
        const deleteProduct = await makeRequest('DELETE', `/api/cases/ae/product-info/${productId}`, null, token)

        return {
          pass: statusRes.status === 200 &&
            generalBefore.status === 200 &&
            generalUpdate.status === 200 &&
            eventsBefore.status === 200 &&
            createEvent.status === 201 &&
            eventId > 0 &&
            updateEvent.status === 200 &&
            patientBefore.status === 200 &&
            patientUpdate.status === 200 &&
            labBefore.status === 200 &&
            createLab.status === 201 &&
            labId > 0 &&
            labNotesBefore.status === 200 &&
            labNotesUpdate.status === 200 &&
            historyBefore.status === 200 &&
            createHistory.status === 201 &&
            historyId > 0 &&
            medicalNotesBefore.status === 200 &&
            medicalNotesUpdate.status === 200 &&
            productBefore.status === 200 &&
            createProduct.status === 201 &&
            productId > 0 &&
            flexBefore.status === 200 &&
            flexUpdate.status === 200 &&
            deleteEvent.status === 200 &&
            deleteLab.status === 200 &&
            deleteHistory.status === 200 &&
            deleteProduct.status === 200,
          details: `versionsBefore=${versionsBefore.status}, createVersion=${createVersion.status}, status=${statusRes.status}, generalBefore=${generalBefore.status}, generalUpdate=${generalUpdate.status}, eventsBefore=${eventsBefore.status}, createEvent=${createEvent.status}, updateEvent=${updateEvent.status}, patientBefore=${patientBefore.status}, patientUpdate=${patientUpdate.status}, labBefore=${labBefore.status}, createLab=${createLab.status}, labNotesBefore=${labNotesBefore.status}, labNotesUpdate=${labNotesUpdate.status}, historyBefore=${historyBefore.status}, createHistory=${createHistory.status}, medicalNotesBefore=${medicalNotesBefore.status}, medicalNotesUpdate=${medicalNotesUpdate.status}, productBefore=${productBefore.status}, createProduct=${createProduct.status}, flexBefore=${flexBefore.status}, flexUpdate=${flexUpdate.status}, deleteEvent=${deleteEvent.status}, deleteLab=${deleteLab.status}, deleteHistory=${deleteHistory.status}, deleteProduct=${deleteProduct.status}`,
        }
      } finally {
        await cleanupCaseArtifacts(caseId)
      }
    }
  },
  {
    name: 'AE and PC transmission routes cover lifecycle',
    module: 'Cases',
    covers: [
      'GET /api/cases/:id/ae-transmissions',
      'POST /api/cases/:id/ae-transmissions',
      'PATCH /api/cases/:id/ae-transmissions/:txId',
      'GET /api/cases/:id/pc-transmissions',
      'POST /api/cases/:id/pc-transmissions',
      'PATCH /api/cases/:id/pc-transmissions/:txId',
    ],
    run: async ({ makeRequest, token }) => {
      let aeCaseId = null
      let pcCaseId = null
      try {
        const site = await getFirstSite(makeRequest, token)
        const owner = await getFirstAssignableUser(makeRequest, token)
        if (!site?.id) return { pass: false, details: 'No site available for case creation.' }
        if (!owner?.id) return { pass: false, details: 'No user available for transmissions.' }

        const createAe = await makeRequest('POST', '/api/cases', {
          site_id: site.id,
          case_type: 'AE',
          intake_channel: 'manual',
          date_received: '2026-04-25',
        }, token)
        aeCaseId = Number(createAe.body?.id || 0)
        const createPc = await makeRequest('POST', '/api/cases', {
          site_id: site.id,
          case_type: 'PC',
          intake_channel: 'manual',
          date_received: '2026-04-25',
        }, token)
        pcCaseId = Number(createPc.body?.id || 0)
        if (createAe.status !== 201 || !aeCaseId || createPc.status !== 201 || !pcCaseId) {
          return { pass: false, details: `createAe=${createAe.status}, createPc=${createPc.status}` }
        }

        const aeBefore = await makeRequest('GET', `/api/cases/${aeCaseId}/ae-transmissions`, null, token)
        const aeCreate = await makeRequest('POST', `/api/cases/${aeCaseId}/ae-transmissions`, {
          assigned_to: owner.id,
          priority: 'standard',
        }, token)
        const aeTxId = Number(aeCreate.body?.id || 0)
        const aePatch = await makeRequest('PATCH', `/api/cases/${aeCaseId}/ae-transmissions/${aeTxId}`, {
          status: 'In Review',
        }, token)

        const pcBefore = await makeRequest('GET', `/api/cases/${pcCaseId}/pc-transmissions`, null, token)
        const pcCreate = await makeRequest('POST', `/api/cases/${pcCaseId}/pc-transmissions`, {
          assigned_to: owner.id,
          priority: 'standard',
        }, token)
        const pcTxId = Number(pcCreate.body?.id || 0)
        const pcPatch = await makeRequest('PATCH', `/api/cases/${pcCaseId}/pc-transmissions/${pcTxId}`, {
          status: 'Under Investigation',
        }, token)

        return {
          pass: aeBefore.status === 200 &&
            aeCreate.status === 201 &&
            !!aeTxId &&
            aePatch.status === 200 &&
            pcBefore.status === 200 &&
            pcCreate.status === 201 &&
            !!pcTxId &&
            pcPatch.status === 200,
          details: `aeBefore=${aeBefore.status}, aeCreate=${aeCreate.status}, aePatch=${aePatch.status}, pcBefore=${pcBefore.status}, pcCreate=${pcCreate.status}, pcPatch=${pcPatch.status}`,
        }
      } finally {
        await cleanupCaseArtifacts(aeCaseId)
        await cleanupCaseArtifacts(pcCaseId)
      }
    }
  },
]
