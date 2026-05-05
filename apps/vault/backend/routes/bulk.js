const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const auditService = require('../services/auditService')

const router = express.Router()

const LIFECYCLE_STATES = new Set(['draft', 'in_review', 'approved', 'published', 'archived'])
const METADATA_FIELDS = new Set([
  'description',
  'language',
  'country_region',
  'audience',
  'confidentiality',
  'regulated',
  'therapeutic_area',
  'product_brand',
  'department',
  'keywords',
  'effective_date',
  'expiry_date',
  'review_cycle_months'
])

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin role required' })
  next()
}

function normalizeContentIds(value) {
  return Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map(item => Number(item))
      .filter(item => Number.isInteger(item) && item > 0)
  ))
}

function normalizeMetadataValue(field, value) {
  if (value === undefined || value === '') return null
  if (field === 'regulated') return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase()) ? 1 : 0
  if (field === 'review_cycle_months') {
    const n = Number(value)
    return Number.isInteger(n) && n > 0 ? n : null
  }
  return value
}

async function createJob(connection, req, jobType, status, requestedCount, successCount, failureCount, payload, result) {
  const [job] = await connection.execute(
    `INSERT INTO bulk_operation_jobs
     (org_id, job_type, status, requested_by, requested_count, success_count, failure_count, payload_json, result_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      req.user.orgId,
      jobType,
      status,
      req.user.userId,
      requestedCount,
      successCount,
      failureCount,
      JSON.stringify(payload),
      JSON.stringify(result)
    ]
  )
  return job.insertId
}

async function fetchContentRows(connection, orgId, contentIds) {
  if (!contentIds.length) return []
  const placeholders = contentIds.map(() => '?').join(',')
  const [rows] = await connection.execute(
    `SELECT id, doc_number, title, lifecycle_state, folder_id
     FROM vault_content
     WHERE org_id = ? AND id IN (${placeholders})
     FOR UPDATE`,
    [orgId, ...contentIds]
  )
  return rows
}

function makeSummary(contentIds, rows) {
  const found = new Set(rows.map(row => Number(row.id)))
  return {
    requested: contentIds,
    found: rows.map(row => row.id),
    missing: contentIds.filter(id => !found.has(id))
  }
}

function buildPreview(operation, contentIds, rows, payload = {}, relationshipRows = []) {
  const found = new Set(rows.map(row => Number(row.id)))
  const errors = contentIds
    .filter(id => !found.has(id))
    .map(id => ({ content_id: id, severity: 'error', message: 'Document not found in this organization' }))
  const warnings = rows.flatMap(row => {
    const rowWarnings = []
    if (operation === 'archive' && row.lifecycle_state === 'published') {
      rowWarnings.push({ content_id: row.id, severity: 'warning', message: 'Published document will be archived' })
    }
    if (operation === 'lifecycle' && payload.to_state === row.lifecycle_state) {
      rowWarnings.push({ content_id: row.id, severity: 'warning', message: 'Document is already in the target lifecycle state' })
    }
    return rowWarnings
  })
  const relationshipWarnings = relationshipRows.map(row => ({
    content_id: row.content_id,
    severity: 'warning',
    message: `Document has ${row.relationship_count} relationship links. Review impact before ${operation}.`
  }))
  return {
    operation,
    requested_count: contentIds.length,
    valid_count: rows.length,
    error_count: errors.length,
    warning_count: warnings.length + relationshipWarnings.length,
    target: payload,
    rows,
    issues: [...errors, ...warnings, ...relationshipWarnings],
    confirm_required: true
  }
}

function requireConfirmed(req, res) {
  if (req.body.confirm !== true) {
    res.status(409).json({ error: 'Run preview first and submit with confirm=true to apply this bulk operation' })
    return false
  }
  return true
}

router.get('/jobs', authenticate, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT bj.id, bj.job_type, bj.status, bj.requested_count, bj.success_count, bj.failure_count,
              bj.payload_json, bj.result_json, bj.created_at, u.name AS requested_by_name
       FROM bulk_operation_jobs bj
       LEFT JOIN users u
         ON u.id = bj.requested_by
        AND u.org_id = bj.org_id
       WHERE bj.org_id = ?
       ORDER BY bj.created_at DESC, bj.id DESC
       LIMIT 30`,
      [req.user.orgId]
    )
    res.json(rows)
  } catch (error) {
    console.error('List bulk jobs error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/preview', authenticate, requireAdmin, async (req, res) => {
  const operation = String(req.body.operation || '').trim()
  const contentIds = normalizeContentIds(req.body.content_ids)
  if (!['lifecycle', 'metadata', 'folder', 'archive'].includes(operation)) {
    return res.status(400).json({ error: 'Valid operation is required' })
  }
  if (!contentIds.length) return res.status(400).json({ error: 'content_ids are required' })

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const rows = await fetchContentRows(connection, req.user.orgId, contentIds)
    let relationshipRows = []
    if (rows.length && ['archive', 'lifecycle'].includes(operation)) {
      const ids = rows.map(row => row.id)
      const placeholders = ids.map(() => '?').join(',')
      const [impactRows] = await connection.execute(
        `SELECT related_id AS content_id, COUNT(*) AS relationship_count
         FROM (
           SELECT source_content_id AS related_id FROM vault_document_relationships WHERE org_id = ? AND source_content_id IN (${placeholders})
           UNION ALL
           SELECT target_content_id AS related_id FROM vault_document_relationships WHERE org_id = ? AND target_content_id IN (${placeholders})
         ) rel
         GROUP BY related_id`,
        [req.user.orgId, ...ids, req.user.orgId, ...ids]
      )
      relationshipRows = impactRows
    }
    await connection.rollback()
    res.json(buildPreview(operation, contentIds, rows, req.body, relationshipRows))
  } catch (error) {
    await connection.rollback()
    console.error('Bulk preview error:', error)
    res.status(500).json({ error: 'Server error' })
  } finally {
    connection.release()
  }
})

