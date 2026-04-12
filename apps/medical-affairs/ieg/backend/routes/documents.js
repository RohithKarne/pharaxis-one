const express = require('express')
const multer = require('multer')
const path = require('path')
const { query } = require('../database/db')
const { requireAuth, requireInternal } = require('../middleware/auth')
const { storeDocumentVersion, signDocumentVersion, createDownloadToken, resolveDownloadPath } = require('../services/documentService')
const { logAudit } = require('../services/auditService')
const { actorFromAuth } = require('../utils/actor')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

const router = express.Router()

router.get('/', requireAuth, requireInternal, async (req, res) => {
  const { moduleKey, entityType, entityId } = req.query
  const params = []
  const where = []

  if (moduleKey) {
    params.push(moduleKey)
    where.push(`d.module_key = $${params.length}`)
  }
  if (entityType) {
    params.push(entityType)
    where.push(`d.entity_type = $${params.length}`)
  }
  if (entityId) {
    params.push(String(entityId))
    where.push(`d.entity_id = $${params.length}`)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const { rows } = await query(
    `
      SELECT d.*, v.id AS current_version_id, v.file_name AS current_file_name, v.mime_type, v.file_size, v.signature_status
      FROM ieg_documents d
      LEFT JOIN ieg_document_versions v
        ON v.document_id = d.id AND v.version_no = d.current_version
      ${whereSql}
      ORDER BY d.created_at DESC
      LIMIT 200
    `,
    params
  )

  return res.json({ documents: rows })
})

router.get('/:documentId/versions', requireAuth, requireInternal, async (req, res) => {
  const documentId = Number(req.params.documentId)
  const { rows } = await query(
    `
      SELECT id, document_id, version_no, file_name, mime_type, file_size, file_sha256, signature_status, signature_data, uploaded_at
      FROM ieg_document_versions
      WHERE document_id = $1
      ORDER BY version_no DESC
    `,
    [documentId]
  )
  return res.json({ versions: rows })
})

router.post('/upload', requireAuth, requireInternal, upload.single('file'), async (req, res) => {
  const { moduleKey, entityType, entityId, visibility } = req.body || {}
  if (!moduleKey || !entityType || !entityId || !req.file) {
    return res.status(400).json({ error: 'moduleKey, entityType, entityId and file are required' })
  }

  const result = await storeDocumentVersion({
    moduleKey,
    entityType,
    entityId,
    file: req.file,
    uploadedBy: req.auth.userId,
    visibility: visibility || 'internal'
  })

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey,
    entityType,
    entityId: String(entityId),
    action: 'document_uploaded',
    metadata: { documentId: result.documentId, version: result.version.version_no, fileName: result.version.file_name }
  })

  return res.status(201).json(result)
})

router.post('/sign', requireAuth, requireInternal, async (req, res) => {
  const { documentId, versionNo } = req.body || {}
  if (!documentId || !versionNo) {
    return res.status(400).json({ error: 'documentId and versionNo are required' })
  }

  const signed = await signDocumentVersion({
    documentId: Number(documentId),
    versionNo: Number(versionNo),
    signerUserId: req.auth.userId,
    signerName: req.auth.fullName
  })

  if (!signed) {
    return res.status(404).json({ error: 'Document version not found' })
  }

  await logAudit({
    ...actorFromAuth(req.auth),
    moduleKey: 'foundation',
    entityType: 'document_version',
    entityId: String(signed.id),
    action: 'document_signed',
    metadata: { documentId, versionNo }
  })

  return res.json({ signed })
})

router.post('/download-token', requireAuth, requireInternal, async (req, res) => {
  const { documentVersionId } = req.body || {}
  if (!documentVersionId) {
    return res.status(400).json({ error: 'documentVersionId is required' })
  }

  const token = createDownloadToken({ documentVersionId: Number(documentVersionId) })
  return res.json({ token })
})

router.get('/download/:token', async (req, res) => {
  try {
    const docVersion = await resolveDownloadPath(req.params.token)
    return res.download(docVersion.storage_path, path.basename(docVersion.file_name))
  } catch (error) {
    return res.status(400).json({ error: 'Invalid or expired download token' })
  }
})

module.exports = router
