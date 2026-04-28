'use strict';

const pool = require('../database/db');
const { getToken } = require('../services/oauth2Service');

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

function parseConfig(rawConfig) {
  if (!rawConfig) return null;
  if (typeof rawConfig === 'string') {
    try {
      return JSON.parse(rawConfig);
    } catch (_error) {
      return null;
    }
  }
  if (typeof rawConfig === 'object') return rawConfig;
  return null;
}

async function getMirConfig(orgId) {
  const [rows] = await pool.query(
    'SELECT config FROM org_integrations WHERE org_id = ? AND integration_type = ? LIMIT 1',
    [orgId, 'mir']
  );

  if (!rows.length) {
    throw new Error('MIR integration config not found');
  }

  const config = parseConfig(rows[0].config);
  if (!config) {
    throw new Error('Invalid MIR integration config JSON');
  }

  if (!config.endpoint_url) {
    throw new Error('MIR config missing endpoint_url');
  }

  return config;
}

async function buildAuthHeaders(orgId, config) {
  const headers = {};
  const authType = String(config.auth_type || '').toLowerCase();

  if (authType === 'api_key') {
    if (!config.api_key) throw new Error('MIR config missing api_key');
    headers['X-API-Key'] = String(config.api_key);
    return headers;
  }

  if (authType === 'oauth2') {
    const token = await getToken(orgId, 'mir');
    headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  if (authType === 'basic') {
    if (!config.username || !config.password) {
      throw new Error('MIR config missing basic auth username/password');
    }
    const encoded = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    headers.Authorization = `Basic ${encoded}`;
    return headers;
  }

  throw new Error(`Unsupported MIR auth_type: ${config.auth_type || 'undefined'}`);
}

async function insertMirLog({ orgId, caseId, direction = 'outbound', status, mirReference, errorMessage, payload }) {
  await pool.query(
    `INSERT INTO mir_sync_log
      (org_id, case_id, direction, status, mir_reference, error_message, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      orgId,
      caseId || null,
      direction,
      status,
      mirReference || null,
      errorMessage || null,
      payload ? JSON.stringify(payload) : null,
    ]
  );
}

async function sendCaseToMir(orgId, caseId) {
  const numericCaseId = Number(caseId);

  try {
    const [caseRows] = await pool.query(
      'SELECT * FROM cases WHERE id = ? AND org_id = ? AND is_deleted = 0 LIMIT 1',
      [numericCaseId, orgId]
    );

    if (!caseRows.length) {
      throw new Error('Case not found');
    }

    const caseData = caseRows[0];
    const config = await getMirConfig(orgId);
    const authHeaders = await buildAuthHeaders(orgId, config);

    const response = await fetch(config.endpoint_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(caseData),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => '');
      throw new Error(`MIR send failed: HTTP ${response.status}${responseText ? ` - ${responseText}` : ''}`);
    }

    const responseBody = await response.json().catch(() => ({}));
    const mirReference = responseBody.mirReference || responseBody.mir_reference || responseBody.reference || null;

    await insertMirLog({
      orgId,
      caseId: numericCaseId,
      direction: 'outbound',
      status: 'success',
      mirReference,
      payload: caseData,
    });

    return { success: true, mirReference };
  } catch (error) {
    await insertMirLog({
      orgId,
      caseId: Number.isFinite(numericCaseId) ? numericCaseId : null,
      direction: 'outbound',
      status: 'error',
      errorMessage: error.message,
    }).catch(() => null);

    throw error;
  }
}

async function testMirConnection(orgId) {
  try {
    const config = await getMirConfig(orgId);
    const authHeaders = await buildAuthHeaders(orgId, config);

    let response = await fetch(config.endpoint_url, {
      method: 'HEAD',
      headers: authHeaders,
    });

    if (!response.ok) {
      response = await fetch(config.endpoint_url, {
        method: 'GET',
        headers: authHeaders,
      });
    }

    if (!response.ok) {
      return {
        success: false,
        message: `MIR connection failed: HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      message: 'MIR connection successful',
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
    };
  }
}

async function getMirSyncLog(orgId) {
  const [rows] = await pool.query(
    `SELECT *
     FROM mir_sync_log
     WHERE org_id = ?
     ORDER BY created_at DESC
     LIMIT 50`,
    [orgId]
  );

  return rows;
}

module.exports = {
  sendCaseToMir,
  testMirConnection,
  getMirSyncLog,
};
