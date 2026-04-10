const express = require('express')
const multer = require('multer')
const { pool } = require('../database/db')
const { authenticate } = require('../middleware/auth')
const auditService = require('../services/auditService')
const numberingService = require('../services/numberingService')
const storageService = require('../services/storageService')

const router = express.Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
})

const ALLOWED_ROLES = ['admin', 'author']
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.png', '.jpg', '.jpeg']

function requireAuthorOrAdmin(req, res, next) {
  if (!ALLOWED_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Only admin/author can upload' })
  }
  next()
}

function extOf(fileName) {
  const dot = String(fileName || '').lastIndexOf('.')
  return dot === -1 ? '' : String(fileName).slice(dot).toLowerCase()
}

function isValidUploadFile(file) {
  if (!file || !file.originalname) return false
  return ALLOWED_EXTENSIONS.includes(extOf(file.originalname))
}

async function ensureForeignKeysInOrg(orgId, folderId, typeId, subtypeId, classificationId) {
  const connection = await pool.getConnection()
  try {
    if (folderId) {
      const [[folder]] = await connection.execute(
        'SELECT id FROM vault_folders WHERE id = ? AND org_id = ? AND is_active = 1',
        [folderId, orgId]
      )
      if (!folder) throw new Error('Folder not found or inactive')
    }

    if (typeId) {
      const [[type]] = await connection.execute(
        'SELECT id FROM content_types WHERE id = ? AND org_id = ? AND is_active = 1',
        [typeId, orgId]
      )
      if (!type) throw new Error('Content type not found or inactive')
    }

    if (subtypeId) {
      const [[subtype]] = await connection.execute(
        'SELECT id, content_type_id FROM content_subtypes WHERE id = ? AND org_id = ? AND is_active = 1',
        [subtypeId, orgId]
      )
      if (!subtype) throw new Error('Subtype not found or inactive')
      if (Number(subtype.content_type_id) !== Number(typeId)) {
        throw new Error('Subtype does not belong to selected content type')
      }
    }

    if (classificationId) {
      const [[classification]] = await connection.execute(
        'SELECT id, content_subtype_id FROM classifications WHERE id = ? AND org_id = ? AND is_active = 1',
        [classificationId, orgId]
      )
      if (!classification) throw new Error('Classification not found or inactive')
      if (!subtypeId || Number(classification.content_subtype_id) !== Number(subtypeId)) {
        throw new Error('Classification does not belong to selected subtype')
      }
    }
  } finally {
    connection.release()
  }
}

function nextMajorVersion(existingVersionRows) {
  let maxMajor = 0
  existingVersionRows.forEach(row => {
    const major = Number(String(row.version_number || '0').split('.')[0]) || 0
    if (major > maxMajor) maxMajor = major
  })
  return `${maxMajor + 1}.0`
}

