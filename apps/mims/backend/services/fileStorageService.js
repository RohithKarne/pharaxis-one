'use strict';

/**
 * fileStorageService.js — pluggable file storage backend.
 *
 * Wave 0 piece #4 (storage half). Powers:
 *   - Theme 1 (image annotation, signature capture)
 *   - Theme 6 (drag-drop upload, per-field attachments, OCR pipeline)
 *   - Documents tab (case attachments, letter templates)
 *
 * Providers:
 *   • 'local' — default; writes under backend/storage/uploads/<orgId>/<key>
 *   • 's3'    — when STORAGE_PROVIDER=s3 and AWS env vars are set.
 *               Lazy-loads @aws-sdk/client-s3. If not installed, throws at use time
 *               (we don't force the dep on a fresh dev box).
 *
 * Surface (all return Promise):
 *   put({ orgId, key, body, contentType })        → { provider, key, url, size }
 *   get({ orgId, key })                           → { stream | buffer, contentType, size }
 *   getSignedUrl({ orgId, key, expiresIn })       → string  (S3 only; local returns app URL)
 *   remove({ orgId, key })                        → { ok }
 *
 * Keys are caller-supplied opaque identifiers (e.g. 'attachments/<uuid>.pdf').
 * The service does NOT make a key — callers should use crypto.randomUUID().
 */

const fs    = require('fs');
const fsp   = require('fs/promises');
const path  = require('path');
const crypto = require('crypto');

const PROVIDER  = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
const LOCAL_ROOT = process.env.STORAGE_LOCAL_ROOT
  || path.join(__dirname, '..', 'storage', 'uploads');

const S3_BUCKET = process.env.STORAGE_S3_BUCKET || '';
const S3_REGION = process.env.AWS_REGION || process.env.STORAGE_S3_REGION || 'us-east-1';

// ── Local provider ────────────────────────────────────────────────────────────

function localPathFor(orgId, key) {
  const safeKey = String(key || '').replace(/\.\.+/g, '_'); // path-traversal guard
  return path.join(LOCAL_ROOT, String(orgId || 'shared'), safeKey);
}

async function localPut({ orgId, key, body, contentType }) {
  const target = localPathFor(orgId, key);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, body);
  const stat = await fsp.stat(target);
  return {
    provider: 'local',
    key,
    url: `/api/files/${encodeURIComponent(orgId || 'shared')}/${encodeURI(key)}`,
    size: stat.size,
    contentType: contentType || 'application/octet-stream',
  };
}

async function localGet({ orgId, key }) {
  const target = localPathFor(orgId, key);
  const stat = await fsp.stat(target);
  return {
    stream:      fs.createReadStream(target),
    contentType: 'application/octet-stream',
    size:        stat.size,
  };
}

async function localRemove({ orgId, key }) {
  try { await fsp.unlink(localPathFor(orgId, key)); } catch (_) {}
  return { ok: true };
}

function localSignedUrl({ orgId, key }) {
  return `/api/files/${encodeURIComponent(orgId || 'shared')}/${encodeURI(key)}`;
}

// ── S3 provider (lazy-loaded) ─────────────────────────────────────────────────

let _s3 = null;
let _s3Lib = null;

function _loadS3() {
  if (_s3 && _s3Lib) return { s3: _s3, lib: _s3Lib };
  try {
    // eslint-disable-next-line global-require
    _s3Lib = require('@aws-sdk/client-s3');
    _s3 = new _s3Lib.S3Client({ region: S3_REGION });
    return { s3: _s3, lib: _s3Lib };
  } catch (err) {
    const e = new Error(
      "S3 provider requested but '@aws-sdk/client-s3' is not installed. " +
      "Install it or set STORAGE_PROVIDER=local."
    );
    e.cause = err;
    throw e;
  }
}

function s3KeyFor(orgId, key) {
  return `${orgId || 'shared'}/${key}`;
}

async function s3Put({ orgId, key, body, contentType }) {
  const { s3, lib } = _loadS3();
  await s3.send(new lib.PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3KeyFor(orgId, key),
    Body: body,
    ContentType: contentType || 'application/octet-stream',
  }));
  return {
    provider: 's3',
    key,
    url: `s3://${S3_BUCKET}/${s3KeyFor(orgId, key)}`,
    size: Buffer.isBuffer(body) ? body.length : null,
    contentType: contentType || 'application/octet-stream',
  };
}

async function s3Get({ orgId, key }) {
  const { s3, lib } = _loadS3();
  const out = await s3.send(new lib.GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3KeyFor(orgId, key),
  }));
  return {
    stream:      out.Body,
    contentType: out.ContentType || 'application/octet-stream',
    size:        out.ContentLength || null,
  };
}

async function s3Remove({ orgId, key }) {
  const { s3, lib } = _loadS3();
  await s3.send(new lib.DeleteObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3KeyFor(orgId, key),
  }));
  return { ok: true };
}

async function s3SignedUrl({ orgId, key, expiresIn = 300 }) {
  const { s3, lib } = _loadS3();
  let presigner;
  try { presigner = require('@aws-sdk/s3-request-presigner'); }
  catch { throw new Error("'@aws-sdk/s3-request-presigner' not installed."); }
  const cmd = new lib.GetObjectCommand({ Bucket: S3_BUCKET, Key: s3KeyFor(orgId, key) });
  return presigner.getSignedUrl(s3, cmd, { expiresIn });
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

function dispatch(localFn, s3Fn) {
  return (args) => (PROVIDER === 's3' ? s3Fn(args) : localFn(args));
}

const put         = dispatch(localPut,        s3Put);
const get         = dispatch(localGet,        s3Get);
const remove      = dispatch(localRemove,     s3Remove);
const getSignedUrl = dispatch(localSignedUrl, s3SignedUrl);

function generateKey(extension = '') {
  const ext = extension && !extension.startsWith('.') ? `.${extension}` : (extension || '');
  return `attachments/${new Date().getFullYear()}/${new Date().getMonth() + 1}/${crypto.randomUUID()}${ext}`;
}

module.exports = {
  PROVIDER,
  put,
  get,
  remove,
  getSignedUrl,
  generateKey,
  _internal: { localPathFor }, // for tests
};
