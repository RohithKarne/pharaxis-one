'use strict';

const pool = require('../database/db');
const { getFirstCase } = require('./helpers');

function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token || '').split('.');
    if (!payload) return {};
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (_) {
    return {};
  }
}

module.exports = [
  {
    name: 'Core routes cover help notifications and client telemetry flows',
    module: 'Platform Remaining',
    covers: [
      'GET /api/help',
      'GET /api/help/search',
      'POST /api/notifications/:id/read',
      'POST /api/notifications/:id/acknowledge',
      'POST /api/notifications/:id/retry',
      'POST /api/notifications/read-all',
      'POST /api/notifications/retry-failed',
      'POST /api/telemetry/client-error',
    ],
    run: async ({ makeRequest, token }) => {
      const auth = decodeJwtPayload(token);
      const userId = Number(auth.userId || 0);
      if (!userId) {
        return { pass: false, details: 'Missing userId in token.' };
      }

      let readId = 0;
      let ackId = 0;
      let retryId = 0;
      let unreadId = 0;

      try {
        const [readInsert] = await pool.execute(
          `INSERT INTO notifications (user_id, category, title, message, is_read)
           VALUES (?, 'regression', 'Regression Read', 'Unread notification', 0)`,
          [userId]
        );
        readId = Number(readInsert.insertId || 0);
        const [ackInsert] = await pool.execute(
          `INSERT INTO notifications (user_id, category, title, message, severity, requires_acknowledgement, is_read)
           VALUES (?, 'regression', 'Regression Ack', 'Ack notification', 'critical', 1, 0)`,
          [userId]
        );
        ackId = Number(ackInsert.insertId || 0);
        const [retryInsert] = await pool.execute(
          `INSERT INTO notifications (user_id, category, title, message, delivery_status, delivery_attempts, max_delivery_attempts, failure_reason, is_read)
           VALUES (?, 'regression', 'Regression Retry', 'Retry notification', 'failed', 1, 3, 'Simulated failure', 0)`,
          [userId]
        );
        retryId = Number(retryInsert.insertId || 0);
        const [unreadInsert] = await pool.execute(
          `INSERT INTO notifications (user_id, category, title, message, is_read)
           VALUES (?, 'regression', 'Regression Read All', 'Bulk read notification', 0)`,
          [userId]
        );
        unreadId = Number(unreadInsert.insertId || 0);

        const help = await makeRequest('GET', '/api/help?feature_key=general&limit=5', null, token);
        const helpSearch = await makeRequest('GET', '/api/help/search?q=ge&limit=5', null, token);
        const read = readId ? await makeRequest('POST', `/api/notifications/${readId}/read`, null, token) : { status: 0 };
        const acknowledge = ackId ? await makeRequest('POST', `/api/notifications/${ackId}/acknowledge`, null, token) : { status: 0 };
        const retry = retryId ? await makeRequest('POST', `/api/notifications/${retryId}/retry`, null, token) : { status: 0 };
        const readAll = await makeRequest('POST', '/api/notifications/read-all', null, token);
        const retryFailed = await makeRequest('POST', '/api/notifications/retry-failed', { limit: 10 }, token);
        const telemetry = await makeRequest('POST', '/api/telemetry/client-error', {
          message: 'Regression client error',
          location: '/mims/regression',
          stack: 'Regression stack trace',
          app: 'mims',
          severity: 'error',
        }, null);

        return {
          pass:
            help.status === 200 &&
            helpSearch.status === 200 &&
            read.status === 200 &&
            acknowledge.status === 200 &&
            retry.status === 200 &&
            readAll.status === 200 &&
            retryFailed.status === 200 &&
            telemetry.status === 202,
          details: `help=${help.status}/${helpSearch.status}, notifications=${read.status}/${acknowledge.status}/${retry.status}/${readAll.status}/${retryFailed.status}, telemetry=${telemetry.status}`,
        };
      } finally {
        const ids = [readId, ackId, retryId, unreadId].filter(Boolean);
        if (ids.length) {
          await pool.execute(
            `DELETE FROM notifications WHERE id IN (${ids.map(() => '?').join(',')})`,
            ids
          ).catch(() => {});
        }
      }
    },
  },
  {
    name: 'Admin vault routes cover handled failure responses with temporary invalid config',
    module: 'Platform Remaining',
    covers: [
      'GET /api/admin/vault/documents',
      'GET /api/admin/vault/search',
      'POST /api/admin/vault/pull',
      'POST /api/admin/vault/ingest',
    ],
    run: async ({ makeRequest, token }) => {
      const auth = decodeJwtPayload(token);
      const orgId = Number(auth.orgId || 0);
      if (!orgId) {
        return { pass: false, details: 'Missing orgId in token.' };
      }

      const firstCase = await getFirstCase(makeRequest, token);
      const caseId = Number(firstCase?.id || 0);
      if (!caseId) {
        return { pass: false, details: 'No case available for vault pull test.' };
      }

      const [[existing]] = await pool.execute('SELECT * FROM org_vault_config WHERE org_id = ? LIMIT 1', [orgId]).catch(() => [[null]]);

      try {
        await pool.execute(
          `INSERT INTO org_vault_config (org_id, vault_domain, vault_username, vault_password, vault_api_version, poll_interval_hours, enabled)
           VALUES (?, ?, ?, ?, 'v24.1', 12, 1)
           ON DUPLICATE KEY UPDATE
             vault_domain = VALUES(vault_domain),
             vault_username = VALUES(vault_username),
             vault_password = VALUES(vault_password),
             vault_api_version = VALUES(vault_api_version),
             poll_interval_hours = VALUES(poll_interval_hours),
             enabled = VALUES(enabled)`,
          [orgId, 'http://127.0.0.1:1', 'regression', 'regression']
        );

        const documents = await makeRequest('GET', '/api/admin/vault/documents', null, token);
        const search = await makeRequest('GET', '/api/admin/vault/search?query_key=approved_documents', null, token);
        const pull = await makeRequest('POST', '/api/admin/vault/pull', {
          vault_doc_id: 'REGRESSION-DOC-1',
          case_id: caseId,
        }, token);
        const ingest = await makeRequest('POST', '/api/admin/vault/ingest', {
          vault_doc_id: 'REGRESSION-DOC-2',
        }, token);

        return {
          pass:
            documents.status === 500 &&
            search.status === 500 &&
            pull.status === 500 &&
            ingest.status === 500,
          details: `documents=${documents.status}, search=${search.status}, pull=${pull.status}, ingest=${ingest.status}`,
        };
      } finally {
        await pool.execute('DELETE FROM case_vault_references WHERE org_id = ? AND vault_doc_id IN (?, ?)', [orgId, 'REGRESSION-DOC-1', 'REGRESSION-DOC-2']).catch(() => {});
        if (existing?.id) {
          await pool.execute(
            `UPDATE org_vault_config
             SET vault_domain = ?, vault_username = ?, vault_password = ?, vault_api_version = ?, poll_interval_hours = ?, enabled = ?, last_poll_at = ?
             WHERE id = ?`,
            [
              existing.vault_domain,
              existing.vault_username,
              existing.vault_password,
              existing.vault_api_version,
              existing.poll_interval_hours,
              existing.enabled,
              existing.last_poll_at || null,
              existing.id,
            ]
          ).catch(() => {});
        } else {
          await pool.execute('DELETE FROM org_vault_config WHERE org_id = ?', [orgId]).catch(() => {});
        }
      }
    },
  },
  {
    name: 'Platform Admin logo route rejects unauthenticated upload attempts',
    module: 'Platform Remaining',
    covers: ['POST /api/admin/platform/orgs/:orgId/logo'],
    run: async ({ makeRequest }) => {
      const res = await makeRequest('POST', '/api/admin/platform/orgs/1/logo', null, null);
      return {
        pass: res.status === 401,
        details: `status=${res.status}`,
      };
    },
  },
];
