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
 *
 * CPPM-12 adds a second stage: inspectDangerousContent. A file can be a genuine
 * PDF or Word document and still carry the payload — a macro, a script, an
 * embedded executable. We do not run a virus scanner (that is phase 2, with a
 * signature database), so instead the parts an attacker needs are refused
 * outright: macros, PDF JavaScript and launch actions, embedded files, and
 * archive bombs. That blocks the common document attacks, not an unknown
 * exploit hidden in otherwise ordinary content.
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
    const { ok, signature } = validateContent(f.path, f.mimetype, allowedMimes);
    // CPPM-12: a genuine PDF or Word file can still carry the payload.
    const danger = ok ? inspectDangerousContent(f.path, signature) : { ok: true };
    if (ok && !danger.ok) {
      for (const g of files) { try { fs.unlinkSync(g.path); } catch { /* ignore */ } }
      return `"${f.originalname}" was not accepted because ${danger.reason}.`;
    }
    if (!ok) {
      // Remove every uploaded file in this request — do not keep partial/malicious content.
      for (const g of files) { try { fs.unlinkSync(g.path); } catch { /* ignore */ } }
      return 'One or more files failed content validation. Upload a genuine PDF, image, or Office document.';
    }
  }
  return null;
}


// ── CPPM-12: dangerous content ──────────────────────────────────────────────

// Read at most this much of a file when looking for dangerous markers. Uploads
// are capped at 10MB, so this covers whole files in practice.
const MAX_INSPECT_BYTES = 12 * 1024 * 1024;

// The EICAR test string: a harmless file every scanner flags, used to prove the
// blocking path end to end without handling real malware.
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

// PDF markers that make a document act rather than display. /OpenAction alone is
// deliberately absent: benign PDFs use it for zoom and page position.
const PDF_MARKERS = [
  ['/JavaScript', 'runs JavaScript'],
  ['/JS', 'runs JavaScript'],
  ['/Launch', 'launches a program'],
  ['/EmbeddedFiles?', 'has another file embedded in it'],   // singular in the filespec, plural in the name tree
  ['/RichMedia', 'embeds media that can execute'],
];

// Names inside an Office file that mean macros, and extensions that have no
// business inside a document.
const OOXML_MACRO_PARTS = ['vbaproject.bin', 'vbadata.xml', 'macros/'];
const EXECUTABLE_EXTS = ['.exe', '.dll', '.scr', '.bat', '.cmd', '.com', '.js', '.jse', '.vbs',
  '.vbe', '.wsf', '.hta', '.ps1', '.jar', '.lnk', '.msi', '.pif', '.reg', '.sh'];

// A document that expands to more than this, or by more than this ratio, is an
// archive bomb rather than a document.
const MAX_EXPANDED_BYTES = 200 * 1024 * 1024;
const MAX_EXPANSION_RATIO = 200;

/**
 * Entries of a ZIP (so: docx, xlsx, pptx) read from its central directory.
 * Returns null when the file is not a readable ZIP.
 */
function readZipEntries(buf) {
  // End-of-central-directory record, searched from the end (it carries a comment).
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 66 * 1024; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) return null;
    const compressed = buf.readUInt32LE(off + 20);
    const uncompressed = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    entries.push({ name: buf.slice(off + 46, off + 46 + nameLen).toString('latin1'), compressed, uncompressed });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Second-stage check on a file that has already passed validateContent.
 * Returns { ok: true } or { ok: false, reason } with wording shown to the person.
 */
function inspectDangerousContent(filePath, signature) {
  let buf;
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      buf = Buffer.alloc(Math.min(size, MAX_INSPECT_BYTES));
      fs.readSync(fd, buf, 0, buf.length, 0);
    } finally { fs.closeSync(fd); }
  } catch {
    return { ok: false, reason: 'the file could not be read for checking' };
  }

  if (buf.includes(EICAR)) return { ok: false, reason: 'it matched the standard antivirus test file' };

  if (signature === 'ole2') {
    // Legacy .doc/.xls are a single binary blob where macros cannot be separated
    // out without parsing OLE2 itself. Refused: the modern format is checked properly.
    return { ok: false, reason: 'older Word and Excel files (.doc, .xls) are not accepted — please save as .docx, .xlsx or PDF' };
  }

  if (signature === 'pdf') {
    const text = buf.toString('latin1');
    for (const [marker, why] of PDF_MARKERS) {
      // /JS must not match /JSon-like names; PDF names end at a delimiter.
      const re = new RegExp('\\' + marker + '(?![A-Za-z])');
      if (re.test(text)) return { ok: false, reason: `the PDF ${why}` };
    }
    return { ok: true };
  }

  if (signature === 'zip') {
    const entries = readZipEntries(buf);
    if (!entries) return { ok: false, reason: 'the document is damaged or not a real Office file' };
    let expanded = 0, packed = 0;
    for (const e of entries) {
      const lower = e.name.toLowerCase();
      if (OOXML_MACRO_PARTS.some(part => lower.includes(part))) {
        return { ok: false, reason: 'it contains macros — please save it without macros, or send a PDF' };
      }
      if (EXECUTABLE_EXTS.some(ext => lower.endsWith(ext))) {
        return { ok: false, reason: 'it has a program file hidden inside it' };
      }
      expanded += e.uncompressed;
      packed += e.compressed;
    }
    if (expanded > MAX_EXPANDED_BYTES || (packed > 0 && expanded / packed > MAX_EXPANSION_RATIO)) {
      return { ok: false, reason: 'it expands to an unreasonable size when opened' };
    }
    return { ok: true };
  }

  return { ok: true };
}

module.exports = { detectSignature, validateContent, validateUploads, inspectDangerousContent, SIG_TO_EXT, EICAR };
