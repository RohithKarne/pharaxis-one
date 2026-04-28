'use strict';

const path = require('path');

const ALLOWED_MIME_TYPES = {
  csv:   ['text/csv', 'application/csv', 'text/plain'],
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  doc:   ['application/pdf', 'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

const ALLOWED_EXTENSIONS = {
  csv: ['.csv'],
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  doc: ['.pdf', '.doc', '.docx'],
};

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.bat', '.cmd', '.com', '.sh', '.bash', '.zsh', '.ps1',
  '.jar', '.msi', '.php', '.py', '.rb', '.pl', '.js', '.ts', '.jsx', '.tsx',
]);

const MAX_SIZE_BYTES = parseInt(process.env.UPLOAD_MAX_SIZE_MB || '10', 10) * 1024 * 1024;
const MAX_FILES = parseInt(process.env.UPLOAD_MAX_FILES || '10', 10);

function normalizeFilename(value) {
  return String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
}

function isSafeFilename(filename) {
  if (!filename) return false;
  if (filename.length > 255) return false;
  if (filename.includes('/') || filename.includes('\\')) return false;
  if (filename.includes('..')) return false;
  return true;
}

function extensionOf(filename) {
  return path.extname(String(filename || '')).toLowerCase();
}

function validateUpload(allowedTypes = []) {
  return (req, res, next) => {
    if (!req.file && !req.files) return next();
    const files = req.files ? Object.values(req.files).flat() : [req.file];
    if (files.length > MAX_FILES) {
      return res.status(400).json({ error: `Too many files uploaded. Maximum allowed is ${MAX_FILES}.` });
    }

    const allowedMimes = allowedTypes.flatMap(t => ALLOWED_MIME_TYPES[t] || [t]);
    const allowedExts = allowedTypes.flatMap(t => ALLOWED_EXTENSIONS[t] || []);

    for (const file of files) {
      const originalName = normalizeFilename(file.originalname);
      const ext = extensionOf(originalName);

      if (!isSafeFilename(originalName)) {
        return res.status(400).json({ error: 'Invalid filename.' });
      }
      if (!file || !Number.isFinite(file.size) || file.size <= 0) {
        return res.status(400).json({ error: 'Invalid file payload.' });
      }
      if (file.size > MAX_SIZE_BYTES) {
        return res.status(400).json({ error: `File too large. Max size is ${process.env.UPLOAD_MAX_SIZE_MB || 10}MB.` });
      }
      if (BLOCKED_EXTENSIONS.has(ext)) {
        return res.status(400).json({ error: `Blocked file extension: ${ext}` });
      }
      if (allowedTypes.length > 0) {
        if (!allowedMimes.includes(file.mimetype)) {
          return res.status(400).json({ error: `Invalid file type: ${file.mimetype}.` });
        }
        if (allowedExts.length > 0 && !allowedExts.includes(ext)) {
          return res.status(400).json({ error: `Invalid file extension: ${ext || 'none'}.` });
        }
      }
    }
    next();
  };
}

module.exports = { validateUpload, ALLOWED_MIME_TYPES, MAX_SIZE_BYTES };
