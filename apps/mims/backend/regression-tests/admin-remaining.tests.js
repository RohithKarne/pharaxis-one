'use strict';
/**
 * Admin remaining regression coverage
 */

const pool = require('../database/db');
const { uniqueName, getFirstCase } = require('./helpers');

function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token || '').split('.');
    if (!payload) return {};
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (_) {
    return {};
  }
}

async function getAdminSiteId(orgId) {
  const [[site]] = await pool.execute(
    `SELECT id FROM sites WHERE org_id = ? AND is_active = 1 ORDER BY is_primary DESC, id ASC LIMIT 1`,
    [orgId]
  );
  if (site?.id) return Number(site.id);

  const [insert] = await pool.execute(
    `INSERT INTO sites (org_id, name, country, is_primary, is_active) VALUES (?, ?, ?, 1, 1)`,
    [orgId, uniqueName('Regression Admin Site'), 'India']
  );
  const siteId = Number(insert.insertId || 0);
  if (siteId) {
    await pool.execute(
      `INSERT INTO site_config (site_id, abbreviation, enable_data_protection, retry_enabled, retry_count, retry_interval_min)
       VALUES (?, ?, 0, 0, 3, 5)
       ON DUPLICATE KEY UPDATE abbreviation = VALUES(abbreviation)`,
      [siteId, 'RGS']
    ).catch(() => {});
  }
  return siteId;
}

