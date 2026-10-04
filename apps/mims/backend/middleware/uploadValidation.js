'use strict';

const fs = require('fs');
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

// What the first bytes of a file say it is (MIPM-141). The browser's declared type
// and the file name are both chosen by the sender, so a text or HTML file named
// logo.png and sent as image/png was accepted and stored.
const SIGNATURES = [
  { mimes: ['image/png'], test: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mimes: ['image/jpeg'], test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mimes: ['image/gif'], test: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')) },
  { mimes: ['image/webp'], test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { mimes: ['application/pdf'], test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mimes: ['application/msword'], test: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) },
  { mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], test: (b) => b.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) },
];
const TEXT_MIMES = new Set(ALLOWED_MIME_TYPES.csv);

function readHead(file) {
  if (file.buffer) return file.buffer.subarray(0, 4096);
  if (!file.path) return null;
  const fd = fs.openSync(file.path, 'r');
  try {
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n);
  } finally { fs.closeSync(fd); }
}

function contentMatchesType(file) {
  const head = readHead(file);
  if (!head) return true; // nothing stored to read (custom storage engine): rely on the other checks
  if (TEXT_MIMES.has(file.mimetype)) return !head.includes(0);
  const sig = SIGNATURES.find((s) => s.mimes.includes(file.mimetype));
  return sig ? sig.test(head) : true;
}

function discard(files) {
  for (const f of files) {
    if (f?.path) fs.unlink(f.path, () => {});
  }
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
        if (!contentMatchesType(file)) {
          discard(files);
          return res.status(400).json({ error: `The file's content is not a ${ext.replace('.', '').toUpperCase() || 'valid'} file.` });
        }
      }
    }
    next();
  };
}

module.exports = { validateUpload, ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS, MAX_SIZE_BYTES };
