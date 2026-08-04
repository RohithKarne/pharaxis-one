import { randomUUID } from 'crypto';
import { Router } from 'express';
import { assertAnyRole } from '../middleware/rbac.js';

export const integrationsRouter = Router();

const validAdapters = new Set(['PLM', 'ERP', 'LIMS', 'DMS']);
const validAuthModes = new Set(['None', 'ApiKey', 'Basic', 'OAuth2']);
const validStatus = new Set(['Disconnected', 'Connected', 'Error']);
const validJobStatus = new Set(['Queued', 'Running', 'Success', 'Failed']);

integrationsRouter.put('/adapters/:adapterKey', async (req, res, next) => {
  try {
    assertAnyRole(req, ['admin', 'superadmin']);

    const { adapterKey } = req.params;
    const {
      endpointUrl = null,
      authMode = 'None',
      status = 'Disconnected',
      configJson = {}
    } = req.body || {};

    if (!validAdapters.has(adapterKey)) {
      return res.status(400).json({ error: 'Invalid adapterKey' });
    }
    if (!validAuthModes.has(authMode)) {
      return res.status(400).json({ error: 'Invalid authMode' });
    }
    if (!validStatus.has(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const adapter = await req.withRlsTransaction(async (client) => {
      await client.query(
        `
          INSERT INTO qms_integration_adapters (
            org_id,
            adapter_key,
            endpoint_url,
            auth_mode,
            status,
            config_json,
            created_by
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (org_id, adapter_key)
          DO UPDATE SET
            endpoint_url = EXCLUDED.endpoint_url,
            auth_mode = EXCLUDED.auth_mode,
            status = EXCLUDED.status,
            config_json = EXCLUDED.config_json,
            updated_at = CURRENT_TIMESTAMP(3)
        `,
        [
          req.authContext.orgId,
          adapterKey,
          endpointUrl,
          authMode,
          status,
          JSON.stringify(configJson || {}),
          req.authContext.userId
        ]
      );

      // Read back on the natural key, not an app-generated id: on the conflict
      // path the existing row keeps its own id, so a generated one would miss.
      const { rows } = await client.query(
        `
          SELECT *
          FROM qms_integration_adapters
          WHERE org_id = $1
            AND adapter_key = $2
          LIMIT 1
        `,
        [req.authContext.orgId, adapterKey]
      );
      return rows[0];
    });

    return res.json({ adapter });
  } catch (error) {
    return next(error);
  }
});

integrationsRouter.post('/adapters/:adapterKey/sync', async (req, res, next) => {
  try {
    assertAnyRole(req, ['admin', 'superadmin', 'qa_reviewer']);

    const { adapterKey } = req.params;
    const { jobType = 'OnDemandSync', payloadJson = {} } = req.body || {};

    if (!validAdapters.has(adapterKey)) {
      return res.status(400).json({ error: 'Invalid adapterKey' });
    }

    const job = await req.withRlsTransaction(async (client) => {
      const { rows: adapterRows } = await client.query(
        `
          SELECT *
          FROM qms_integration_adapters
          WHERE adapter_key = $1
            AND org_id = $2
          LIMIT 1
        `,
        [adapterKey, req.authContext.orgId]
      );

      if (!adapterRows[0]) {
        const error = new Error('Adapter not configured');
        error.statusCode = 404;
        throw error;
      }

      const adapter = adapterRows[0];

      const jobId = randomUUID();
      await client.query(
        `
          INSERT INTO qms_integration_sync_jobs (
            id,
            org_id,
            adapter_id,
            job_type,
            status,
            payload_json,
            started_at,
            finished_at,
            result_json,
            created_by
          )
          VALUES ($1, $2, $3, $4, 'Success', $5, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), $6, $7)
        `,
        [
          jobId,
          req.authContext.orgId,
          adapter.id,
          jobType,
          JSON.stringify(payloadJson || {}),
          JSON.stringify({
            simulated: true,
            adapterKey,
            recordsProcessed: Math.floor(Math.random() * 30) + 1
          }),
          req.authContext.userId
        ]
      );

      const { rows } = await client.query(
        `
          SELECT *
          FROM qms_integration_sync_jobs
          WHERE id = $1
            AND org_id = $2
          LIMIT 1
        `,
        [jobId, req.authContext.orgId]
      );

      await client.query(
        `
          UPDATE qms_integration_adapters
          SET status = 'Connected', last_sync_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
          WHERE id = $1
            AND org_id = $2
        `,
        [adapter.id, req.authContext.orgId]
      );

      return rows[0];
    });

    return res.status(201).json({ job });
  } catch (error) {
    return next(error);
  }
});

integrationsRouter.patch('/jobs/:jobId', async (req, res, next) => {
  try {
    assertAnyRole(req, ['admin', 'superadmin']);

    const { jobId } = req.params;
    const { status = null, resultJson = null } = req.body || {};

    if (status && !validJobStatus.has(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const job = await req.withRlsTransaction(async (client) => {
      await client.query(
        `
          UPDATE qms_integration_sync_jobs
          SET
            status = COALESCE($2, status),
            result_json = COALESCE($3, result_json),
            started_at = CASE WHEN COALESCE($2, status) = 'Running' AND started_at IS NULL THEN CURRENT_TIMESTAMP(3) ELSE started_at END,
            finished_at = CASE WHEN COALESCE($2, status) IN ('Success', 'Failed') THEN CURRENT_TIMESTAMP(3) ELSE finished_at END
          WHERE id = $1
            AND org_id = $4
        `,
        [jobId, status, resultJson ? JSON.stringify(resultJson) : null, req.authContext.orgId]
      );

      const { rows } = await client.query(
        `
          SELECT *
          FROM qms_integration_sync_jobs
          WHERE id = $1
            AND org_id = $2
          LIMIT 1
        `,
        [jobId, req.authContext.orgId]
      );

      if (!rows[0]) {
        const error = new Error('Sync job not found');
        error.statusCode = 404;
        throw error;
      }

      return rows[0];
    });

    return res.json({ job });
  } catch (error) {
    return next(error);
  }
});

integrationsRouter.get('/', async (req, res, next) => {
  try {
    const snapshot = await req.withRlsTransaction(async (client) => {
      const adapterRows = await client.query(
        `SELECT * FROM qms_integration_adapters WHERE org_id = $1 ORDER BY adapter_key ASC`,
        [req.authContext.orgId]
      );
      const jobRows = await client.query(
        `
          SELECT j.*, a.adapter_key
          FROM qms_integration_sync_jobs j
          JOIN qms_integration_adapters a ON a.id = j.adapter_id
          WHERE j.org_id = $1
            AND a.org_id = $1
          ORDER BY j.created_at DESC
          LIMIT 300
        `,
        [req.authContext.orgId]
      );

      return {
        adapters: adapterRows.rows,
        jobs: jobRows.rows
      };
    });

    return res.json(snapshot);
  } catch (error) {
    return next(error);
  }
});
