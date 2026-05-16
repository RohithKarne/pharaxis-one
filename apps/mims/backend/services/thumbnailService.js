'use strict';

/**
 * thumbnailService.js — image/PDF thumbnail generator.
 *
 * Wave 0 piece #4 (thumbnail half). Powers:
 *   - Theme 6 (drag-drop attachment gallery, PDF preview tiles)
 *   - Documents tab (letter template previews)
 *   - Field-level image annotation (Theme 1)
 *
 * Engines:
 *   • 'sharp' for raster images — lazy-required; if not installed, returns the
 *     original buffer untouched and logs once.
 *   • 'pdftoppm' for PDFs — shells out if poppler is on PATH; otherwise returns null.
 *
 * Surface:
 *   generate({ buffer, mimeType, width, height }) → Promise<{ buffer, mimeType }|null>
 *
 * Callers should treat a null result as "no thumb available — use a generic icon".
 */

const { logger } = require('./logger');
const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

let _sharp = null;
let _sharpTried = false;
let _sharpAvailable = false;

function loadSharp() {
  if (_sharpTried) return _sharpAvailable ? _sharp : null;
  _sharpTried = true;
  try {
    _sharp = require('sharp'); // eslint-disable-line global-require
    _sharpAvailable = true;
    return _sharp;
  } catch (_err) {
    logger.warn(
      'thumbnailService: sharp not installed — image thumbnails will pass through originals. ' +
      'Install `sharp` for resized thumbnails.'
    );
    return null;
  }
}

async function generateImageThumb({ buffer, width, height, mimeType }) {
  const sharp = loadSharp();
  if (!sharp) return { buffer, mimeType: mimeType || 'image/jpeg' };
  const out = await sharp(buffer)
    .resize(width || 320, height || 320, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
  return { buffer: out, mimeType: 'image/jpeg' };
}

async function generatePdfThumb({ buffer, width = 320 }) {
  // Use poppler's pdftoppm if available. Best-effort; returns null on failure.
  const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'mims-thumb-'));
  const inputPath  = path.join(tmpdir, `${crypto.randomUUID()}.pdf`);
  const outputBase = path.join(tmpdir, 'page');
  try {
    await fs.writeFile(inputPath, buffer);
    await new Promise((resolve, reject) => {
      const p = spawn('pdftoppm', ['-jpeg', '-r', '72', '-f', '1', '-l', '1', '-scale-to', String(width), inputPath, outputBase]);
      p.on('error', reject);
      p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`pdftoppm exit ${code}`)));
    });
    const files = await fs.readdir(tmpdir);
    const jpg = files.find(f => f.endsWith('.jpg'));
    if (!jpg) return null;
    const jpgBuf = await fs.readFile(path.join(tmpdir, jpg));
    return { buffer: jpgBuf, mimeType: 'image/jpeg' };
  } catch (err) {
    logger.warn({ err: err.message }, 'thumbnailService: pdftoppm failed — no PDF thumb');
    return null;
  } finally {
    fs.rm(tmpdir, { recursive: true, force: true }).catch(() => {});
  }
}

async function generate({ buffer, mimeType, width, height }) {
  const mt = (mimeType || '').toLowerCase();
  if (mt.startsWith('image/')) return generateImageThumb({ buffer, width, height, mimeType });
  if (mt === 'application/pdf') return generatePdfThumb({ buffer, width });
  return null;
}

module.exports = { generate };
