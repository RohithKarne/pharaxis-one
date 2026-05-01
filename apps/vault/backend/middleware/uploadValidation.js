const path = require('path')

const ALLOWED_UPLOAD_EXTENSIONS = new Set(['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.png', '.jpg', '.jpeg'])
const BLOCKED_UPLOAD_EXTENSIONS = new Set(['.exe', '.bat', '.cmd', '.com', '.sh', '.ps1', '.js', '.mjs', '.php', '.jar', '.scr'])
const MAX_UPLOAD_NAME_LENGTH = 180
const MAGIC_BYTES = {
  '.pdf': [0x25, 0x50, 0x44, 0x46],
  '.png': [0x89, 0x50, 0x4e, 0x47],
  '.jpg': [0xff, 0xd8, 0xff],
  '.jpeg': [0xff, 0xd8, 0xff]
}

function extensionOf(fileName) {
  return path.extname(String(fileName || '')).toLowerCase()
}

function matchesMagicBytes(file, ext) {
  const signature = MAGIC_BYTES[ext]
  if (!signature) return true
  if (!file.buffer || file.buffer.length < signature.length) return false
  return signature.every((byte, index) => file.buffer[index] === byte)
}

function validateUploadFile(file) {
  if (!file || !file.originalname) return 'file is required'
  const fileName = String(file.originalname)
  if (fileName.length > MAX_UPLOAD_NAME_LENGTH) return 'file name is too long'
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) return 'file name contains an invalid path'
  const ext = extensionOf(fileName)
  if (BLOCKED_UPLOAD_EXTENSIONS.has(ext)) return 'file type is blocked'
  if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) return `Invalid file type. Allowed: ${Array.from(ALLOWED_UPLOAD_EXTENSIONS).join(', ')}`
  if (!file.size || file.size <= 0) return 'file is empty'
  if (!matchesMagicBytes(file, ext)) return 'file content does not match the selected file type'
  return null
}

function requireValidSingleUpload(req, res, next) {
  const error = validateUploadFile(req.file)
  if (error) return res.status(400).json({ error })
  next()
}

module.exports = { ALLOWED_UPLOAD_EXTENSIONS, matchesMagicBytes, validateUploadFile, requireValidSingleUpload }
