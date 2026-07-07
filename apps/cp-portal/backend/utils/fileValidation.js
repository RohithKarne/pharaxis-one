/**
 * fileValidation.js — content-based (magic-byte) file type validation.
 *
 * multer's fileFilter only sees `file.mimetype`, which is derived from the
 * client-supplied multipart Content-Type header and is therefore trivially
 * spoofable. This validates the ACTUAL bytes on disk after upload and lets
 * callers reject (and delete) files whose content does not match an allow-list.
 *
 * Supported content signatures cover the types the portal accepts:
 *   pdf, png, jpeg, gif, webp, doc (OLE2), docx/xlsx (ZIP/OOXML).
 */

const fs = require('fs');

// Map a logical type -> predicate over the first bytes of the file.
const SIGNATURES = {
  pdf:  (b) => b.slice(0, 5).toString('latin1') === '%PDF-',
  png:  (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif:  (b) => b.slice(0, 6).toString('latin1') === 'GIF87a' || b.slice(0, 6).toString('latin1') === 'GIF89a',
  webp: (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP',
  // Legacy Office (.doc/.xls/.ppt) — OLE2 compound file
  ole2: (b) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0,
  // OOXML (.docx/.xlsx/.pptx) and any zip — starts with "PK\x03\x04"
  zip:  (b) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07),
};

// MIME string -> the logical signatures that legitimately satisfy it.
// An empty array means "no binary signature exists" (plain text) — content is
// accepted as-is; safety is provided by serving it sandboxed + as an attachment.
const MIME_TO_SIGS = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpeg'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'application/msword': ['ole2'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['zip'],
  'application/vnd.ms-excel': ['ole2', 'zip'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['zip'],
  'text/plain': [],
};

// Extension the file should carry on disk once its real type is known.
const SIG_TO_EXT = { pdf: '.pdf', png: '.png', jpeg: '.jpg', gif: '.gif', webp: '.webp', ole2: '.doc', zip: '.docx' };

/**
 * Read the leading bytes of a file and return the logical signature that matches,
 * or null if none do.
 */
function detectSignature(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    for (const [name, test] of Object.entries(SIGNATURES)) {
      if (test(buf)) return name;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* ignore */ } }
  }
}

/**
 * Validate that a file's real content matches its declared mimetype AND is in
 * the allow-list of mimetypes. Returns { ok, signature, safeExt } or { ok:false }.
 */
function validateContent(filePath, declaredMime, allowedMimes) {
  if (!allowedMimes.includes(declaredMime)) return { ok: false };
  const acceptable = MIME_TO_SIGS[declaredMime];
  if (acceptable === undefined) return { ok: false }; // unknown/unsupported type — reject
  if (acceptable.length === 0) return { ok: true, signature: 'text', safeExt: '.txt' }; // plain text — no binary signature
  const sig = detectSignature(filePath);
  if (!sig || !acceptable.includes(sig)) return { ok: false };
  return { ok: true, signature: sig, safeExt: SIG_TO_EXT[sig] || '' };
}

/**
 * Validate an array of multer files against an allow-list. Deletes any file that
 * fails and returns the first failure message, or null if all pass.
 */
function validateUploads(files, allowedMimes) {
  for (const f of files || []) {
    const { ok } = validateContent(f.path, f.mimetype, allowedMimes);
    if (!ok) {
      // Remove every uploaded file in this request — do not keep partial/malicious content.
      for (const g of files) { try { fs.unlinkSync(g.path); } catch { /* ignore */ } }
      return 'One or more files failed content validation. Upload a genuine PDF, image, or Office document.';
    }
  }
  return null;
}

module.exports = { detectSignature, validateContent, validateUploads, SIG_TO_EXT };
