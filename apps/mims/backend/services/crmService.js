'use strict';

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const pool = require('../database/db');
const { getToken } = require('./oauth2Service');

function parseConfig(rawConfig) {
  if (!rawConfig) return null;
  if (typeof rawConfig === 'string') {
    try {
      return JSON.parse(rawConfig);
    } catch (_error) {
      return null;
    }
  }
  if (typeof rawConfig === 'object') {
    return rawConfig;
  }
  return null;
}

function buildRequest(platform, config, crmPayload) {
  if (platform === 'salesforce') {
    return {
      url: `${config.domain}/services/data/v58.0/sobjects/Case/`,
      body: crmPayload,
    };
  }

  if (platform === 'ms_dynamics') {
    return {
      url: `${config.resourceUrl}/api/data/v9.2/incidents`,
      body: crmPayload,
    };
  }

  if (platform === 'veeva_crm') {
    return {
      url: `${config.domain}/api/${config.apiVersion}/vobjects/case__v`,
      body: crmPayload,
    };
  }

  throw new Error(`Unsupported CRM platform: ${platform}`);
}

function getCrmReference(platform, responseBody, responseHeaders) {
  if (platform === 'salesforce') {
    return responseBody && (responseBody.id || responseBody.Id) ? String(responseBody.id || responseBody.Id) : null;
  }

  if (platform === 'ms_dynamics') {
    const entityId = responseHeaders.get('odata-entityid') || responseHeaders.get('OData-EntityId');
    if (entityId) return entityId;
    if (responseBody && responseBody.incidentid) return String(responseBody.incidentid);
    if (responseBody && responseBody.id) return String(responseBody.id);
    return null;
  }

  if (platform === 'veeva_crm') {
    if (!responseBody) return null;
    if (responseBody.id) return String(responseBody.id);
    if (responseBody.responseDetails && responseBody.responseDetails.id) {
      return String(responseBody.responseDetails.id);
    }
    return null;
  }

  return null;
}

async function logSyncResult(orgId, caseId, platform, status, crmReference, errorMessage, payload) {
  await pool.query(
    `INSERT INTO crm_sync_log
     (org_id, case_id, platform, direction, status, crm_reference, error_message, payload)
     VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?)`,
    [orgId, caseId, platform, status, crmReference || null, errorMessage || null, JSON.stringify(payload || {})]
  );
}

async function syncCaseToCrm(orgId, caseId) {
  const numericCaseId = Number(caseId);
  if (!Number.isFinite(numericCaseId)) {
    throw new Error('Invalid caseId');
  }

  const [caseRows] = await pool.query(
    'SELECT * FROM cases WHERE id = ? AND org_id = ? AND is_deleted = 0 LIMIT 1',
    [numericCaseId, orgId]
  );
  if (!caseRows || caseRows.length === 0) {
    throw new Error('Case not found');
  }
  const caseRecord = caseRows[0];

  const [integrationRows] = await pool.query(
    "SELECT config FROM org_integrations WHERE org_id = ? AND integration_type = 'crm' LIMIT 1",
    [orgId]
  );
  if (!integrationRows || integrationRows.length === 0) {
    throw new Error('CRM integration is not configured for this organisation');
  }

  const config = parseConfig(integrationRows[0].config);
  if (!config) {
    throw new Error('CRM integration config is invalid');
  }

  const platform = config.platform;
  if (!['salesforce', 'ms_dynamics', 'veeva_crm'].includes(platform)) {
    throw new Error('Unsupported CRM platform in configuration');
  }

  const token = await getToken(orgId, platform);
  const crmPayload = { ...caseRecord };
  const request = buildRequest(platform, config, crmPayload);

  let responseBody = null;
  try {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request.body),
    });

    const rawText = await response.text();
    try {
      responseBody = rawText ? JSON.parse(rawText) : null;
    } catch (_error) {
      responseBody = { raw: rawText };
    }

    if (!response.ok) {
      const errorMessage = `CRM sync failed: HTTP ${response.status}`;
      await logSyncResult(orgId, numericCaseId, platform, 'failed', null, errorMessage, {
        request: request.body,
        response: responseBody,
        statusCode: response.status,
      });
      throw new Error(errorMessage);
    }

    const crmReference = getCrmReference(platform, responseBody, response.headers);

    await logSyncResult(orgId, numericCaseId, platform, 'success', crmReference, null, {
      request: request.body,
      response: responseBody,
      statusCode: response.status,
    });

    return { success: true, crmReference };
  } catch (error) {
    if (error && error.message && error.message.startsWith('CRM sync failed: HTTP')) {
      throw error;
    }

    await logSyncResult(orgId, numericCaseId, platform, 'failed', null, error.message, {
      request: request.body,
      response: responseBody,
    });
    throw error;
  }
}

async function testCrmConnection(orgId) {
  try {
    const [integrationRows] = await pool.query(
      "SELECT config FROM org_integrations WHERE org_id = ? AND integration_type = 'crm' LIMIT 1",
      [orgId]
    );

    if (!integrationRows || integrationRows.length === 0) {
      return { success: false, message: 'CRM integration is not configured for this organisation' };
    }

    const config = parseConfig(integrationRows[0].config);
    if (!config || !config.platform) {
      return { success: false, message: 'CRM integration config is invalid' };
    }

    const platform = config.platform;
    if (!['salesforce', 'ms_dynamics', 'veeva_crm'].includes(platform)) {
      return { success: false, message: 'Unsupported CRM platform in configuration' };
    }

    await getToken(orgId, platform);

    return { success: true, platform, message: 'CRM connection successful' };
  } catch (error) {
    return { success: false, message: error.message || 'Failed to connect to CRM' };
  }
}

async function getCrmSyncLog(orgId) {
  const [rows] = await pool.query(
    `SELECT id, org_id, case_id, platform, direction, status, crm_reference, error_message, payload, created_at
     FROM crm_sync_log
     WHERE org_id = ?
     ORDER BY id DESC
     LIMIT 50`,
    [orgId]
  );

  return rows;
}

module.exports = {
  syncCaseToCrm,
  testCrmConnection,
  getCrmSyncLog,
};
