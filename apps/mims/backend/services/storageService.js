'use strict';
/**
 * storageService.js — Pluggable file storage abstraction
 *
 * Current backend: local disk (backend/storage/).
 * Interface designed for S3/MinIO swap — change the implementation here only.
 *
 * All paths passed in/out are RELATIVE to STORAGE_ROOT (never absolute).
 * Callers store relative paths in DB — portable across machines and backends.
 *
 * Usage:
 *   const storage = require('./storageService');
 *   const relPath = await storage.save(buffer, 'cm_documents/123/file.pdf', 'application/pdf');
 *   const abs     = storage.resolve(relPath);       // absolute path (local only)
 *   const url     = storage.publicUrl(relPath);     // URL path for serving
 *   await storage.remove(relPath);
 */

const fs   = require('fs');
const path = require('path');

// ── Storage root ──────────────────────────────────────────────────────────────
// Configurable via env; defaults to backend/storage/ relative to this file.
const STORAGE_ROOT = process.env.STORAGE_ROOT
  ? path.resolve(process.env.STORAGE_ROOT)
  : path.join(__dirname, '..', 'storage');

// ── Public URL prefix ─────────────────────────────────────────────────────────
// In dev, Express serves /storage/* statically from STORAGE_ROOT.
// In production behind nginx, set STORAGE_PUBLIC_PREFIX to the CDN/bucket URL.
const PUBLIC_PREFIX = (process.env.STORAGE_PUBLIC_PREFIX || '/storage').replace(/\/$/, '');

/**
 * resolve(relativePath) → absolute path on disk.
 * Prevents path traversal: throws if resolved path escapes STORAGE_ROOT.
 */
function resolve(relativePath) {
  if (!relativePath) throw new Error('storageService.resolve: relativePath is required');
  const abs = path.resolve(STORAGE_ROOT, relativePath);
  if (!abs.startsWith(STORAGE_ROOT + path.sep) && abs !== STORAGE_ROOT) {
    throw new Error(`storageService: path traversal detected — ${relativePath}`);
  }
  return abs;
}

/**
 * publicUrl(relativePath) → URL string for use in responses / DB storage.
 */
function publicUrl(relativePath) {
  if (!relativePath) return null;
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\//, '');
  return `${PUBLIC_PREFIX}/${normalized}`;
}

/**
 * save(buffer, relativePath, mimeType?) → resolvedRelativePath
 * Creates parent directories automatically.
 */
async function save(buffer, relativePath) {
  if (!buffer || !relativePath) throw new Error('storageService.save: buffer and relativePath required');
  const abs = resolve(relativePath);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  await fs.promises.writeFile(abs, buffer);
  return relativePath; // always return relative — callers store this in DB
}

/**
 * saveStream(readableStream, relativePath) → resolvedRelativePath
 */
async function saveStream(stream, relativePath) {
  if (!stream || !relativePath) throw new Error('storageService.saveStream: stream and relativePath required');
  const abs = resolve(relativePath);
  await fs.promises.mkdir(path.dirname(abs), { recursive: true });
  return new Promise((resolve_, reject) => {
    const ws = fs.createWriteStream(abs);
    stream.pipe(ws);
    ws.on('finish', () => resolve_(relativePath));
    ws.on('error',  reject);
    stream.on('error', reject);
  });
}

/**
 * remove(relativePath) → void
 * Silently ignores ENOENT (file already gone).
 */
async function remove(relativePath) {
  if (!relativePath) return;
  try {
    const abs = resolve(relativePath);
    await fs.promises.unlink(abs);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

/**
 * exists(relativePath) → boolean
 */
async function exists(relativePath) {
  if (!relativePath) return false;
  try {
    const abs = resolve(relativePath);
    await fs.promises.access(abs, fs.constants.F_OK);
    return true;
  } catch (_) { return false; }
}

/**
 * ensureDir(relativeDirPath) → void
 */
async function ensureDir(relativeDirPath) {
  const abs = resolve(relativeDirPath);
  await fs.promises.mkdir(abs, { recursive: true });
}

module.exports = { resolve, publicUrl, save, saveStream, remove, exists, ensureDir, STORAGE_ROOT };
