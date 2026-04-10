const fs = require('fs')
const express = require('express')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const auditService = require('../services/auditService')
const storageService = require('../services/storageService')
const lifecycleService = require('../services/lifecycleService')
const watermarkService = require('../services/watermarkService')

const router = express.Router()

const METADATA_FIELDS = [
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
]

function parseFolderId(value) {
  if (value === undefined || value === null || value === '') return null
  const num = Number(value)
  return Number.isInteger(num) && num > 0 ? num : null
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin role required' })
  next()
}

async function getContentInOrg(contentId, orgId) {
  const [[row]] = await pool.execute(
    `SELECT vc.id, vc.org_id, vc.doc_number, vc.title, vc.lifecycle_state, vc.current_version_id, vc.created_by, vc.folder_id,
            vc.content_type_id, vc.content_subtype_id, vc.classification_id,
            ct.name AS content_type_name, ct.code AS content_type_code
     FROM vault_content vc
     LEFT JOIN content_types ct ON ct.id = vc.content_type_id AND ct.org_id = vc.org_id
     WHERE vc.id = ? AND vc.org_id = ?`,
    [contentId, orgId]
  )
  return row
}

async function getVersionInOrg(versionId, contentId, orgId) {
  const [[version]] = await pool.execute(
    `SELECT vv.id, vv.org_id, vv.content_id, vv.version_number, vv.file_name, vv.file_path, vv.s3_key, vv.mime_type,
            vv.file_size_kb, vv.uploaded_by, vv.uploaded_at
     FROM vault_versions vv
     WHERE vv.id = ? AND vv.content_id = ? AND vv.org_id = ?`,
    [versionId, contentId, orgId]
  )
  return version
}

function normalizeMetadataValue(key, value) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null

  if (key === 'regulated') {
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase()) ? 1 : 0
  }
  if (key === 'review_cycle_months') {
    const n = Number(value)
    if (!Number.isInteger(n) || n <= 0) return null
    return n
  }
  return value
}

function isPdfMime(mimeType, fileName) {
  if (String(mimeType || '').toLowerCase().includes('pdf')) return true
  return String(fileName || '').toLowerCase().endsWith('.pdf')
}

