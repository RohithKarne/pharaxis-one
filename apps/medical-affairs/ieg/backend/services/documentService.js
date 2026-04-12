const fs = require('fs/promises')
const path = require('path')
const crypto = require('crypto')
const jwt = require('jsonwebtoken')
const { query } = require('../database/db')
const JWT_SECRET = process.env.JWT_SECRET || 'ieg_dev_secret_change_me'

const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_ROOT || './backend/storage')

function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

async function ensureModuleDirectory(moduleKey) {
  const target = path.join(uploadRoot, moduleKey)
  await fs.mkdir(target, { recursive: true })
  return target
}

async function storeDocumentVersion({ moduleKey, entityType, entityId, file, uploadedBy, visibility = 'internal' }) {
  const existingDoc = await query(
    `SELECT * FROM ieg_documents WHERE module_key = $1 AND entity_type = $2 AND entity_id = $3`,
    [moduleKey, entityType, String(entityId)]
  )

  let doc = existingDoc.rows[0]
  if (!doc) {
    const created = await query(
      `
        INSERT INTO ieg_documents (module_key, entity_type, entity_id, visibility, created_by, current_version)
        VALUES ($1, $2, $3, $4, $5, 0)
        RETURNING *
      `,
      [moduleKey, entityType, String(entityId), visibility, uploadedBy]
    )
    doc = created.rows[0]
  }

  const versionNo = Number(doc.current_version) + 1
  const moduleDir = await ensureModuleDirectory(moduleKey)
  const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const fullPath = path.join(moduleDir, safeName)

  await fs.writeFile(fullPath, file.buffer)
  const digest = hashBuffer(file.buffer)

  const versionInsert = await query(
    `
      INSERT INTO ieg_document_versions
      (document_id, version_no, file_name, mime_type, file_size, storage_path, file_sha256, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [doc.id, versionNo, file.originalname, file.mimetype, file.size, fullPath, digest, uploadedBy]
  )

  await query(`UPDATE ieg_documents SET current_version = $1 WHERE id = $2`, [versionNo, doc.id])

  return {
    documentId: doc.id,
    version: versionInsert.rows[0]
  }
}

async function signDocumentVersion({ documentId, versionNo, signerUserId, signerName }) {
  const signatureData = {
    signerUserId,
    signerName,
    signedAt: new Date().toISOString(),
    signatureType: 'native'
  }

  const { rows } = await query(
    `
      UPDATE ieg_document_versions
      SET signature_status = 'signed', signature_data = $1::jsonb
      WHERE document_id = $2 AND version_no = $3
      RETURNING *
    `,
    [JSON.stringify(signatureData), documentId, versionNo]
  )

  return rows[0] || null
}

function createDownloadToken({ documentVersionId }) {
  return jwt.sign(
    { type: 'doc_download', documentVersionId },
    JWT_SECRET,
    { expiresIn: '15m' }
  )
}

async function resolveDownloadPath(token) {
  const decoded = jwt.verify(token, JWT_SECRET)
  if (decoded.type !== 'doc_download') throw new Error('Invalid token type')

  const { rows } = await query(`SELECT * FROM ieg_document_versions WHERE id = $1`, [decoded.documentVersionId])
  if (!rows[0]) throw new Error('Document version not found')
  return rows[0]
}

module.exports = {
  storeDocumentVersion,
  signDocumentVersion,
  createDownloadToken,
  resolveDownloadPath
}