router.post('/lifecycle', authenticate, requireAdmin, async (req, res) => {
  const contentIds = normalizeContentIds(req.body.content_ids)
  const toState = String(req.body.to_state || '').trim()
  if (!contentIds.length) return res.status(400).json({ error: 'content_ids are required' })
  if (!LIFECYCLE_STATES.has(toState)) return res.status(400).json({ error: 'Invalid lifecycle state' })
  if (!requireConfirmed(req, res)) return

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const rows = await fetchContentRows(connection, req.user.orgId, contentIds)
    const summary = makeSummary(contentIds, rows)

    if (rows.length) {
      const placeholders = rows.map(() => '?').join(',')
      await connection.execute(
        `UPDATE vault_content
         SET lifecycle_state = ?, updated_at = NOW()
         WHERE org_id = ? AND id IN (${placeholders})`,
        [toState, req.user.orgId, ...rows.map(row => row.id)]
      )
    }

    const failureCount = summary.missing.length
    const status = failureCount ? (rows.length ? 'partial' : 'failed') : 'completed'
    const jobId = await createJob(
      connection,
      req,
      'lifecycle',
      status,
      contentIds.length,
      rows.length,
      failureCount,
      { content_ids: contentIds, to_state: toState },
      { ...summary, to_state: toState }
    )

    await connection.commit()
    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'bulk_lifecycle_updated',
      'bulk_operation_job',
      jobId,
      req.ip,
      rows.map(row => ({ id: row.id, lifecycle_state: row.lifecycle_state })),
      { to_state: toState, affected: rows.length },
      'Bulk lifecycle update completed'
    )
    res.status(201).json({ id: jobId, status, success_count: rows.length, failure_count: failureCount, result: summary })
  } catch (error) {
    await connection.rollback()
    console.error('Bulk lifecycle error:', error)
    res.status(500).json({ error: 'Server error' })
  } finally {
    connection.release()
  }
})

router.post('/metadata', authenticate, requireAdmin, async (req, res) => {
  const contentIds = normalizeContentIds(req.body.content_ids)
  const fields = req.body.fields && typeof req.body.fields === 'object' ? req.body.fields : {}
  const provided = Object.keys(fields).filter(field => METADATA_FIELDS.has(field))
  if (!contentIds.length) return res.status(400).json({ error: 'content_ids are required' })
  if (!provided.length) return res.status(400).json({ error: 'At least one valid metadata field is required' })
  if (!requireConfirmed(req, res)) return

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const rows = await fetchContentRows(connection, req.user.orgId, contentIds)
    const summary = makeSummary(contentIds, rows)

    for (const row of rows) {
      await connection.execute(
        `INSERT INTO vault_metadata (org_id, content_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE content_id = VALUES(content_id)`,
        [req.user.orgId, row.id]
      )
      const updates = provided.map(field => `${field} = ?`)
      const values = provided.map(field => normalizeMetadataValue(field, fields[field]))
      await connection.execute(
        `UPDATE vault_metadata
         SET ${updates.join(', ')}
         WHERE org_id = ? AND content_id = ?`,
        [...values, req.user.orgId, row.id]
      )
    }

    const failureCount = summary.missing.length
    const status = failureCount ? (rows.length ? 'partial' : 'failed') : 'completed'
    const jobId = await createJob(
      connection,
      req,
      'metadata',
      status,
      contentIds.length,
      rows.length,
      failureCount,
      { content_ids: contentIds, fields },
      { ...summary, fields: provided }
    )

    await connection.commit()
    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'bulk_metadata_updated',
      'bulk_operation_job',
      jobId,
      req.ip,
      null,
      { fields: provided, affected: rows.length },
      'Bulk metadata update completed'
    )
    res.status(201).json({ id: jobId, status, success_count: rows.length, failure_count: failureCount, result: summary })
  } catch (error) {
    await connection.rollback()
    console.error('Bulk metadata error:', error)
    res.status(500).json({ error: 'Server error' })
  } finally {
    connection.release()
  }
})