router.get('/expiry-dashboard', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         vc.id,
         vc.doc_number,
         vc.title,
         vc.lifecycle_state,
         vm.expiry_date,
         DATEDIFF(vm.expiry_date, CURDATE()) AS days_remaining,
         owner.id AS owner_user_id,
         owner.name AS owner_name,
         owner.email AS owner_email
       FROM vault_content vc
       JOIN vault_metadata vm
         ON vm.content_id = vc.id
        AND vm.org_id = vc.org_id
       LEFT JOIN users owner
         ON owner.id = vc.created_by
        AND owner.org_id = vc.org_id
       WHERE vc.org_id = ?
         AND vm.expiry_date IS NOT NULL
       ORDER BY vm.expiry_date ASC`,
      [req.user.orgId]
    )

    const groups = {
      expiring_30: [],
      expiring_60: [],
      expiring_90: [],
      expired: []
    }

    rows.forEach(row => {
      const item = {
        content_id: row.id,
        doc_number: row.doc_number,
        title: row.title,
        lifecycle_state: row.lifecycle_state,
        expiry_date: row.expiry_date,
        days_remaining: Number(row.days_remaining),
        owner: {
          id: row.owner_user_id,
          name: row.owner_name,
          email: row.owner_email
        }
      }

      if (item.days_remaining < 0) {
        groups.expired.push(item)
      } else if (item.days_remaining <= 30) {
        groups.expiring_30.push(item)
      } else if (item.days_remaining <= 60) {
        groups.expiring_60.push(item)
      } else if (item.days_remaining <= 90) {
        groups.expiring_90.push(item)
      }
    })

    res.json(groups)
  } catch (error) {
    console.error('Expiry dashboard error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/', authenticate, async (req, res) => {
  const folderId = parseFolderId(req.query.folder_id)
  const params = [req.user.orgId]
  let folderClause = ''

  if (folderId) {
    folderClause = ' AND vc.folder_id = ?'
    params.push(folderId)
  }

  try {
    const [rows] = await pool.execute(
      `SELECT
         vc.id,
         vc.doc_number,
         vc.title,
         vc.lifecycle_state,
         vc.created_at,
         vc.folder_id,
         vv.version_number,
         vv.uploaded_at,
         vf.name AS folder_name,
         cl.locked_by,
         lock_user.name AS locked_by_name
       FROM vault_content vc
       LEFT JOIN vault_versions vv
         ON vv.id = vc.current_version_id
        AND vv.org_id = vc.org_id
       LEFT JOIN vault_folders vf
         ON vf.id = vc.folder_id
        AND vf.org_id = vc.org_id
       LEFT JOIN checkout_locks cl
         ON cl.content_id = vc.id
        AND cl.org_id = vc.org_id
       LEFT JOIN users lock_user
         ON lock_user.id = cl.locked_by
        AND lock_user.org_id = vc.org_id
       WHERE vc.org_id = ? ${folderClause}
       ORDER BY vc.updated_at DESC, vc.created_at DESC`,
      params
    )
    res.json(rows)
  } catch (error) {
    console.error('List content error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/files/:versionId', authenticate, async (req, res) => {
  const versionId = Number(req.params.versionId)
  if (!Number.isInteger(versionId) || versionId <= 0) {
    return res.status(400).json({ error: 'Invalid version id' })
  }

  try {
    const [[version]] = await pool.execute(
      `SELECT id, org_id, file_name, file_path, mime_type
       FROM vault_versions
       WHERE id = ? AND org_id = ?`,
      [versionId, req.user.orgId]
    )
    if (!version) return res.status(404).json({ error: 'Version not found' })

    const localPath = storageService.resolveLocalPath(version)
    if (!localPath || !fs.existsSync(localPath)) {
      return res.status(404).json({ error: 'Local file not found' })
    }

    res.setHeader('Content-Type', version.mime_type || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${version.file_name}"`)
    res.sendFile(localPath)
  } catch (error) {
    console.error('Serve local file error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/:id/metadata', authenticate, async (req, res) => {
  const contentId = Number(req.params.id)
  if (!Number.isInteger(contentId) || contentId <= 0) {
    return res.status(400).json({ error: 'Invalid content id' })
  }

  try {
    const content = await getContentInOrg(contentId, req.user.orgId)
    if (!content) return res.status(404).json({ error: 'Content not found' })

    const [[metadata]] = await pool.execute(
      `SELECT id, org_id, content_id, description, language, country_region, audience, confidentiality, regulated,
              therapeutic_area, product_brand, department, keywords, effective_date, expiry_date, review_cycle_months
       FROM vault_metadata
       WHERE org_id = ? AND content_id = ?`,
      [req.user.orgId, contentId]
    )

    res.json(metadata || null)
  } catch (error) {
    console.error('Get metadata error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/:id/metadata', authenticate, async (req, res) => {
  const contentId = Number(req.params.id)
  if (!Number.isInteger(contentId) || contentId <= 0) {
    return res.status(400).json({ error: 'Invalid content id' })
  }
  if (!['admin', 'author'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only admin/author can edit metadata' })
  }

  const provided = METADATA_FIELDS.filter(field => req.body[field] !== undefined)
  if (!provided.length) {
    return res.status(400).json({ error: 'No metadata fields provided' })
  }

  try {
    const content = await getContentInOrg(contentId, req.user.orgId)
    if (!content) return res.status(404).json({ error: 'Content not found' })

    const [[existing]] = await pool.execute(
      `SELECT id, org_id, content_id, description, language, country_region, audience, confidentiality, regulated,
              therapeutic_area, product_brand, department, keywords, effective_date, expiry_date, review_cycle_months
       FROM vault_metadata
       WHERE org_id = ? AND content_id = ?`,
      [req.user.orgId, contentId]
    )

    if (!existing) {
      await pool.execute(
        'INSERT INTO vault_metadata (org_id, content_id) VALUES (?, ?)',
        [req.user.orgId, contentId]
      )
    }

    const updates = []
    const params = []
    for (const field of provided) {
      updates.push(`${field} = ?`)
      params.push(normalizeMetadataValue(field, req.body[field]))
    }

    params.push(req.user.orgId, contentId)
    await pool.execute(
      `UPDATE vault_metadata
       SET ${updates.join(', ')}
       WHERE org_id = ? AND content_id = ?`,
      params
    )

    const [[updated]] = await pool.execute(
      `SELECT id, org_id, content_id, description, language, country_region, audience, confidentiality, regulated,
              therapeutic_area, product_brand, department, keywords, effective_date, expiry_date, review_cycle_months
       FROM vault_metadata
       WHERE org_id = ? AND content_id = ?`,
      [req.user.orgId, contentId]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'metadata_updated',
      'vault_metadata',
      updated.id,
      req.ip,
      existing || null,
      updated,
      'Metadata updated'
    )

    res.json({ message: 'Metadata updated', metadata: updated })
  } catch (error) {
    console.error('Update metadata error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/:id/transition', authenticate, async (req, res) => {
  const contentId = Number(req.params.id)
  const toState = String(req.body.toState || '').trim()

  if (!Number.isInteger(contentId) || contentId <= 0 || !toState) {
    return res.status(400).json({ error: 'Valid content id and toState are required' })
  }

  try {
    const result = await lifecycleService.transition(
      req.user.orgId,
      contentId,
      toState,
      req.user.userId,
      req.user.role
    )

    if (result.changed) {
      await auditService.log(
        req.user.orgId,
        req.user.userId,
        'org_user',
        'lifecycle_transition',
        'vault_content',
        contentId,
        req.ip,
        { lifecycle_state: result.before_state },
        { lifecycle_state: result.after_state },
        `Lifecycle transition by ${req.user.role}`
      )
    }

    res.json({
      message: result.changed ? 'Lifecycle updated' : 'Lifecycle unchanged',
      content: result.content,
      before_state: result.before_state,
      after_state: result.after_state
    })
  } catch (error) {
    if (error.code === 'NOT_FOUND') return res.status(404).json({ error: error.message })
    if (error.code === 'FORBIDDEN') return res.status(403).json({ error: error.message })

    console.error('Lifecycle transition error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/:id/view', authenticate, async (req, res) => {
  const contentId = Number(req.params.id)
  if (!Number.isInteger(contentId) || contentId <= 0) {
    return res.status(400).json({ error: 'Invalid content id' })
  }

  try {
    const content = await getContentInOrg(contentId, req.user.orgId)
    if (!content) return res.status(404).json({ error: 'Content not found' })

    const version = await getVersionInOrg(content.current_version_id, contentId, req.user.orgId)
    if (!version) return res.status(404).json({ error: 'Current version not found' })

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'document_viewed',
      'vault_version',
      version.id,
      req.ip,
      null,
      { content_id: contentId, version_number: version.version_number },
      'Current version view requested'
    )

    if (isPdfMime(version.mime_type, version.file_name)) {
      const originalBuffer = await storageService.getObjectBuffer(version)
      const stampedBuffer = await watermarkService.applyWatermark(originalBuffer, content.lifecycle_state)

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="${version.file_name}"`)
      return res.send(stampedBuffer)
    }

    const descriptor = await storageService.getDownloadDescriptor(version)
    return res.json({
      source: descriptor.source,
      url: descriptor.url,
      expires_in_seconds: descriptor.expires_in_seconds,
      mime_type: version.mime_type,
      file_name: version.file_name,
      version_number: version.version_number
    })
  } catch (error) {
    console.error('View current version error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/:id/versions/:versionId/view', authenticate, async (req, res) => {
  const contentId = Number(req.params.id)
  const versionId = Number(req.params.versionId)
  if (!Number.isInteger(contentId) || contentId <= 0 || !Number.isInteger(versionId) || versionId <= 0) {
    return res.status(400).json({ error: 'Invalid content/version id' })
  }

  try {
    const content = await getContentInOrg(contentId, req.user.orgId)
    if (!content) return res.status(404).json({ error: 'Content not found' })

    const version = await getVersionInOrg(versionId, contentId, req.user.orgId)
    if (!version) return res.status(404).json({ error: 'Version not found' })

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'document_viewed',
      'vault_version',
      version.id,
      req.ip,
      null,
      { content_id: contentId, version_number: version.version_number },
      'Specific version view requested'
    )

    if (isPdfMime(version.mime_type, version.file_name)) {
      const originalBuffer = await storageService.getObjectBuffer(version)
      const stampedBuffer = await watermarkService.applyWatermark(originalBuffer, content.lifecycle_state)

      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `inline; filename="${version.file_name}"`)
      return res.send(stampedBuffer)
    }

    const descriptor = await storageService.getDownloadDescriptor(version)
    return res.json({
      source: descriptor.source,
      url: descriptor.url,
      expires_in_seconds: descriptor.expires_in_seconds,
      mime_type: version.mime_type,
      file_name: version.file_name,
      version_number: version.version_number
    })
  } catch (error) {
    console.error('View version error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/:id', authenticate, async (req, res) => {
  const contentId = Number(req.params.id)
  if (!Number.isInteger(contentId) || contentId <= 0) {
    return res.status(400).json({ error: 'Invalid content id' })
  }

  try {
    const content = await getContentInOrg(contentId, req.user.orgId)
    if (!content) return res.status(404).json({ error: 'Content not found' })

    const [[currentVersion]] = await pool.execute(
      `SELECT id, version_number, file_name, file_size_kb, uploaded_at, uploaded_by, mime_type
       FROM vault_versions
       WHERE id = ? AND org_id = ?`,
      [content.current_version_id, req.user.orgId]
    )

    const [[lock]] = await pool.execute(
      `SELECT cl.id, cl.locked_by, cl.locked_at, u.name AS locked_by_name
       FROM checkout_locks cl
       LEFT JOIN users u ON u.id = cl.locked_by AND u.org_id = cl.org_id
       WHERE cl.org_id = ? AND cl.content_id = ?`,
      [req.user.orgId, contentId]
    )

    res.json({
      ...content,
      current_version: currentVersion || null,
      checkout_lock: lock || null
    })
  } catch (error) {
    console.error('Get content detail error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/:id/versions', authenticate, async (req, res) => {
  const contentId = Number(req.params.id)
  if (!Number.isInteger(contentId) || contentId <= 0) {
    return res.status(400).json({ error: 'Invalid content id' })
  }

  try {
    const content = await getContentInOrg(contentId, req.user.orgId)
    if (!content) return res.status(404).json({ error: 'Content not found' })

    const [rows] = await pool.execute(
      `SELECT vv.id, vv.version_number, vv.file_name, vv.file_size_kb, vv.uploaded_at, vv.uploaded_by,
              vv.mime_type, u.name AS uploaded_by_name
       FROM vault_versions vv
       LEFT JOIN users u ON u.id = vv.uploaded_by AND u.org_id = vv.org_id
       WHERE vv.org_id = ? AND vv.content_id = ?
       ORDER BY vv.uploaded_at DESC, vv.id DESC`,
      [req.user.orgId, contentId]
    )
    res.json(rows)
  } catch (error) {
    console.error('List versions error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/:id/versions/:versionId/download', authenticate, async (req, res) => {
  const contentId = Number(req.params.id)
  const versionId = Number(req.params.versionId)
  if (!Number.isInteger(contentId) || contentId <= 0 || !Number.isInteger(versionId) || versionId <= 0) {
    return res.status(400).json({ error: 'Invalid content/version id' })
  }

  try {
    const version = await getVersionInOrg(versionId, contentId, req.user.orgId)
    if (!version) return res.status(404).json({ error: 'Version not found' })

    const descriptor = await storageService.getDownloadDescriptor(version)
    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'document_downloaded',
      'vault_version',
      versionId,
      req.ip,
      null,
      { content_id: contentId, version_number: version.version_number },
      'Version download requested'
    )

    res.json({
      version_id: versionId,
      version_number: version.version_number,
      file_name: version.file_name,
      ...descriptor
    })
  } catch (error) {
    console.error('Get download link error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/:id/checkout', authenticate, async (req, res) => {
  const contentId = Number(req.params.id)
  if (!Number.isInteger(contentId) || contentId <= 0) {
    return res.status(400).json({ error: 'Invalid content id' })
  }

  try {
    const content = await getContentInOrg(contentId, req.user.orgId)
    if (!content) return res.status(404).json({ error: 'Content not found' })

    const [[lock]] = await pool.execute(
      `SELECT cl.id, cl.content_id, cl.locked_by, cl.locked_at, cl.force_released_by, cl.force_released_at,
              u.name AS locked_by_name
       FROM checkout_locks cl
       LEFT JOIN users u ON u.id = cl.locked_by AND u.org_id = cl.org_id
       WHERE cl.org_id = ? AND cl.content_id = ?`,
      [req.user.orgId, contentId]
    )

    res.json({ locked: Boolean(lock), lock: lock || null })
  } catch (error) {
    console.error('Get checkout status error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/:id/checkout', authenticate, async (req, res) => {
  const contentId = Number(req.params.id)
  if (!Number.isInteger(contentId) || contentId <= 0) {
    return res.status(400).json({ error: 'Invalid content id' })
  }

  try {
    const content = await getContentInOrg(contentId, req.user.orgId)
    if (!content) return res.status(404).json({ error: 'Content not found' })

    const [[existingLock]] = await pool.execute(
      'SELECT id, locked_by FROM checkout_locks WHERE org_id = ? AND content_id = ?',
      [req.user.orgId, contentId]
    )
    if (existingLock) {
      return res.status(423).json({ error: 'Content already checked out by another user' })
    }

    await pool.execute(
      `INSERT INTO checkout_locks (org_id, content_id, locked_by)
       VALUES (?, ?, ?)`,
      [req.user.orgId, contentId, req.user.userId]
    )

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'checkout',
      'vault_content',
      contentId,
      req.ip,
      null,
      { locked_by: req.user.userId },
      'Document checked out'
    )

    res.json({ message: 'Checked out' })
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(423).json({ error: 'Content already checked out by another user' })
    }
    console.error('Checkout error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/:id/checkin', authenticate, async (req, res) => {
  const contentId = Number(req.params.id)
  if (!Number.isInteger(contentId) || contentId <= 0) {
    return res.status(400).json({ error: 'Invalid content id' })
  }

  try {
    const [[lock]] = await pool.execute(
      'SELECT id, locked_by FROM checkout_locks WHERE org_id = ? AND content_id = ?',
      [req.user.orgId, contentId]
    )
    if (!lock) return res.status(404).json({ error: 'No active checkout lock found' })

    const canRelease = Number(lock.locked_by) === Number(req.user.userId) || req.user.role === 'admin'
    if (!canRelease) return res.status(403).json({ error: 'Only locking user or admin can check in' })

    await pool.execute('DELETE FROM checkout_locks WHERE id = ?', [lock.id])

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'checkin',
      'vault_content',
      contentId,
      req.ip,
      { locked_by: lock.locked_by },
      null,
      'Document checked in'
    )

    res.json({ message: 'Checked in' })
  } catch (error) {
    console.error('Checkin error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id/checkout/force', authenticate, requireAdmin, async (req, res) => {
  const contentId = Number(req.params.id)
  if (!Number.isInteger(contentId) || contentId <= 0) {
    return res.status(400).json({ error: 'Invalid content id' })
  }

  try {
    const [[lock]] = await pool.execute(
      'SELECT id, locked_by FROM checkout_locks WHERE org_id = ? AND content_id = ?',
      [req.user.orgId, contentId]
    )
    if (!lock) return res.status(404).json({ error: 'No active checkout lock found' })

    await pool.execute('DELETE FROM checkout_locks WHERE id = ?', [lock.id])

    await auditService.log(
      req.user.orgId,
      req.user.userId,
      'org_user',
      'force_checkin',
      'vault_content',
      contentId,
      req.ip,
      { locked_by: lock.locked_by },
      { force_released_by: req.user.userId },
      'Admin force release checkout'
    )

    res.json({ message: 'Checkout lock force released' })
  } catch (error) {
    console.error('Force release checkout error:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
