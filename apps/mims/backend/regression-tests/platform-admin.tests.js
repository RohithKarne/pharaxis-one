'use strict';
/**
 * Platform Admin module regression tests
 */

const pool = require('../database/db');
let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (_) {
  bcrypt = require('bcrypt');
}

const { uniqueName } = require('./helpers');

async function loginForToken(makeRequest, email, password) {
  const login = await makeRequest('POST', '/api/auth/login', { email, password }, null);
  if (login.status !== 200) {
    return { status: login.status, token: null, body: login.body };
  }
  if (login.body?.token) {
    return { status: login.status, token: login.body.token, body: login.body };
  }
  if (login.body?.challengeToken) {
    const skip = await makeRequest('POST', '/api/auth/2fa/skip-setup', {
      challengeToken: login.body.challengeToken,
    }, null);
    return { status: skip.status, token: skip.body?.token || null, body: skip.body };
  }
  return { status: login.status, token: null, body: login.body };
}

async function createTemporaryPlatformAdmin(makeRequest) {
  const email = `${uniqueName('regression-platform-admin').toLowerCase()}@example.com`;
  const password = 'TempPlatformAdmin@123';
  const hash = await bcrypt.hash(password, 10);
  const [insert] = await pool.execute(
    `INSERT INTO users (name, email, password, role, is_active, email_verified)
     VALUES (?, ?, ?, 'platform_admin', 1, 1)`,
    ['Regression Platform Admin', email, hash]
  );
  const userId = Number(insert.insertId || 0);
  const login = await loginForToken(makeRequest, email, password);
  return { userId, email, password, token: login.token, status: login.status, body: login.body };
}

async function createDirectUser({ name, role = 'agent' } = {}) {
  const email = `${uniqueName('regression-user').toLowerCase()}@example.com`;
  const password = 'TempUser@123';
  const hash = await bcrypt.hash(password, 10);
  const [insert] = await pool.execute(
    `INSERT INTO users (name, email, password, role, is_active, email_verified)
     VALUES (?, ?, ?, ?, 1, 1)`,
    [name || 'Regression User', email, hash, role]
  );
  return { userId: Number(insert.insertId || 0), email, password };
}

async function getActiveOrgAndSite() {
  const [[org]] = await pool.execute(
    `SELECT id, name, is_active
     FROM organisations
     WHERE is_active = 1
     ORDER BY id ASC
     LIMIT 1`
  );
  if (!org?.id) return { org: null, site: null };

  const [[site]] = await pool.execute(
    `SELECT id, name, is_active
     FROM sites
     WHERE org_id = ? AND is_active = 1
     ORDER BY is_primary DESC, id ASC
     LIMIT 1`,
    [org.id]
  );
  return { org, site: site || null };
}

async function cleanupUser(userId) {
  if (!userId) return;
  await pool.execute('DELETE FROM notifications WHERE user_id = ?', [userId]).catch(() => {});
  await pool.execute('DELETE FROM user_report_access WHERE user_id = ?', [userId]).catch(() => {});
  await pool.execute('DELETE FROM report_access_requests WHERE user_id = ? OR requested_by = ? OR reviewed_by = ?', [userId, userId, userId]).catch(() => {});
  await pool.execute('DELETE FROM user_module_permissions WHERE user_id = ?', [userId]).catch(() => {});
  await pool.execute('DELETE FROM user_org_access WHERE user_id = ?', [userId]).catch(() => {});
  await pool.execute('DELETE FROM user_2fa_backup_codes WHERE user_id = ?', [userId]).catch(() => {});
  await pool.execute('DELETE FROM user_2fa_trusted_devices WHERE user_id = ?', [userId]).catch(() => {});
  await pool.execute('DELETE FROM user_2fa_challenges WHERE user_id = ?', [userId]).catch(() => {});
  await pool.execute('DELETE FROM user_2fa_settings WHERE user_id = ?', [userId]).catch(() => {});
  await pool.execute('DELETE FROM users WHERE id = ?', [userId]).catch(() => {});
}

