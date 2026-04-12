const express = require('express')
const { query } = require('../database/db')
const { requireAuth, requireInternal } = require('../middleware/auth')
const { requireRoles } = require('../middleware/authorize')
const { actorFromAuth } = require('../utils/actor')
const { logAudit } = require('../services/auditService')
const { runDmsSync } = require('../services/integrations/dmsProviderService')
const { fetchClinicalTrialSnapshot } = require('../services/integrations/clinicalTrialsService')
const { deliverErpExport } = require('../services/integrations/erpDeliveryService')
const { loadIntegrationSetup, saveIntegrationSetup, SECRET_FIELDS } = require('../services/integrationSetupService')

const router = express.Router()
router.use(requireAuth, requireInternal)

router.get('/setup', requireRoles(['superadmin', 'admin']), async (_req, res) => {
  const payload = await loadIntegrationSetup()
  return res.json(payload)
})

router.put('/setup', requireRoles(['superadmin', 'admin']), async (req, res) => {
  const incomingSettings = req.body?.settings || {}
  const payload = await saveIntegrationSetup({
    settingsInput: incomingSettings,
    updatedBy: req.auth.userId
  })

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey: 'integration',
    entityType: 'integration_setup',
    entityId: 'global',
    action: 'integration_setup_updated',
    metadata: {
      updatedKeys: Object.keys(incomingSettings || {}).sort(),
      secretFieldsTouched: SECRET_FIELDS.filter((key) => {
        const value = incomingSettings[key]
        return value !== undefined && value !== null && String(value) !== ''
      })
    }
  })

  return res.json(payload)
})

router.get('/dms/sync-jobs', async (req, res) => {
  const { provider, status } = req.query
  const params = []
  const where = []
  if (provider) {
    params.push(provider)
    where.push(`provider = $${params.length}`)
  }
  if (status) {
    params.push(status)
    where.push(`status = $${params.length}`)
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const { rows } = await query(`SELECT * FROM ieg_dms_sync_jobs ${whereSql} ORDER BY created_at DESC LIMIT 200`, params)
  return res.json({ jobs: rows })
})

router.post('/dms/sync-jobs', requireRoles(['superadmin', 'admin']), async (req, res) => {
  const {
    provider,
    moduleKey,
    entityType,
    entityId,
    direction = 'export',
    mappingPayload = {}
  } = req.body || {}

  if (!provider || !moduleKey || !entityType || !entityId) {
    return res.status(400).json({ error: 'provider, moduleKey, entityType, entityId are required' })
  }

  if (!['veeva', 'sharepoint'].includes(provider)) {
    return res.status(400).json({ error: 'provider must be veeva or sharepoint' })
  }

  const { rows } = await query(
    `
      INSERT INTO ieg_dms_sync_jobs
      (provider, module_key, entity_type, entity_id, direction, status, mapping_payload, created_by)
      VALUES ($1, $2, $3, $4, $5, 'queued', $6::jsonb, $7)
      RETURNING *
    `,
    [provider, moduleKey, entityType, String(entityId), direction, JSON.stringify(mappingPayload), req.auth.userId]
  )

  await query(
    `
      INSERT INTO ieg_dms_sync_log (sync_job_id, status, message, payload)
      VALUES ($1, 'queued', 'Sync job queued', $2::jsonb)
    `,
    [rows[0].id, JSON.stringify({ provider, moduleKey, entityType, entityId })]
  )

  let completedJob = rows[0]
  let syncResult = null

  try {
    syncResult = await runDmsSync(rows[0])
    const completed = await query(
      `
        UPDATE ieg_dms_sync_jobs
        SET status = 'completed',
            error_message = NULL
        WHERE id = $1
        RETURNING *
      `,
      [rows[0].id]
    )
    completedJob = completed.rows[0] || completedJob

    await query(
      `
        INSERT INTO ieg_dms_sync_log (sync_job_id, status, message, payload)
        VALUES ($1, 'completed', $2, $3::jsonb)
      `,
      [rows[0].id, `Sync completed (${provider}, ${syncResult.mode})`, JSON.stringify(syncResult.payload || {})]
    )
  } catch (error) {
    const failed = await query(
      `
        UPDATE ieg_dms_sync_jobs
        SET status = 'failed',
            error_message = $1
        WHERE id = $2
        RETURNING *
      `,
      [error.message, rows[0].id]
    )
    completedJob = failed.rows[0] || completedJob

    await query(
      `
        INSERT INTO ieg_dms_sync_log (sync_job_id, status, message, payload)
        VALUES ($1, 'failed', $2, $3::jsonb)
      `,
      [rows[0].id, error.message, JSON.stringify({ provider, moduleKey, entityType, entityId })]
    )
  }

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey,
    entityType,
    entityId: String(entityId),
    action: 'dms_sync_job_created',
    metadata: {
      provider,
      syncJobId: rows[0].id,
      status: completedJob.status
    }
  })

  if (completedJob.status === 'failed') {
    return res.status(502).json({ error: completedJob.error_message || 'DMS sync failed', job: completedJob })
  }

  return res.status(201).json({ job: completedJob, syncResult })
})

router.post('/dms/sync-jobs/:id/complete', requireRoles(['superadmin', 'admin']), async (req, res) => {
  const id = Number(req.params.id)
  const { status = 'completed', message = '', payload = {} } = req.body || {}

  const { rows } = await query(
    `
      UPDATE ieg_dms_sync_jobs
      SET status = $1,
          error_message = CASE WHEN $1 = 'failed' THEN $2 ELSE NULL END
      WHERE id = $3
      RETURNING *
    `,
    [status, message, id]
  )

  if (!rows[0]) return res.status(404).json({ error: 'Sync job not found' })

  await query(
    `
      INSERT INTO ieg_dms_sync_log (sync_job_id, status, message, payload)
      VALUES ($1, $2, $3, $4::jsonb)
    `,
    [id, status, message || 'sync completed', JSON.stringify(payload)]
  )

  return res.json({ job: rows[0] })
})

