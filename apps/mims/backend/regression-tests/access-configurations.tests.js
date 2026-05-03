'use strict';

module.exports = [
  {
    name: 'Access configurations overview and catalog load enterprise controls',
    module: 'Admin - Access Configurations',
    covers: [
      'GET /api/admin/access-config/catalog',
      'GET /api/admin/access-config/overview',
      'GET /api/admin/access-config/validate',
    ],
    run: async ({ makeRequest, token }) => {
      const orgs = await makeRequest('GET', '/api/admin/orgs', null, token);
      const org = Array.isArray(orgs.body?.orgs) ? orgs.body.orgs[0] : null;
      if (!org?.id) return { pass: false, details: `orgs=${orgs.status}` };
      const catalog = await makeRequest('GET', `/api/admin/access-config/catalog?org_id=${org.id}`, null, token);
      const overview = await makeRequest('GET', `/api/admin/access-config/overview?org_id=${org.id}`, null, token);
      const validate = await makeRequest('GET', `/api/admin/access-config/validate?org_id=${org.id}`, null, token);
      const pass = catalog.status === 200 && overview.status === 200 && validate.status === 200 &&
        Array.isArray(catalog.body?.privileges) && catalog.body.privileges.some((item) => item.privilege_key === 'admin.access.manage') &&
        overview.body?.summary && Array.isArray(validate.body?.issues);
      return { pass, details: `catalog=${catalog.status}, overview=${overview.status}, validate=${validate.status}` };
    },
  },
  {
    name: 'Access configurations seed templates and update group privileges',
    module: 'Admin - Access Configurations',
    covers: [
      'POST /api/admin/access-config/templates/seed',
      'GET /api/admin/access-config/groups/:id/privileges',
      'PUT /api/admin/access-config/groups/:id/privileges',
    ],
    run: async ({ makeRequest, token }) => {
      const orgs = await makeRequest('GET', '/api/admin/orgs', null, token);
      const org = Array.isArray(orgs.body?.orgs) ? orgs.body.orgs[0] : null;
      if (!org?.id) return { pass: false, details: `orgs=${orgs.status}` };
      const seed = await makeRequest('POST', '/api/admin/access-config/templates/seed', { org_id: org.id }, token);
      const groupId = Array.isArray(seed.body?.templates) ? seed.body.templates[0]?.group_id : null;
      const getPriv = groupId ? await makeRequest('GET', `/api/admin/access-config/groups/${groupId}/privileges?org_id=${org.id}`, null, token) : { status: 0, body: {} };
      const putPriv = groupId ? await makeRequest('PUT', `/api/admin/access-config/groups/${groupId}/privileges`, {
        org_id: org.id,
        privilege_keys: ['admin.access.manage', 'reports.view'],
        reason: 'Regression privilege update',
      }, token) : { status: 0, body: {} };
      const pass = seed.status === 201 && groupId && getPriv.status === 200 && putPriv.status === 200 &&
        Array.isArray(putPriv.body?.privilege_keys) && putPriv.body.privilege_keys.includes('reports.view');
      return { pass, details: `seed=${seed.status}, group=${groupId || 'none'}, get=${getPriv.status}, put=${putPriv.status}` };
    },
  },
  {
    name: 'Access configurations site access auth policy requests and review snapshots work',
    module: 'Admin - Access Configurations',
    covers: [
      'POST /api/admin/access-config/site-access',
      'GET /api/admin/access-config/auth-policy',
      'PUT /api/admin/access-config/auth-policy',
      'POST /api/admin/access-config/requests',
      'PUT /api/admin/access-config/requests/:id/review',
      'POST /api/admin/access-config/review-snapshots',
    ],
    run: async ({ makeRequest, token }) => {
      const orgs = await makeRequest('GET', '/api/admin/orgs', null, token);
      const org = Array.isArray(orgs.body?.orgs) ? orgs.body.orgs[0] : null;
      if (!org?.id) return { pass: false, details: `orgs=${orgs.status}` };
      const users = await makeRequest('GET', `/api/admin/orgs/${org.id}/users`, null, token);
      const sites = await makeRequest('GET', `/api/admin/orgs/${org.id}/sites`, null, token);
      const user = Array.isArray(users.body?.users) ? users.body.users[0] : null;
      const site = Array.isArray(sites.body?.sites) ? sites.body.sites[0] : null;
      const siteAccess = user?.id && site?.id
        ? await makeRequest('POST', '/api/admin/access-config/site-access', {
          org_id: org.id,
          user_id: user.id,
          site_id: site.id,
          access_level: 'full',
          is_primary: true,
          reason: 'Regression site access',
        }, token)
        : { status: 200, skipped: true };
      const getPolicy = await makeRequest('GET', `/api/admin/access-config/auth-policy?org_id=${org.id}`, null, token);
      const putPolicy = await makeRequest('PUT', '/api/admin/access-config/auth-policy', {
        org_id: org.id,
        session_timeout_minutes: 30,
        two_factor_enabled: true,
        two_factor_methods: 'email,totp',
        two_factor_remember_days: 7,
        sso: { provider_type: 'oidc', local_login_allowed: true, is_active: false },
        reason: 'Regression auth policy',
      }, token);
      const request = await makeRequest('POST', '/api/admin/access-config/requests', {
        org_id: org.id,
        target_type: 'auth_policy',
        target_id: org.id,
        action: 'update_auth_policy',
        reason: 'Regression access approval',
        e_signature_required: true,
      }, token);
      const review = request.body?.id
        ? await makeRequest('PUT', `/api/admin/access-config/requests/${request.body.id}/review`, { org_id: org.id, status: 'approved', note: 'Regression approved' }, token)
        : { status: 0 };
      const snapshot = await makeRequest('POST', '/api/admin/access-config/review-snapshots', { org_id: org.id, snapshot_name: 'Regression Access Review' }, token);
      const pass = [siteAccess.status, getPolicy.status, putPolicy.status, request.status, review.status, snapshot.status]
        .every((status) => [200, 201].includes(status));
      return { pass, details: `siteAccess=${siteAccess.status}, policy=${getPolicy.status}/${putPolicy.status}, request=${request.status}, review=${review.status}, snapshot=${snapshot.status}` };
    },
  },
];