module.exports = [
  {
    name: 'Admin regression routes cover run guard history coverage db health and catalog',
    module: 'Admin Remaining',
    covers: [
      'POST /api/admin/regression/run',
      'GET /api/admin/regression/history',
      'GET /api/admin/regression/history/:id',
      'GET /api/admin/regression/db-health',
      'GET /api/admin/regression/api-catalog',
      'GET /api/admin/regression/coverage',
      'GET /api/admin/system-config',
      'POST /api/admin/system-config',
    ],
    run: async ({ makeRequest, token }) => {
      const unauthRun = await makeRequest('POST', '/api/admin/regression/run', null, null);
      const history = await makeRequest('GET', '/api/admin/regression/history', null, token);
      const latestRunId = Number(history.body?.runs?.[0]?.id || 0);
      const historyDetail = latestRunId
        ? await makeRequest('GET', `/api/admin/regression/history/${latestRunId}`, null, token)
        : { status: 0 };
      const dbHealth = await makeRequest('GET', '/api/admin/regression/db-health', null, token);
      const apiCatalog = await makeRequest('GET', '/api/admin/regression/api-catalog', null, token);
      const coverage = await makeRequest('GET', '/api/admin/regression/coverage', null, token);
      const getSystemConfig = await makeRequest('GET', '/api/admin/system-config', null, token);
      const configKey = `regression_admin_key_${Date.now()}`;
      const postSystemConfig = await makeRequest('POST', '/api/admin/system-config', {
        key: configKey,
        value: 'enabled',
      }, token);

      await pool.execute('DELETE FROM system_config WHERE config_key = ?', [configKey]).catch(() => {});

      return {
        pass:
          unauthRun.status === 401 &&
          history.status === 200 &&
          historyDetail.status === 200 &&
          dbHealth.status === 200 &&
          apiCatalog.status === 200 &&
          coverage.status === 200 &&
          getSystemConfig.status === 200 &&
          postSystemConfig.status === 200,
        details: `run401=${unauthRun.status}, history=${history.status}, detail=${historyDetail.status}, db=${dbHealth.status}, catalog=${apiCatalog.status}, coverage=${coverage.status}, systemConfig=${getSystemConfig.status}/${postSystemConfig.status}`,
      };
    },
  },
  {
    name: 'Admin security group routes cover lifecycle membership clone and user update',
    module: 'Admin Remaining',
    covers: [
      'POST /api/admin/users',
      'PUT /api/admin/users/:id',
      'POST /api/admin/security-groups',
      'GET /api/admin/security-groups/:id',
      'PUT /api/admin/security-groups/:id',
      'POST /api/admin/security-groups/:id/users',
      'DELETE /api/admin/security-groups/:id/users/:userId',
      'POST /api/admin/security-groups/:id/clone',
      'DELETE /api/admin/security-groups/:id',
    ],
    run: async ({ makeRequest, token }) => {
      let userId = 0;
      let groupId = 0;
      let cloneId = 0;

      try {
        const createUser = await makeRequest('POST', '/api/admin/users', {
          name: 'Regression Admin Managed User',
          email: `${uniqueName('admin-managed').toLowerCase()}@example.com`,
          password: ['TempAdminManaged', '123'].join('@'),
          role: 'agent',
        }, token);
        userId = Number(createUser.body?.user?.id || 0);

        const createGroup = await makeRequest('POST', '/api/admin/security-groups', {
          name: uniqueName('Regression Security Group'),
          description: 'Created by regression',
          privileges: { inbox: ['read'], cases: ['update'] },
        }, token);
        groupId = Number(createGroup.body?.id || 0);

        const getGroup = groupId
          ? await makeRequest('GET', `/api/admin/security-groups/${groupId}`, null, token)
          : { status: 0 };
        const updateGroup = groupId
          ? await makeRequest('PUT', `/api/admin/security-groups/${groupId}`, {
            name: uniqueName('Regression Security Group Updated'),
            description: 'Updated by regression',
            privileges: { inbox: ['read', 'write'] },
            is_active: true,
          }, token)
          : { status: 0 };
        const addUser = groupId && userId
          ? await makeRequest('POST', `/api/admin/security-groups/${groupId}/users`, {
            user_id: userId,
          }, token)
          : { status: 0 };
        const updateUser = userId
          ? await makeRequest('PUT', `/api/admin/users/${userId}`, {
            role: 'reviewer',
            is_active: true,
          }, token)
          : { status: 0 };
        const removeUser = groupId && userId
          ? await makeRequest('DELETE', `/api/admin/security-groups/${groupId}/users/${userId}`, null, token)
          : { status: 0 };
        const cloneGroup = groupId
          ? await makeRequest('POST', `/api/admin/security-groups/${groupId}/clone`, {}, token)
          : { status: 0, body: {} };
        cloneId = Number(cloneGroup.body?.id || 0);
        const deleteGroup = groupId
          ? await makeRequest('DELETE', `/api/admin/security-groups/${groupId}`, null, token)
          : { status: 0 };

        return {
          pass:
            createUser.status === 201 &&
            createGroup.status === 201 &&
            getGroup.status === 200 &&
            updateGroup.status === 200 &&
            addUser.status === 201 &&
            updateUser.status === 200 &&
            removeUser.status === 200 &&
            cloneGroup.status === 200 &&
            deleteGroup.status === 200,
          details: `user=${createUser.status}/${updateUser.status}, group=${createGroup.status}/${getGroup.status}/${updateGroup.status}/${deleteGroup.status}, membership=${addUser.status}/${removeUser.status}, clone=${cloneGroup.status}`,
        };
      } finally {
        if (cloneId) await pool.execute('DELETE FROM security_group_users WHERE group_id = ?', [cloneId]).catch(() => {});
        if (groupId) await pool.execute('DELETE FROM security_group_users WHERE group_id = ?', [groupId]).catch(() => {});
        if (cloneId) await pool.execute('DELETE FROM security_groups WHERE id = ?', [cloneId]).catch(() => {});
        if (groupId) await pool.execute('DELETE FROM security_groups WHERE id = ?', [groupId]).catch(() => {});
        if (userId) {
          await pool.execute('DELETE FROM security_group_users WHERE user_id = ?', [userId]).catch(() => {});
          await pool.execute('DELETE FROM user_org_access WHERE user_id = ?', [userId]).catch(() => {});
          await pool.execute('DELETE FROM user_module_permissions WHERE user_id = ?', [userId]).catch(() => {});
          await pool.execute('DELETE FROM users WHERE id = ?', [userId]).catch(() => {});
        }
      }
    },
  },
  {
    name: 'Admin site workflow routes cover state activity trigger and site tab flows',
    module: 'Admin Remaining',
    covers: [
      'POST /api/admin/site-config/test-smtp',
      'GET /api/admin/workflow-states-extended',
      'POST /api/admin/workflow-states',
      'PUT /api/admin/workflow-states/:id',
      'GET /api/admin/workflow-activities',
      'POST /api/admin/workflow-activities',
      'PUT /api/admin/workflow-activities/:id',
      'GET /api/admin/workflow-activity-triggers',
      'POST /api/admin/workflow-activity-triggers',
      'PUT /api/admin/workflow-activity-triggers/:id',
      'DELETE /api/admin/workflow-activity-triggers/:id',
      'GET /api/admin/sites/:id/email-accounts',
      'POST /api/admin/sites/:id/email-accounts',
      'DELETE /api/admin/sites/:id/email-accounts/:accountId',
      'GET /api/admin/sites/:id/response-template',
      'PUT /api/admin/sites/:id/response-template',
      'GET /api/admin/sites/:id/data-retention',
      'PUT /api/admin/sites/:id/data-retention',
      'GET /api/admin/sites/:id/email-purpose',
      'PUT /api/admin/sites/:id/email-purpose',
      'GET /api/admin/sites/:id/alerts',
      'POST /api/admin/sites/:id/alerts',
      'PUT /api/admin/sites/:id/alerts/:alertId',
      'DELETE /api/admin/sites/:id/alerts/:alertId',
    ],
    run: async ({ makeRequest, token }) => {
      const auth = decodeJwtPayload(token);
      const orgId = Number(auth.orgId || 0);
      let siteId = 0;
      let workflowStateId = 0;
      let activityId = 0;
      let triggerId = 0;
      let siteEmailAccountId = 0;
      let siteAlertId = 0;
      let emailAccountId = 0;

      try {
        if (!orgId) {
          return { pass: false, details: 'Missing orgId in token.' };
        }
        siteId = await getAdminSiteId(orgId);
        if (!siteId) {
          return { pass: false, details: 'No site available for admin routes.' };
        }

        const smtp = await makeRequest('POST', '/api/admin/site-config/test-smtp', {
          host: '127.0.0.1',
          port: 1,
          secure: false,
        }, token);

        const statesExtended = await makeRequest('GET', '/api/admin/workflow-states-extended', null, token);
        const createState = await makeRequest('POST', '/api/admin/workflow-states', {
          name: uniqueName('Regression Workflow State'),
        }, token);
        workflowStateId = Number(createState.body?.id || 0);
        const updateState = workflowStateId
          ? await makeRequest('PUT', `/api/admin/workflow-states/${workflowStateId}`, {
            name: uniqueName('Regression Workflow State Updated'),
            is_active: true,
          }, token)
          : { status: 0 };

        const activities = await makeRequest('GET', '/api/admin/workflow-activities', null, token);
        const createActivity = await makeRequest('POST', '/api/admin/workflow-activities', {
          name: uniqueName('Regression Workflow Activity'),
          description: 'Created by regression',
        }, token);
        activityId = Number(createActivity.body?.activity?.id || 0);
        const updateActivity = activityId
          ? await makeRequest('PUT', `/api/admin/workflow-activities/${activityId}`, {
            name: uniqueName('Regression Workflow Activity Updated'),
            description: 'Updated by regression',
            is_active: true,
          }, token)
          : { status: 0 };
        const triggers = await makeRequest('GET', '/api/admin/workflow-activity-triggers', null, token);
        const createTrigger = activityId && workflowStateId
          ? await makeRequest('POST', '/api/admin/workflow-activity-triggers', {
            activity_id: activityId,
            trigger_type: 'set_state',
            target_state_id: workflowStateId,
            alert_rule: 'notify-admin',
            assign_to: 'admin',
          }, token)
          : { status: 0, body: {} };
        triggerId = Number(createTrigger.body?.trigger?.id || 0);
        const updateTrigger = triggerId
          ? await makeRequest('PUT', `/api/admin/workflow-activity-triggers/${triggerId}`, {
            activity_id: activityId,
            trigger_type: 'set_state',
            target_state_id: workflowStateId,
            alert_rule: 'notify-reviewer',
            assign_to: 'reviewer',
            is_active: true,
          }, token)
          : { status: 0 };
        const deleteTrigger = triggerId
          ? await makeRequest('DELETE', `/api/admin/workflow-activity-triggers/${triggerId}`, null, token)
          : { status: 0 };

        const siteEmailList = await makeRequest('GET', `/api/admin/sites/${siteId}/email-accounts`, null, token);
        const createSiteEmail = await makeRequest('POST', `/api/admin/sites/${siteId}/email-accounts`, {
          email: `${uniqueName('site-email').toLowerCase()}@example.com`,
          label: 'Regression Site Email',
          case_types: 'ALL',
        }, token);
        siteEmailAccountId = Number(createSiteEmail.body?.emailAccount?.id || 0);
        const deleteSiteEmail = siteEmailAccountId
          ? await makeRequest('DELETE', `/api/admin/sites/${siteId}/email-accounts/${siteEmailAccountId}`, null, token)
          : { status: 0 };

        const responseTemplateGet = await makeRequest('GET', `/api/admin/sites/${siteId}/response-template`, null, token);
        const responseTemplatePut = await makeRequest('PUT', `/api/admin/sites/${siteId}/response-template`, {
          subject: 'Regression response template',
          body_html: '<p>Regression body</p>',
        }, token);

        const retentionGet = await makeRequest('GET', `/api/admin/sites/${siteId}/data-retention`, null, token);
        const retentionPut = await makeRequest('PUT', `/api/admin/sites/${siteId}/data-retention`, {
          retention_days: 365,
          regulation: 'GDPR',
          auto_delete_enabled: false,
          notes: 'Regression rule',
        }, token);

        const [emailAccountInsert] = await pool.execute(
          `INSERT INTO email_accounts (org_id, account_name, mailbox_email, from_email, display_name)
           VALUES (?, ?, ?, ?, ?)`,
          [orgId, uniqueName('Regression Mailbox'), `${uniqueName('mailbox').toLowerCase()}@example.com`, 'from@example.com', 'Regression Mailbox']
        );
        emailAccountId = Number(emailAccountInsert.insertId || 0);
        const emailPurposeGet = await makeRequest('GET', `/api/admin/sites/${siteId}/email-purpose`, null, token);
        const emailPurposePut = await makeRequest('PUT', `/api/admin/sites/${siteId}/email-purpose`, {
          assignments: [{ purpose: 'response', email_account_ids: [emailAccountId] }],
        }, token);

        const alertsGet = await makeRequest('GET', `/api/admin/sites/${siteId}/alerts`, null, token);
        const alertsCreate = await makeRequest('POST', `/api/admin/sites/${siteId}/alerts`, {
          alert_type: 'queue_backlog',
          threshold_value: 10,
          notify_emails: 'regression@example.com',
        }, token);
        siteAlertId = Number(alertsCreate.body?.alert?.id || 0);
        const alertsUpdate = siteAlertId
          ? await makeRequest('PUT', `/api/admin/sites/${siteId}/alerts/${siteAlertId}`, {
            alert_type: 'queue_backlog',
            threshold_value: 20,
            notify_emails: 'updated@example.com',
            is_active: true,
          }, token)
          : { status: 0 };
        const alertsDelete = siteAlertId
          ? await makeRequest('DELETE', `/api/admin/sites/${siteId}/alerts/${siteAlertId}`, null, token)
          : { status: 0 };

        return {
          pass:
            smtp.status === 200 &&
            statesExtended.status === 200 &&
            createState.status === 201 &&
            updateState.status === 200 &&
            activities.status === 200 &&
            createActivity.status === 201 &&
            updateActivity.status === 200 &&
            triggers.status === 200 &&
            createTrigger.status === 201 &&
            updateTrigger.status === 200 &&
            deleteTrigger.status === 200 &&
            siteEmailList.status === 200 &&
            createSiteEmail.status === 201 &&
            deleteSiteEmail.status === 200 &&
            responseTemplateGet.status === 200 &&
            responseTemplatePut.status === 200 &&
            retentionGet.status === 200 &&
            retentionPut.status === 200 &&
            emailPurposeGet.status === 200 &&
            emailPurposePut.status === 200 &&
            alertsGet.status === 200 &&
            alertsCreate.status === 201 &&
            alertsUpdate.status === 200 &&
            alertsDelete.status === 200,
          details: `smtp=${smtp.status}, states=${statesExtended.status}/${createState.status}/${updateState.status}, activities=${activities.status}/${createActivity.status}/${updateActivity.status}, triggers=${triggers.status}/${createTrigger.status}/${updateTrigger.status}/${deleteTrigger.status}, siteEmail=${siteEmailList.status}/${createSiteEmail.status}/${deleteSiteEmail.status}, template=${responseTemplateGet.status}/${responseTemplatePut.status}, retention=${retentionGet.status}/${retentionPut.status}, purpose=${emailPurposeGet.status}/${emailPurposePut.status}, alerts=${alertsGet.status}/${alertsCreate.status}/${alertsUpdate.status}/${alertsDelete.status}`,
        };
      } finally {
        if (siteAlertId) await pool.execute('DELETE FROM site_alerts WHERE id = ?', [siteAlertId]).catch(() => {});
        if (siteEmailAccountId) await pool.execute('DELETE FROM site_email_accounts WHERE id = ?', [siteEmailAccountId]).catch(() => {});
        if (emailAccountId) {
          await pool.execute('DELETE FROM site_email_purpose WHERE email_account_id = ?', [emailAccountId]).catch(() => {});
          await pool.execute('DELETE FROM email_accounts WHERE id = ?', [emailAccountId]).catch(() => {});
        }
        if (siteId) {
          await pool.execute('DELETE FROM site_response_templates WHERE site_id = ?', [siteId]).catch(() => {});
          await pool.execute('DELETE FROM site_data_retention WHERE site_id = ?', [siteId]).catch(() => {});
        }
        if (triggerId) await pool.execute('DELETE FROM workflow_activity_triggers WHERE id = ?', [triggerId]).catch(() => {});
        if (activityId) await pool.execute('DELETE FROM workflow_activities WHERE id = ?', [activityId]).catch(() => {});
        if (workflowStateId) await pool.execute('DELETE FROM workflow_states WHERE id = ?', [workflowStateId]).catch(() => {});
      }
    },
  },
  {
    name: 'Admin operational routes cover logs transmission audit and scheduler state',
    module: 'Admin Remaining',
    covers: [
      'GET /api/admin/response-error-logs',
      'GET /api/admin/service-logs',
      'GET /api/admin/service-logs/aggregation',
      'GET /api/admin/system-activity',
      'GET /api/admin/transmission-audit-trail',
      'GET /api/admin/transmission-audit-trail/:caseId',
      'GET /api/admin/transmission-error-logs',
      'POST /api/admin/transmission-audit-trail',
      'POST /api/admin/transmission-screen-audit',
      'GET /api/admin/transmission-screen-audit',
      'GET /api/admin/scheduler/jobs',
    ],
    run: async ({ makeRequest, token }) => {
      const auth = decodeJwtPayload(token);
      const orgId = Number(auth.orgId || 0);
      const userId = Number(auth.userId || 0);
      const firstCase = await getFirstCase(makeRequest, token);
      const caseId = Number(firstCase?.id || 0);
      if (!orgId || !userId || !caseId) {
        return { pass: false, details: `orgId=${orgId}, userId=${userId}, caseId=${caseId}` };
      }

      let transmissionId = 0;

      try {
        await pool.execute(
          `INSERT INTO response_error_logs (log_id, org_id, case_id, error_type, error_message, details)
           VALUES (?, ?, ?, 'REGRESSION', 'Regression response log', ?)`,
          [uniqueName('response-log'), orgId, caseId, JSON.stringify({ source: 'admin-remaining-regression' })]
        ).catch(() => {});
        await pool.execute(
          `INSERT INTO service_logs (source, service_type, description, details, status)
           VALUES ('Email Accounts', 'IMAP', 'Regression activity', ?, 'success')`,
          [JSON.stringify({ task_name: 'Email Import', total_count: 1, error_count: 0, current_count: 1 })]
        ).catch(() => {});

        const responseErrors = await makeRequest('GET', '/api/admin/response-error-logs?limit=5', null, token);
        const serviceLogs = await makeRequest('GET', '/api/admin/service-logs?page_size=10', null, token);
        const serviceAgg = await makeRequest('GET', '/api/admin/service-logs/aggregation?trend_days=7', null, token);
        const systemActivity = await makeRequest('GET', '/api/admin/system-activity?page_size=10', null, token);
        const createTransmission = await makeRequest('POST', '/api/admin/transmission-audit-trail', {
          case_id: caseId,
          target_system: 'RegressionSystem',
          payload_summary: 'Regression transmission payload',
          status: 'Sent',
          response_code: '200',
        }, token);
        transmissionId = Number(createTransmission.body?.id || 0);
        const transmissionTrail = await makeRequest('GET', `/api/admin/transmission-audit-trail?case_id=${caseId}&limit=10`, null, token);
        const caseTrail = await makeRequest('GET', `/api/admin/transmission-audit-trail/${caseId}`, null, token);
        const transmissionErrors = await makeRequest('GET', '/api/admin/transmission-error-logs?limit=10', null, token);
        const screenAuditPost = await makeRequest('POST', '/api/admin/transmission-screen-audit', {
          action: 'opened-regression-screen',
          context: { source: 'admin-remaining-regression' },
        }, token);
        const screenAuditGet = await makeRequest('GET', '/api/admin/transmission-screen-audit?limit=10', null, token);
        const schedulerJobs = await makeRequest('GET', '/api/admin/scheduler/jobs', null, token);

        return {
          pass:
            responseErrors.status === 200 &&
            serviceLogs.status === 200 &&
            serviceAgg.status === 200 &&
            systemActivity.status === 200 &&
            createTransmission.status === 201 &&
            transmissionTrail.status === 200 &&
            caseTrail.status === 200 &&
            transmissionErrors.status === 200 &&
            screenAuditPost.status === 201 &&
            screenAuditGet.status === 200 &&
            schedulerJobs.status === 200,
          details: `responseErrors=${responseErrors.status}, serviceLogs=${serviceLogs.status}, serviceAgg=${serviceAgg.status}, systemActivity=${systemActivity.status}, transmission=${createTransmission.status}/${transmissionTrail.status}/${caseTrail.status}/${transmissionErrors.status}, screenAudit=${screenAuditPost.status}/${screenAuditGet.status}, scheduler=${schedulerJobs.status}`,
        };
      } finally {
        if (transmissionId) await pool.execute('DELETE FROM transmission_audit_trail WHERE id = ?', [transmissionId]).catch(() => {});
        await pool.execute(
          `DELETE FROM transmission_screen_audit WHERE org_id = ? AND user_id = ? AND action = ?`,
          [orgId, userId, 'opened-regression-screen']
        ).catch(() => {});
        await pool.execute(`DELETE FROM response_error_logs WHERE error_type = 'REGRESSION' AND org_id = ?`, [orgId]).catch(() => {});
        await pool.execute(`DELETE FROM service_logs WHERE description = 'Regression activity'`).catch(() => {});
      }
    },
  },
];