router.post('/clinicaltrials/link', async (req, res) => {
  const { iitProposalId, nctId, registryUrl = null, status = null } = req.body || {}
  if (!iitProposalId || !nctId) {
    return res.status(400).json({ error: 'iitProposalId and nctId are required' })
  }

  const proposalResult = await query(`SELECT * FROM ieg_iit_proposals WHERE id = $1`, [Number(iitProposalId)])
  const proposal = proposalResult.rows[0]
  if (!proposal) return res.status(404).json({ error: 'IIT proposal not found' })

  const ctg = await fetchClinicalTrialSnapshot(nctId)
  const generatedUrl = registryUrl || ctg.registryUrl
  const finalStatus = status || ctg.status
  const { rows } = await query(
    `
      INSERT INTO ieg_iit_registry_links (iit_proposal_id, nct_id, registry_url, status, linked_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [Number(iitProposalId), nctId, generatedUrl, finalStatus, req.auth.userId]
  )

  await query(
    `
      INSERT INTO ieg_iit_registry_snapshots (registry_link_id, snapshot_payload)
      VALUES ($1, $2::jsonb)
    `,
    [rows[0].id, JSON.stringify(ctg.snapshotPayload)]
  )

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey: 'iit',
    entityType: 'iit_proposal',
    entityId: String(iitProposalId),
    action: 'clinicaltrials_registry_linked',
    metadata: { nctId, registryLinkId: rows[0].id, sourceMode: ctg.mode }
  })

  return res.status(201).json({ registryLink: rows[0], sourceMode: ctg.mode })
})

router.get('/clinicaltrials/:iitProposalId', async (req, res) => {
  const iitProposalId = Number(req.params.iitProposalId)
  const links = await query(`SELECT * FROM ieg_iit_registry_links WHERE iit_proposal_id = $1 ORDER BY linked_at DESC`, [iitProposalId])
  const snapshots = await query(
    `
      SELECT s.*
      FROM ieg_iit_registry_snapshots s
      INNER JOIN ieg_iit_registry_links l ON l.id = s.registry_link_id
      WHERE l.iit_proposal_id = $1
      ORDER BY s.fetched_at DESC
    `,
    [iitProposalId]
  )
  return res.json({ links: links.rows, snapshots: snapshots.rows })
})

router.post('/clinicaltrials/snapshot', async (req, res) => {
  const { registryLinkId, snapshotPayload = {} } = req.body || {}
  if (!registryLinkId) return res.status(400).json({ error: 'registryLinkId is required' })

  const { rows } = await query(
    `
      INSERT INTO ieg_iit_registry_snapshots (registry_link_id, snapshot_payload)
      VALUES ($1, $2::jsonb)
      RETURNING *
    `,
    [Number(registryLinkId), JSON.stringify(snapshotPayload)]
  )

  return res.status(201).json({ snapshot: rows[0] })
})

router.post('/erp/exports', requireRoles(['superadmin', 'admin']), async (req, res) => {
  const { clientCode, exportFormat = 'csv', moduleKey = 'grants' } = req.body || {}
  if (!clientCode) {
    return res.status(400).json({ error: 'clientCode is required' })
  }

  const exportRows = await query(
    `
      SELECT module_key, entity_type, entity_id, amount, currency, status, created_at
      FROM ieg_disbursements
      WHERE module_key = $1
      ORDER BY created_at DESC
      LIMIT 500
    `,
    [moduleKey]
  )

  let delivery = null
  let exportStatus = 'completed'
  let exportMessage = `ERP export generated (${exportFormat})`
  try {
    delivery = await deliverErpExport({
      clientCode,
      exportFormat,
      moduleKey,
      records: exportRows.rows
    })
    if (delivery.mode === 'live' && !delivery.delivered) {
      exportStatus = 'failed'
      exportMessage = 'ERP delivery did not complete'
    }
  } catch (error) {
    exportStatus = 'failed'
    exportMessage = error.message
  }

  const { rows } = await query(
    `
      INSERT INTO ieg_erp_export_jobs
      (client_code, export_format, status, filter_payload, output_payload, created_by)
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
      RETURNING *
    `,
    [
      clientCode,
      exportFormat,
      exportStatus,
      JSON.stringify({ moduleKey }),
      JSON.stringify({
        records: exportRows.rows.length,
        sample: exportRows.rows.slice(0, 5),
        delivery: delivery || null
      }),
      req.auth.userId
    ]
  )

  await query(
    `
      INSERT INTO ieg_erp_export_logs (export_job_id, status, message, payload)
      VALUES ($1, $2, $3, $4::jsonb)
    `,
    [rows[0].id, exportStatus, exportMessage, JSON.stringify({ records: exportRows.rows.length, delivery: delivery || null })]
  )

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey,
    entityType: 'disbursement_export',
    entityId: String(rows[0].id),
    action: 'erp_export_generated',
    metadata: {
      clientCode,
      exportFormat,
      records: exportRows.rows.length,
      exportStatus
    }
  })

  if (exportStatus === 'failed') {
    return res.status(502).json({
      error: exportMessage,
      exportJob: rows[0]
    })
  }

  return res.status(201).json({ exportJob: rows[0], records: exportRows.rows })
})

router.get('/erp/exports', requireRoles(['superadmin', 'admin']), async (_req, res) => {
  const jobs = await query(`SELECT * FROM ieg_erp_export_jobs ORDER BY created_at DESC LIMIT 200`)
  return res.json({ exports: jobs.rows })
})

module.exports = router
