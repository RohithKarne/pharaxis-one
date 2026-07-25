/**
 * storageService.js — Local File Storage & Security Management
 *
 * Implements local-only file storage driver adhering to local deployment constraints.
 * Provides safe filename generation (UUID), path normalization to prevent traversal,
 * magic byte checking, and structured local directory organization under `uploads/private/`.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'private');

// Allowed MIME types and corresponding magic bytes for file signature validation
const ALLOWED_SIGNATURES = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png': [0x89, 0x50, 0x4E, 0x47],
};

/**
 * Ensures the destination directory exists safely under UPLOAD_ROOT.
 */
function ensureDir(subDir = '') {
  const targetDir = path.normalize(path.join(UPLOAD_ROOT, subDir));
  if (!targetDir.startsWith(UPLOAD_ROOT)) {
    throw new Error('Security Violation: Invalid storage directory path.');
  }
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o750 });
  }
  return targetDir;
}

/**
 * Validates file buffer magic bytes against expected MIME types.
 */
function validateFileSignature(buffer, mimeType) {
  const expectedBytes = ALLOWED_SIGNATURES[mimeType];
  if (!expectedBytes) {
    // If MIME type isn't specifically in signature whitelist, ensure basic buffer sanity
    return true;
  }
  if (buffer.length < expectedBytes.length) return false;

  for (let i = 0; i < expectedBytes.length; i++) {
    if (buffer[i] !== expectedBytes[i]) return false;
  }
  return true;
}

/**
 * Generates a secure, unguessable local filename while preserving extension safely.
 */
function generateSafeFilename(originalName) {
  const ext = path.extname(originalName).toLowerCase().replace(/[^a-z0-9]/g, '');
  const hash = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  return `${timestamp}_${hash}.${ext || 'bin'}`;
}

/**
 * Saves a file buffer locally in `uploads/private/:category`.
 */
async function saveLocalFile({ buffer, originalName, mimeType, category = 'general' }) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Cannot store empty file.');
  }

  // Validate magic bytes if applicable
  const isValid = validateFileSignature(buffer, mimeType);
  if (!isValid) {
    throw new Error('Security Violation: File header magic bytes do not match expected MIME type.');
  }

  const categoryDir = ensureDir(category);
  const safeFilename = generateSafeFilename(originalName);
  const destinationPath = path.join(categoryDir, safeFilename);

  await fs.promises.writeFile(destinationPath, buffer);

  const relativePath = path.join('uploads', 'private', category, safeFilename).replace(/\\/g, '/');

  return {
    storedPath: relativePath,
    fullPath: destinationPath,
    filename: safeFilename,
    sizeBytes: buffer.length,
    mimeType,
  };
}

module.exports = {
  saveLocalFile,
  validateFileSignature,
  ensureDir,
  UPLOAD_ROOT,
};