module.exports = [
  {
    name: 'Platform Admin core routes cover dashboard org config alerts notifications and template flows',
    module: 'Platform Admin',
    covers: [
      'GET /api/admin/platform/dashboard',
      'GET /api/admin/platform/orgs',
      'POST /api/admin/platform/orgs',
      'PUT /api/admin/platform/orgs/:id',
      'POST /api/admin/platform/orgs/:id/sites',
      'PUT /api/admin/platform/sites/:id',
      'GET /api/admin/platform/orgs-for-assignment',
      'GET /api/admin/platform/config',
      'PUT /api/admin/platform/config',
      'POST /api/admin/platform/config/test-email',
      'GET /api/admin/platform/audit',
      'GET /api/admin/platform/login-audit',
      'GET /api/admin/platform/alerts/rules',
      'POST /api/admin/platform/alerts/rules',
      'PUT /api/admin/platform/alerts/rules/:id',
      'DELETE /api/admin/platform/alerts/rules/:id',
      'GET /api/admin/platform/alerts/events',
      'GET /api/admin/platform/notifications',
      'POST /api/admin/platform/notifications/:id/read',
      'DELETE /api/admin/platform/notifications/read',
      'DELETE /api/admin/platform/notifications/:id',
      'GET /api/admin/platform/alert-email-template',
      'PUT /api/admin/platform/alert-email-template',
    ],
    run: async ({ makeRequest }) => {
      let platformAdminUserId = 0;
      let createdOrgId = 0;
      let createdSiteId = 0;
      let alertRuleId = 0;
      let readNotificationId = 0;
      let unreadNotificationId = 0;

      try {
        const platformAdmin = await createTemporaryPlatformAdmin(makeRequest);
        platformAdminUserId = platformAdmin.userId;
        if (platformAdmin.status !== 200 || !platformAdmin.token) {
          return { pass: false, details: `platformAdminLogin=${platformAdmin.status}` };
        }

        const dashboard = await makeRequest('GET', '/api/admin/platform/dashboard', null, platformAdmin.token);
        const orgs = await makeRequest('GET', '/api/admin/platform/orgs', null, platformAdmin.token);
        const createOrg = await makeRequest('POST', '/api/admin/platform/orgs', {
          name: uniqueName('Regression Platform Admin Org'),
        }, platformAdmin.token);
        createdOrgId = Number(createOrg.body?.id || 0);
        const updateOrg = createdOrgId
          ? await makeRequest('PUT', `/api/admin/platform/orgs/${createdOrgId}`, {
            name: `${createOrg.body?.name || 'Regression Org'} Updated`,
            is_active: true,
            session_timeout_minutes: 45,
            two_factor_enabled: false,
            two_factor_methods: 'totp,email',
            two_factor_remember_days: 7,
            process_explorer_enabled: true,
          }, platformAdmin.token)
          : { status: 0 };
        const createSite = createdOrgId
          ? await makeRequest('POST', `/api/admin/platform/orgs/${createdOrgId}/sites`, {
            name: uniqueName('Regression Site'),
            country: 'India',
            is_primary: true,
          }, platformAdmin.token)
          : { status: 0, body: {} };
        createdSiteId = Number(createSite.body?.id || 0);
        const updateSite = createdSiteId
          ? await makeRequest('PUT', `/api/admin/platform/sites/${createdSiteId}`, {
            name: `${createSite.body?.name || 'Regression Site'} Updated`,
            country: 'India',
            is_primary: true,
            is_active: true,
          }, platformAdmin.token)
          : { status: 0 };
        const orgsForAssignment = await makeRequest('GET', '/api/admin/platform/orgs-for-assignment', null, platformAdmin.token);

        const getConfig = await makeRequest('GET', '/api/admin/platform/config', null, platformAdmin.token);
        const putConfig = await makeRequest('PUT', '/api/admin/platform/config', {
          platform_admin_session_timeout_minutes: 35,
          smtp_from_name: 'Regression Platform Admin',
        }, platformAdmin.token);
        const testEmail = await makeRequest('POST', '/api/admin/platform/config/test-email', {
          smtp_host: '127.0.0.1',
          smtp_port: 1,
          smtp_encryption: 'SSL/TLS',
          smtp_username: 'regression-user',
          smtp_password: 'regression-pass',
          smtp_from_email: 'regression@example.com',
          smtp_from_name: 'Regression',
          mode: 'verify',
        }, platformAdmin.token);

        const alertRulesBefore = await makeRequest('GET', '/api/admin/platform/alerts/rules', null, platformAdmin.token);
        const createRule = await makeRequest('POST', '/api/admin/platform/alerts/rules', {
          name: uniqueName('Regression Alert Rule'),
          event_type: uniqueName('regression_alert_event').toLowerCase(),
          severity: 'medium',
          channels: 'email,in_app',
          recipient_emails: 'regression@example.com',
          cooldown_minutes: 5,
          is_active: true,
        }, platformAdmin.token);
        alertRuleId = Number(createRule.body?.id || 0);
        const updateRule = alertRuleId
          ? await makeRequest('PUT', `/api/admin/platform/alerts/rules/${alertRuleId}`, {
            name: uniqueName('Regression Alert Rule Updated'),
            event_type: uniqueName('regression_alert_event_upd').toLowerCase(),
            severity: 'high',
            channels: 'email',
            recipient_emails: 'updated@example.com',
            cooldown_minutes: 10,
            is_active: true,
          }, platformAdmin.token)
          : { status: 0 };

        if (alertRuleId) {
          await pool.execute(
            `INSERT INTO platform_admin_alert_events
             (rule_id, event_type, severity, title, message, metadata, email_status, in_app_status)
             VALUES (?, ?, 'high', ?, ?, ?, 'sent', 'sent')`,
            [
              alertRuleId,
              'regression_event',
              'Regression Alert Event',
              'Created by regression suite',
              JSON.stringify({ source: 'platform-admin-regression' }),
            ]
          ).catch(() => {});
        }
        const alertEvents = await makeRequest('GET', '/api/admin/platform/alerts/events?limit=5', null, platformAdmin.token);

        const [readInsert] = await pool.execute(
          `INSERT INTO notifications (user_id, category, title, message, metadata, is_read, read_at)
           VALUES (?, 'regression', ?, ?, ?, 1, NOW())`,
          [platformAdminUserId, 'Regression Read Notification', 'Cleanup target', JSON.stringify({ source: 'platform-admin-regression' })]
        );
        readNotificationId = Number(readInsert.insertId || 0);
        const [unreadInsert] = await pool.execute(
          `INSERT INTO notifications (user_id, category, title, message, metadata, is_read)
           VALUES (?, 'regression', ?, ?, ?, 0)`,
          [platformAdminUserId, 'Regression Unread Notification', 'Read target', JSON.stringify({ source: 'platform-admin-regression' })]
        );
        unreadNotificationId = Number(unreadInsert.insertId || 0);

        const notifications = await makeRequest('GET', '/api/admin/platform/notifications?limit=10', null, platformAdmin.token);
        const markRead = unreadNotificationId
          ? await makeRequest('POST', `/api/admin/platform/notifications/${unreadNotificationId}/read`, null, platformAdmin.token)
          : { status: 0 };
        const clearRead = await makeRequest('DELETE', '/api/admin/platform/notifications/read', null, platformAdmin.token);

        const [deleteInsert] = await pool.execute(
          `INSERT INTO notifications (user_id, category, title, message, metadata, is_read)
           VALUES (?, 'regression', ?, ?, ?, 0)`,
          [platformAdminUserId, 'Regression Delete Notification', 'Delete target', JSON.stringify({ source: 'platform-admin-regression' })]
        );
        const deleteNotificationId = Number(deleteInsert.insertId || 0);
        const deleteOne = deleteNotificationId
          ? await makeRequest('DELETE', `/api/admin/platform/notifications/${deleteNotificationId}`, null, platformAdmin.token)
          : { status: 0 };

        const alertTemplateGet = await makeRequest('GET', '/api/admin/platform/alert-email-template', null, platformAdmin.token);
        const alertTemplatePut = await makeRequest('PUT', '/api/admin/platform/alert-email-template', {
          subject: 'Regression Subject {{alert_title}}',
          body: 'Regression Body {{message}}',
        }, platformAdmin.token);

        const audit = await makeRequest('GET', '/api/admin/platform/audit?limit=5', null, platformAdmin.token);
        const loginAudit = await makeRequest('GET', '/api/admin/platform/login-audit?limit=5', null, platformAdmin.token);
        const deleteRule = alertRuleId
          ? await makeRequest('DELETE', `/api/admin/platform/alerts/rules/${alertRuleId}`, null, platformAdmin.token)
          : { status: 0 };

        const pass =
          dashboard.status === 200 &&
          orgs.status === 200 &&
          createOrg.status === 201 &&
          updateOrg.status === 200 &&
          createSite.status === 201 &&
          updateSite.status === 200 &&
          orgsForAssignment.status === 200 &&
          getConfig.status === 200 &&
          putConfig.status === 200 &&
          [200, 400].includes(testEmail.status) &&
          alertRulesBefore.status === 200 &&
          createRule.status === 201 &&
          updateRule.status === 200 &&
          alertEvents.status === 200 &&
          notifications.status === 200 &&
          markRead.status === 200 &&
          clearRead.status === 200 &&
          deleteOne.status === 200 &&
          alertTemplateGet.status === 200 &&
          alertTemplatePut.status === 200 &&
          audit.status === 200 &&
          loginAudit.status === 200 &&
          deleteRule.status === 200;

        return {
          pass,
          details: `dashboard=${dashboard.status}, orgs=${orgs.status}, createOrg=${createOrg.status}, updateOrg=${updateOrg.status}, createSite=${createSite.status}, updateSite=${updateSite.status}, config=${getConfig.status}/${putConfig.status}, testEmail=${testEmail.status}, alerts=${alertRulesBefore.status}/${createRule.status}/${updateRule.status}/${deleteRule.status}, alertEvents=${alertEvents.status}, notifications=${notifications.status}/${markRead.status}/${clearRead.status}/${deleteOne.status}, template=${alertTemplateGet.status}/${alertTemplatePut.status}, audit=${audit.status}, loginAudit=${loginAudit.status}`,
        };
      } finally {
        if (alertRuleId) {
          await pool.execute('DELETE FROM platform_admin_alert_events WHERE rule_id = ?', [alertRuleId]).catch(() => {});
          await pool.execute('DELETE FROM platform_admin_alert_rules WHERE id = ?', [alertRuleId]).catch(() => {});
        }
        if (platformAdminUserId) {
          await pool.execute('DELETE FROM notifications WHERE user_id = ?', [platformAdminUserId]).catch(() => {});
        }
        if (createdSiteId) {
          await pool.execute('DELETE FROM sites WHERE id = ?', [createdSiteId]).catch(() => {});
        }
        if (createdOrgId) {
          await pool.execute('DELETE FROM organisations WHERE id = ?', [createdOrgId]).catch(() => {});
        }
        await cleanupUser(platformAdminUserId);
      }
    },
  },
  {
    name: 'Platform Admin user routes cover list lifecycle module assignment and org access',
    module: 'Platform Admin',
    covers: [
      'GET /api/admin/platform/users',
      'GET /api/admin/platform/all-users',
      'POST /api/admin/platform/users/create',
      'PUT /api/admin/platform/users/:id',
      'PUT /api/admin/platform/users/:id/modules',
      'POST /api/admin/platform/users/:id/reset-2fa',
      'POST /api/admin/platform/users/:id/force-password-reset',
      'POST /api/admin/platform/users/:id/unlock',
      'POST /api/admin/platform/users/bulk-action',
      'GET /api/admin/platform/users/:id/org-access',
      'POST /api/admin/platform/users/:id/org-access',
      'PUT /api/admin/platform/users/:id/org-access/:orgId',
      'DELETE /api/admin/platform/users/:id/org-access/:orgId',
    ],
    run: async ({ makeRequest }) => {
      let platformAdminUserId = 0;
      let createdUserId = 0;

      try {
        const platformAdmin = await createTemporaryPlatformAdmin(makeRequest);
        platformAdminUserId = platformAdmin.userId;
        if (platformAdmin.status !== 200 || !platformAdmin.token) {
          return { pass: false, details: `platformAdminLogin=${platformAdmin.status}` };
        }
        const { org, site } = await getActiveOrgAndSite();
        if (!org?.id) {
          return { pass: false, details: 'No active organisation found.' };
        }

        const users = await makeRequest('GET', '/api/admin/platform/users', null, platformAdmin.token);
        const allUsers = await makeRequest('GET', '/api/admin/platform/all-users', null, platformAdmin.token);
        const createUser = await makeRequest('POST', '/api/admin/platform/users/create', {
          name: 'Regression Managed User',
          email: `${uniqueName('managed-user').toLowerCase()}@example.com`,
          role: 'agent',
        }, platformAdmin.token);
        createdUserId = Number(createUser.body?.id || 0);

        const updateUser = createdUserId
          ? await makeRequest('PUT', `/api/admin/platform/users/${createdUserId}`, {
            name: 'Regression Managed User Updated',
            email: `${uniqueName('managed-user-upd').toLowerCase()}@example.com`,
            role: 'reviewer',
            org_id: org.id,
            is_active: true,
          }, platformAdmin.token)
          : { status: 0 };
        const updateModules = createdUserId
          ? await makeRequest('PUT', `/api/admin/platform/users/${createdUserId}/modules`, {
            modules: ['mims_core', 'reports'],
          }, platformAdmin.token)
          : { status: 0 };
        const reset2fa = createdUserId
          ? await makeRequest('POST', `/api/admin/platform/users/${createdUserId}/reset-2fa`, null, platformAdmin.token)
          : { status: 0 };
        const forcePasswordReset = createdUserId
          ? await makeRequest('POST', `/api/admin/platform/users/${createdUserId}/force-password-reset`, null, platformAdmin.token)
          : { status: 0 };
        const unlock = createdUserId
          ? await makeRequest('POST', `/api/admin/platform/users/${createdUserId}/unlock`, null, platformAdmin.token)
          : { status: 0 };
        const orgAccessBefore = createdUserId
          ? await makeRequest('GET', `/api/admin/platform/users/${createdUserId}/org-access`, null, platformAdmin.token)
          : { status: 0 };
        const createOrgAccess = createdUserId
          ? await makeRequest('POST', `/api/admin/platform/users/${createdUserId}/org-access`, {
            org_id: org.id,
            primary_site_id: site?.id || null,
            role_at_org: 'admin',
            site_permission: 'all',
          }, platformAdmin.token)
          : { status: 0 };
        const updateOrgAccess = createdUserId
          ? await makeRequest('PUT', `/api/admin/platform/users/${createdUserId}/org-access/${org.id}`, {
            primary_site_id: site?.id || null,
            role_at_org: 'reviewer',
            site_permission: 'all',
            is_active: true,
          }, platformAdmin.token)
          : { status: 0 };
        const deleteOrgAccess = createdUserId
          ? await makeRequest('DELETE', `/api/admin/platform/users/${createdUserId}/org-access/${org.id}`, null, platformAdmin.token)
          : { status: 0 };
        const bulkAction = createdUserId
          ? await makeRequest('POST', '/api/admin/platform/users/bulk-action', {
            userIds: [createdUserId],
            action: 'force_password_reset',
          }, platformAdmin.token)
          : { status: 0 };

        const pass =
          users.status === 200 &&
          allUsers.status === 200 &&
          createUser.status === 201 &&
          updateUser.status === 200 &&
          updateModules.status === 200 &&
          reset2fa.status === 200 &&
          forcePasswordReset.status === 200 &&
          unlock.status === 200 &&
          orgAccessBefore.status === 200 &&
          createOrgAccess.status === 201 &&
          updateOrgAccess.status === 200 &&
          deleteOrgAccess.status === 200 &&
          bulkAction.status === 200;

        return {
          pass,
          details: `users=${users.status}, allUsers=${allUsers.status}, create=${createUser.status}, update=${updateUser.status}, modules=${updateModules.status}, reset2fa=${reset2fa.status}, forceReset=${forcePasswordReset.status}, unlock=${unlock.status}, orgAccess=${orgAccessBefore.status}/${createOrgAccess.status}/${updateOrgAccess.status}/${deleteOrgAccess.status}, bulk=${bulkAction.status}`,
        };
      } finally {
        await cleanupUser(createdUserId);
        await cleanupUser(platformAdminUserId);
      }
    },
  },
  {
    name: 'Platform Admin report access routes cover org user and request workflows',
    module: 'Platform Admin',
    covers: [
      'GET /api/admin/platform/reports/orgs',
      'GET /api/admin/platform/reports/org/:orgId',
      'PUT /api/admin/platform/reports/org/:orgId',
      'GET /api/admin/platform/reports/org/:orgId/users',
      'PUT /api/admin/platform/reports/org/:orgId/user/:userId',
      'GET /api/admin/platform/reports/requests',
      'PUT /api/admin/platform/reports/requests/:id',
    ],
    run: async ({ makeRequest }) => {
      let platformAdminUserId = 0;
      let targetUserId = 0;
      let requestId = 0;

      try {
        const platformAdmin = await createTemporaryPlatformAdmin(makeRequest);
        platformAdminUserId = platformAdmin.userId;
        if (platformAdmin.status !== 200 || !platformAdmin.token) {
          return { pass: false, details: `platformAdminLogin=${platformAdmin.status}` };
        }

        const { org, site } = await getActiveOrgAndSite();
        if (!org?.id) {
          return { pass: false, details: 'No active organisation found.' };
        }

        const targetUser = await createDirectUser({ name: 'Regression Reports User', role: 'agent' });
        targetUserId = targetUser.userId;
        await pool.execute(
          `INSERT INTO user_org_access (user_id, org_id, primary_site_id, role_at_org, site_permission, is_active, last_accessed_at)
           VALUES (?, ?, ?, 'agent', 'all', 1, NOW())`,
          [targetUserId, org.id, site?.id || null]
        );

        const reportsOrgs = await makeRequest('GET', '/api/admin/platform/reports/orgs', null, platformAdmin.token);
        const reportsByOrg = await makeRequest('GET', `/api/admin/platform/reports/org/${org.id}`, null, platformAdmin.token);
        const updateOrgReport = await makeRequest('PUT', `/api/admin/platform/reports/org/${org.id}`, {
          report_key: 'system-health',
          is_enabled: true,
        }, platformAdmin.token);
        const orgUsers = await makeRequest('GET', `/api/admin/platform/reports/org/${org.id}/users`, null, platformAdmin.token);
        const updateUserReport = await makeRequest('PUT', `/api/admin/platform/reports/org/${org.id}/user/${targetUserId}`, {
          report_key: 'system-health',
          is_enabled: true,
        }, platformAdmin.token);

        const [requestInsert] = await pool.execute(
          `INSERT INTO report_access_requests (org_id, requested_by, user_id, report_key, status)
           VALUES (?, ?, ?, 'system-health', 'pending')`,
          [org.id, platformAdminUserId, targetUserId]
        );
        requestId = Number(requestInsert.insertId || 0);
        const requests = await makeRequest('GET', '/api/admin/platform/reports/requests', null, platformAdmin.token);
        const approveRequest = requestId
          ? await makeRequest('PUT', `/api/admin/platform/reports/requests/${requestId}`, {
            status: 'approved',
            notes: 'Approved by regression suite',
          }, platformAdmin.token)
          : { status: 0 };

        const pass =
          reportsOrgs.status === 200 &&
          reportsByOrg.status === 200 &&
          updateOrgReport.status === 200 &&
          orgUsers.status === 200 &&
          updateUserReport.status === 200 &&
          requests.status === 200 &&
          approveRequest.status === 200;

        return {
          pass,
          details: `orgs=${reportsOrgs.status}, org=${reportsByOrg.status}, orgUpdate=${updateOrgReport.status}, users=${orgUsers.status}, userUpdate=${updateUserReport.status}, requests=${requests.status}, approve=${approveRequest.status}`,
        };
      } finally {
        if (targetUserId) {
          await pool.execute('DELETE FROM user_report_access WHERE user_id = ?', [targetUserId]).catch(() => {});
        }
        if (requestId) {
          await pool.execute('DELETE FROM report_access_requests WHERE id = ?', [requestId]).catch(() => {});
        }
        await pool.execute('DELETE FROM org_report_access WHERE report_key = ?', ['system-health']).catch(() => {});
        await cleanupUser(targetUserId);
        await cleanupUser(platformAdminUserId);
      }
    },
  },
  {
    name: 'Platform Admin integration config routes cover EMIR Vault mapping and poll-now flows',
    module: 'Platform Admin',
    covers: [
      'GET /api/admin/platform/emir-config',
      'POST /api/admin/platform/emir-config',
      'PUT /api/admin/platform/emir-config/:id',
      'DELETE /api/admin/platform/emir-config/:id',
      'GET /api/admin/platform/vault-config',
      'POST /api/admin/platform/vault-config',
      'PUT /api/admin/platform/vault-config/:id',
      'DELETE /api/admin/platform/vault-config/:id',
      'GET /api/admin/platform/vault-query-params/:org_id',
      'POST /api/admin/platform/vault-query-params/:org_id',
      'DELETE /api/admin/platform/vault-query-params/:id',
      'GET /api/admin/platform/vault/poll-now/:org_id',
    ],
    run: async ({ makeRequest }) => {
      let platformAdminUserId = 0;
      let emirConfigId = 0;
      let vaultConfigId = 0;
      let vaultMapId = 0;

      try {
        const platformAdmin = await createTemporaryPlatformAdmin(makeRequest);
        platformAdminUserId = platformAdmin.userId;
        if (platformAdmin.status !== 200 || !platformAdmin.token) {
          return { pass: false, details: `platformAdminLogin=${platformAdmin.status}` };
        }

        const { org } = await getActiveOrgAndSite();
        if (!org?.id) {
          return { pass: false, details: 'No active organisation found.' };
        }

        const listEmir = await makeRequest('GET', '/api/admin/platform/emir-config', null, platformAdmin.token);
        const createEmir = await makeRequest('POST', '/api/admin/platform/emir-config', {
          org_id: org.id,
          inbound_email: `${uniqueName('emir').toLowerCase()}@example.com`,
          sender_whitelist: ['allowed@example.com'],
          ack_template: 'Regression EMIR Ack',
          enabled: true,
        }, platformAdmin.token);
        emirConfigId = Number(createEmir.body?.id || 0);
        const updateEmir = emirConfigId
          ? await makeRequest('PUT', `/api/admin/platform/emir-config/${emirConfigId}`, {
            inbound_email: `${uniqueName('emir-updated').toLowerCase()}@example.com`,
            sender_whitelist: ['updated@example.com'],
            ack_template: 'Updated Regression EMIR Ack',
            enabled: false,
          }, platformAdmin.token)
          : { status: 0 };
        const deleteEmir = emirConfigId
          ? await makeRequest('DELETE', `/api/admin/platform/emir-config/${emirConfigId}`, null, platformAdmin.token)
          : { status: 0 };

        const listVault = await makeRequest('GET', '/api/admin/platform/vault-config', null, platformAdmin.token);
        const createVault = await makeRequest('POST', '/api/admin/platform/vault-config', {
          org_id: org.id,
          vault_domain: 'https://vault.invalid.example',
          vault_username: 'regression',
          vault_password: 'regression',
          vault_api_version: 'v24.1',
          poll_interval_hours: 24,
          enabled: true,
        }, platformAdmin.token);
        vaultConfigId = Number(createVault.body?.id || 0);
        const updateVault = vaultConfigId
          ? await makeRequest('PUT', `/api/admin/platform/vault-config/${vaultConfigId}`, {
            vault_domain: 'https://vault-updated.invalid.example',
            vault_username: 'regression-updated',
            vault_password: 'regression-updated',
            vault_api_version: 'v24.1',
            poll_interval_hours: 12,
            enabled: true,
          }, platformAdmin.token)
          : { status: 0 };

        const getVaultParams = await makeRequest('GET', `/api/admin/platform/vault-query-params/${org.id}`, null, platformAdmin.token);
        const createVaultMap = await makeRequest('POST', `/api/admin/platform/vault-query-params/${org.id}`, {
          vault_type: 'Product Information',
          vault_subtype: 'Response Letter',
          vault_classification: 'Public',
          mims_cm_category: 'FAQ',
        }, platformAdmin.token);
        vaultMapId = Number(createVaultMap.body?.id || 0);
        const pollNow = await makeRequest('GET', `/api/admin/platform/vault/poll-now/${org.id}`, null, platformAdmin.token);
        const deleteVaultMap = vaultMapId
          ? await makeRequest('DELETE', `/api/admin/platform/vault-query-params/${vaultMapId}`, null, platformAdmin.token)
          : { status: 0 };
        const deleteVault = vaultConfigId
          ? await makeRequest('DELETE', `/api/admin/platform/vault-config/${vaultConfigId}`, null, platformAdmin.token)
          : { status: 0 };

        const pass =
          listEmir.status === 200 &&
          createEmir.status === 200 &&
          updateEmir.status === 200 &&
          deleteEmir.status === 200 &&
          listVault.status === 200 &&
          createVault.status === 200 &&
          updateVault.status === 200 &&
          getVaultParams.status === 200 &&
          createVaultMap.status === 200 &&
          pollNow.status === 200 &&
          deleteVaultMap.status === 200 &&
          deleteVault.status === 200;

        return {
          pass,
          details: `emir=${listEmir.status}/${createEmir.status}/${updateEmir.status}/${deleteEmir.status}, vault=${listVault.status}/${createVault.status}/${updateVault.status}/${deleteVault.status}, params=${getVaultParams.status}/${createVaultMap.status}/${deleteVaultMap.status}, poll=${pollNow.status}`,
        };
      } finally {
        if (vaultMapId) {
          await pool.execute('DELETE FROM vault_document_type_map WHERE id = ?', [vaultMapId]).catch(() => {});
        }
        if (vaultConfigId) {
          await pool.execute('DELETE FROM org_vault_config WHERE id = ?', [vaultConfigId]).catch(() => {});
        }
        if (emirConfigId) {
          await pool.execute('DELETE FROM org_emir_config WHERE id = ?', [emirConfigId]).catch(() => {});
        }
        await cleanupUser(platformAdminUserId);
      }
    },
  },
  {
    name: 'Platform Admin EMIR request routes cover request list and audit trail',
    module: 'Platform Admin',
    covers: [
      'GET /api/admin/platform/emir/requests',
      'GET /api/admin/platform/emir/requests/:id/audit',
    ],
    run: async ({ makeRequest }) => {
      let platformAdminUserId = 0;
      let requestId = 0;

      try {
        const platformAdmin = await createTemporaryPlatformAdmin(makeRequest);
        platformAdminUserId = platformAdmin.userId;
        if (platformAdmin.status !== 200 || !platformAdmin.token) {
          return { pass: false, details: `platformAdminLogin=${platformAdmin.status}` };
        }

        const { org } = await getActiveOrgAndSite();
        if (!org?.id) {
          return { pass: false, details: 'No active organisation found.' };
        }

        const [requestInsert] = await pool.execute(
          `INSERT INTO emir_requests (org_id, reference_number, from_email, subject, body_raw, status, received_at)
           VALUES (?, ?, ?, ?, ?, 'received', NOW())`,
          [
            org.id,
            uniqueName('EMIR-REF'),
            'regression.sender@example.com',
            'Regression EMIR Subject',
            'Regression EMIR Body',
          ]
        );
        requestId = Number(requestInsert.insertId || 0);
        if (requestId) {
          await pool.execute(
            `INSERT INTO emir_audit_log (emir_request_id, event_type, event_data, created_at)
             VALUES (?, 'received', ?, NOW())`,
            [requestId, JSON.stringify({ source: 'platform-admin-regression' })]
          ).catch(() => {});
        }

        const list = await makeRequest('GET', '/api/admin/platform/emir/requests', null, platformAdmin.token);
        const audit = requestId
          ? await makeRequest('GET', `/api/admin/platform/emir/requests/${requestId}/audit`, null, platformAdmin.token)
          : { status: 0 };

        return {
          pass: list.status === 200 && audit.status === 200,
          details: `list=${list.status}, audit=${audit.status}`,
        };
      } finally {
        if (requestId) {
          await pool.execute('DELETE FROM emir_audit_log WHERE emir_request_id = ?', [requestId]).catch(() => {});
          await pool.execute('DELETE FROM emir_requests WHERE id = ?', [requestId]).catch(() => {});
        }
        await cleanupUser(platformAdminUserId);
      }
    },
  },
];