router.post('/', authenticate, requireAuthorOrAdmin, upload.single('file'), async (req, res) => {
  const { title, folder_id, content_type_id, content_subtype_id, classification_id } = req.body
  if (!title || !content_type_id || !req.file) {
    return res.status(400).json({ error: 'title, content_type_id and file are required' })
  }
  if (!isValidUploadFile(req.file)) {
    return res.status(400).json({ error: `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` })
  }

  const orgId = req.user.orgId
  const folderId = folder_id ? Number(folder_id) : null
  const typeId = Number(content_type_id)
  const subtypeId = content_subtype_id ? Number(content_subtype_id) : null
  const classificationId = classification_id ? Number(classification_id) : null

  if (!Number.isInteger(typeId) || typeId <= 0) {
    return res.status(400).json({ error: 'Invalid content_type_id' })
  }

  try {
    await ensureForeignKeysInOrg(orgId, folderId, typeId, subtypeId, classificationId)
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }

  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()

    const docNumber = await numberingService.generateDocNumber(orgId, typeId, connection)
    const [contentResult] = await connection.execute(
      `INSERT INTO vault_content
       (org_id, doc_number, title, folder_id, content_type_id, content_subtype_id, classification_id, lifecycle_state, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
      [orgId, docNumber, String(title).trim(), folderId, typeId, subtypeId, classificationId, req.user.userId]
    )
    const contentId = contentResult.insertId

    const storage = await storageService.uploadFile(req.file, orgId, contentId, '1.0')

    const [versionResult] = await connection.execute(
      `INSERT INTO vault_versions
       (org_id, content_id, version_number, file_name, file_path, s3_key, file_size_kb, mime_type, checksum, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId,
        contentId,
        '1.0',
        req.file.originalname,
        storage.file_path,
        storage.s3_key,
        storage.file_size_kb,
        storage.mime_type,
        storage.checksum,
        req.user.userId
      ]
    )
    const versionId = versionResult.insertId

    await connection.execute(
      'UPDATE vault_content SET current_version_id = ? WHERE id = ? AND org_id = ?',
      [versionId, contentId, orgId]
    )

    await connection.execute(
      `INSERT INTO vault_metadata
       (org_id, content_id, language, country_region, audience, confidentiality, regulated)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [orgId, contentId, null, null, 'internal', 'internal', 0]
    )

    await connection.commit()

    await auditService.log(
      orgId,
      req.user.userId,
      'org_user',
      'document_uploaded',
      'vault_content',
      contentId,
      req.ip,
      null,
      { doc_number: docNumber, title, version_number: '1.0', content_id: contentId },
      'Initial document upload completed'
    )

    res.status(201).json({
      message: 'Document uploaded',
      content_id: contentId,
      version_id: versionId,
      version_number: '1.0',
      doc_number: docNumber
    })
  } catch (error) {
    if (connection) await connection.rollback()
    console.error('Upload new document error:', error)
    res.status(500).json({ error: 'Server error' })
  } finally {
    if (connection) connection.release()
  }
})

router.post('/:contentId/version', authenticate, requireAuthorOrAdmin, upload.single('file'), async (req, res) => {
  const contentId = Number(req.params.contentId)
  if (!Number.isInteger(contentId) || contentId <= 0) {
    return res.status(400).json({ error: 'Invalid content id' })
  }
  if (!req.file) return res.status(400).json({ error: 'file is required' })
  if (!isValidUploadFile(req.file)) {
    return res.status(400).json({ error: `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}` })
  }

  const orgId = req.user.orgId
  let connection
  try {
    connection = await pool.getConnection()
    await connection.beginTransaction()

    const [[content]] = await connection.execute(
      `SELECT id, org_id, current_version_id
       FROM vault_content
       WHERE id = ? AND org_id = ?`,
      [contentId, orgId]
    )
    if (!content) {
      await connection.rollback()
      return res.status(404).json({ error: 'Content not found' })
    }

    const [[lock]] = await connection.execute(
      `SELECT id, locked_by
       FROM checkout_locks
       WHERE org_id = ? AND content_id = ?`,
      [orgId, contentId]
    )
    if (!lock || Number(lock.locked_by) !== Number(req.user.userId)) {
      await connection.rollback()
      return res.status(423).json({ error: 'Document must be checked out by current user before new version upload' })
    }

    const [versions] = await connection.execute(
      `SELECT version_number
       FROM vault_versions
       WHERE org_id = ? AND content_id = ?`,
      [orgId, contentId]
    )
    const nextVersion = nextMajorVersion(versions)
    const storage = await storageService.uploadFile(req.file, orgId, contentId, nextVersion)

    const [versionResult] = await connection.execute(
      `INSERT INTO vault_versions
       (org_id, content_id, version_number, file_name, file_path, s3_key, file_size_kb, mime_type, checksum, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orgId,
        contentId,
        nextVersion,
        req.file.originalname,
        storage.file_path,
        storage.s3_key,
        storage.file_size_kb,
        storage.mime_type,
        storage.checksum,
        req.user.userId
      ]
    )

    await connection.execute(
      'UPDATE vault_content SET current_version_id = ?, updated_at = NOW() WHERE id = ? AND org_id = ?',
      [versionResult.insertId, contentId, orgId]
    )
    await connection.commit()

    await auditService.log(
      orgId,
      req.user.userId,
      'org_user',
      'new_version_uploaded',
      'vault_version',
      versionResult.insertId,
      req.ip,
      null,
      { content_id: contentId, version_number: nextVersion },
      'New version uploaded'
    )

    res.status(201).json({
      message: 'New version uploaded',
      content_id: contentId,
      version_id: versionResult.insertId,
      version_number: nextVersion
    })
  } catch (error) {
    if (connection) await connection.rollback()
    console.error('Upload new version error:', error)
    res.status(500).json({ error: 'Server error' })
  } finally {
    if (connection) connection.release()
  }
})

module.exports = router
