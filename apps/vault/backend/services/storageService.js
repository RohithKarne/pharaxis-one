const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

const UPLOAD_ROOT = path.resolve(__dirname, '../uploads')
const USE_OBJECT_STORAGE = Boolean(process.env.S3_BUCKET && process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY)

let s3Client = null
if (USE_OBJECT_STORAGE) {
  s3Client = new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    endpoint: process.env.MINIO_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.MINIO_ENDPOINT),
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY,
      secretAccessKey: process.env.S3_SECRET_KEY
    }
  })
}

function sanitizeFileName(name) {
  return String(name || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 200)
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function buildStorageKey(orgId, contentId, versionNumber, originalName) {
  const safe = sanitizeFileName(originalName)
  const timestamp = Date.now()
  return `org-${orgId}/content-${contentId}/v-${versionNumber}/${timestamp}-${safe}`
}

function isLikelyS3Record(version) {
  return Boolean(version && version.s3_key && !String(version.file_path || '').startsWith('/'))
}

async function ensureDir(targetDir) {
  await fs.promises.mkdir(targetDir, { recursive: true })
}

async function uploadToLocal(fileBuffer, key) {
  const fullPath = path.join(UPLOAD_ROOT, key)
  await ensureDir(path.dirname(fullPath))
  await fs.promises.writeFile(fullPath, fileBuffer)
  return fullPath
}

async function uploadFile(file, orgId, contentId, versionNumber) {
  if (!file || !file.buffer) throw new Error('Missing file buffer')

  const checksum = sha256(file.buffer)
  const key = buildStorageKey(orgId, contentId, versionNumber, file.originalname)
  const mimeType = file.mimetype || 'application/octet-stream'
  const sizeKb = Math.max(1, Math.round(file.size / 1024))

  if (s3Client) {
    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: key,
          Body: file.buffer,
          ContentType: mimeType
        })
      )

      return {
        storage: 's3',
        s3_key: key,
        file_path: key,
        file_size_kb: sizeKb,
        mime_type: mimeType,
        checksum
      }
    } catch (error) {
      console.error('S3 upload failed, falling back to local storage:', error.message)
    }
  }

  const localPath = await uploadToLocal(file.buffer, key)
  return {
    storage: 'local',
    s3_key: key,
    file_path: localPath,
    file_size_kb: sizeKb,
    mime_type: mimeType,
    checksum
  }
}

async function streamToBuffer(readable) {
  const chunks = []
  for await (const chunk of readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function getObjectBuffer(versionRecord) {
  if (isLikelyS3Record(versionRecord) && s3Client) {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: versionRecord.s3_key
      })
    )
    if (!response.Body) throw new Error('S3 object body not available')
    return streamToBuffer(response.Body)
  }

  const localPath = resolveLocalPath(versionRecord)
  if (!localPath) throw new Error('Local path missing for file record')
  return fs.promises.readFile(localPath)
}

async function getDownloadDescriptor(versionRecord) {
  if (isLikelyS3Record(versionRecord) && s3Client) {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: versionRecord.s3_key
    })
    const url = await getSignedUrl(s3Client, command, { expiresIn: 60 * 15 })
    return {
      source: 's3',
      url,
      expires_in_seconds: 60 * 15
    }
  }

  return {
    source: 'local',
    url: `/api/content/files/${versionRecord.id}`,
    expires_in_seconds: null
  }
}

function resolveLocalPath(versionRecord) {
  if (!versionRecord || !versionRecord.file_path) return null
  const filePath = String(versionRecord.file_path)
  return path.isAbsolute(filePath) ? filePath : path.join(UPLOAD_ROOT, filePath)
}

module.exports = {
  uploadFile,
  getObjectBuffer,
  getDownloadDescriptor,
  resolveLocalPath
}