router.post('/folder', authenticate, requireAdmin, async (req, res) => {
  const contentIds = normalizeContentIds(req.body.content_ids)
  const folderId = req.body.folder_id === null || req.body.folder_id === '' ? null : Number(req.body.folder_id)
  if (!contentIds.length) return res.status(400).json({ error: 'content_ids are required' })
  if (folderId !== null && (!Number.isInteger(folderId) || folderId <= 0)) {
    return res.status(400).json({ error: 'Invalid folder_id' })
  }
  if (!requireConfirmed(req, res)) return

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    if (folderId !== null) {
      const [[folder]] = await connection.execute(
        'SELECT id FROM vault_folders WHERE id = ? AND org_id = ? AND is_active = 1',
        [folderId, req.user.orgId]
      )
      if (!folder) {
        await connection.rollback()
        return res.status(404).json({ error: 'Folder not found' })
      }
    }

    const rows = await fetchContentRows(connection, req.user.orgId, contentIds)
    const summary = makeSummary(contentIds, rows)
    if (rows.length) {
      const placeholders = rows.map(() => '?').join(',')
      await connection.execute(
        `UPDATE vault_content
         SET folder_id = ?, updated_at = NOW()
         WHERE org_id = ? AND id IN (${placeholders})`,
        [folderId, req.user.orgId, ...rows.map(row => row.id)]
      )
    }

    const failureCount = summary.missing.length
    const status = failureCount ? (rows.length ? 'partial' : 'failed') : 'completed'
    const jobId = await createJob(
      connection,
      req,
      'folder',
      status,
      contentIds.length,
      rows.length,
      failureCount,
      { content_ids: contentIds, folder_id: folderId },
      { ...summary, folder_id: folderId }
    )

    await connection.commit()
    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'bulk_folder_updated',
      'bulk_operation_job',
      jobId,
      req.ip,
      rows.map(row => ({ id: row.id, folder_id: row.folder_id })),
      { folder_id: folderId, affected: rows.length },
      'Bulk folder move completed'
    )
    res.status(201).json({ id: jobId, status, success_count: rows.length, failure_count: failureCount, result: summary })
  } catch (error) {
    await connection.rollback()
    console.error('Bulk folder error:', error)
    res.status(500).json({ error: 'Server error' })
  } finally {
    connection.release()
  }
})

router.post('/archive', authenticate, requireAdmin, async (req, res) => {
  const contentIds = normalizeContentIds(req.body.content_ids)
  if (!contentIds.length) return res.status(400).json({ error: 'content_ids are required' })
  if (!requireConfirmed(req, res)) return

  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const rows = await fetchContentRows(connection, req.user.orgId, contentIds)
    const summary = makeSummary(contentIds, rows)

    if (rows.length) {
      const placeholders = rows.map(() => '?').join(',')
      await connection.execute(
        `UPDATE vault_content
         SET lifecycle_state = 'archived', updated_at = NOW()
         WHERE org_id = ? AND id IN (${placeholders})`,
        [req.user.orgId, ...rows.map(row => row.id)]
      )
    }

    const failureCount = summary.missing.length
    const status = failureCount ? (rows.length ? 'partial' : 'failed') : 'completed'
    const jobId = await createJob(
      connection,
      req,
      'archive',
      status,
      contentIds.length,
      rows.length,
      failureCount,
      { content_ids: contentIds },
      { ...summary, to_state: 'archived' }
    )

    await connection.commit()
    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'bulk_archived',
      'bulk_operation_job',
      jobId,
      req.ip,
      rows.map(row => ({ id: row.id, lifecycle_state: row.lifecycle_state })),
      { lifecycle_state: 'archived', affected: rows.length },
      'Bulk archive completed'
    )
    res.status(201).json({ id: jobId, status, success_count: rows.length, failure_count: failureCount, result: summary })
  } catch (error) {
    await connection.rollback()
    console.error('Bulk archive error:', error)
    res.status(500).json({ error: 'Server error' })
  } finally {
    connection.release()
  }
})

module.exports = router
