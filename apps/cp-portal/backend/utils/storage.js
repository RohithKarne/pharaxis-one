/**
 * storage.js  (CP-16)
 *
 * Single seam for uploaded-file storage so we can move off local disk (which is
 * ephemeral on serverless / breaks with >1 instance) to Azure Blob without
 * touching every route.
 *
 * Provider is chosen by env STORAGE_PROVIDER ('local' default | 'azure-blob').
 * Today only 'local' is implemented; the azure-blob path is stubbed so the swap
 * is a config + credentials change, not a code rewrite.
 *
 * Relative paths stored in the DB (e.g. "/uploads/private/docs/4/x.pdf") stay
 * provider-agnostic — resolve()/readStream()/remove() translate them.
 */

const fs   = require('fs');
const path = require('path');

const PROVIDER   = process.env.STORAGE_PROVIDER || 'local';
// Local root = backend/ (relative paths already begin with /uploads/...).
const LOCAL_ROOT = path.join(__dirname, '..');

function assertLocal(op) {
  if (PROVIDER !== 'local') {
    throw new Error(`storage.${op}: provider '${PROVIDER}' not yet implemented. ` +
      `Wire the Azure Blob client here and set STORAGE_PROVIDER=azure-blob.`);
  }
}

/** Resolve a stored relative path to something readable by the current provider. */
function resolve(relativePath) {
  assertLocal('resolve');
  return path.join(LOCAL_ROOT, String(relativePath || '').replace(/^\//, ''));
}

/** True if the stored object currently exists. */
function exists(relativePath) {
  assertLocal('exists');
  try { return fs.existsSync(resolve(relativePath)); } catch { return false; }
}

/** Readable stream for a stored object (used by the authenticated streamers). */
function readStream(relativePath) {
  assertLocal('readStream');
  return fs.createReadStream(resolve(relativePath));
}

/** Delete a stored object; never throws. */
function remove(relativePath) {
  try { assertLocal('remove'); fs.unlinkSync(resolve(relativePath)); } catch { /* ignore */ }
}

/** Absolute directory multer should write into for a given relative dir. */
function uploadDir(relativeDir) {
  assertLocal('uploadDir');
  const dir = path.join(LOCAL_ROOT, String(relativeDir || '').replace(/^\//, ''));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports = { PROVIDER, resolve, exists, readStream, remove, uploadDir };
