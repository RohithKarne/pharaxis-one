'use strict';

const ALLOWED_MIME_TYPES = {
  csv:   ['text/csv', 'application/csv', 'text/plain'],
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  doc:   ['application/pdf', 'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

const MAX_SIZE_BYTES = parseInt(process.env.UPLOAD_MAX_SIZE_MB || '10', 10) * 1024 * 1024;

function validateUpload(allowedTypes = []) {
  return (req, res, next) => {
    if (!req.file && !req.files) return next();
    const files = req.files ? Object.values(req.files).flat() : [req.file];
    for (const file of files) {
      if (file.size > MAX_SIZE_BYTES) {
        return res.status(400).json({ error: `File too large. Max size is ${process.env.UPLOAD_MAX_SIZE_MB || 10}MB.` });
      }
      if (allowedTypes.length > 0) {
        const allowed = allowedTypes.flatMap(t => ALLOWED_MIME_TYPES[t] || [t]);
        if (!allowed.includes(file.mimetype)) {
          return res.status(400).json({ error: `Invalid file type: ${file.mimetype}.` });
        }
      }
    }
    next();
  };
}

module.exports = { validateUpload, ALLOWED_MIME_TYPES, MAX_SIZE_BYTES };
