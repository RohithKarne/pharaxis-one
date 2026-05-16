'use strict';

/**
 * ocrService.js — OCR provider abstraction.
 *
 * Wave 0 piece #6. Used by:
 *   - Theme 6 (extract text from attached PDFs, scanned docs, images)
 *   - Document Export / Case Email Import (auto-tag uploads)
 *   - DPPR (find PII in unstructured attachments for redaction)
 *
 * Providers (env: OCR_PROVIDER):
 *   • 'none'     — default; returns null. UI shows "OCR disabled".
 *   • 'tesseract'— lazy-require tesseract.js. Pure-JS, slow, no network.
 *                  Fine for dev or low-volume on-prem deployments.
 *   • 'textract' — AWS Textract (lazy @aws-sdk/client-textract).
 *                  Production cloud option.
 *
 * Surface:
 *   extractText({ buffer, mimeType, lang? }) → Promise<{ text, confidence, provider }>
 *   isEnabled()                              → boolean
 *
 * Designed to plug into the jobQueueService:
 *   jobQueue.register('ocr', async ({ attachmentId }) => {
 *     const att = …load…;
 *     const { text } = await ocrService.extractText({ buffer: att.buffer, mimeType: att.mime_type });
 *     await db.update(attachments).set({ ocr_text: text, ocr_status: 'done' });
 *   });
 */

const { logger } = require('./logger');

const PROVIDER = (process.env.OCR_PROVIDER || 'none').toLowerCase();
const DEFAULT_LANG = process.env.OCR_LANG || 'eng';

function isEnabled() { return PROVIDER !== 'none'; }

// ── Tesseract (lazy) ──────────────────────────────────────────────────────────

let _tess = null;
function _loadTesseract() {
  if (_tess) return _tess;
  try {
    _tess = require('tesseract.js'); // eslint-disable-line global-require
    return _tess;
  } catch (err) {
    const e = new Error("OCR_PROVIDER=tesseract but 'tesseract.js' is not installed.");
    e.cause = err;
    throw e;
  }
}

async function _tesseractExtract({ buffer, lang }) {
  const t = _loadTesseract();
  const { data } = await t.recognize(buffer, lang || DEFAULT_LANG);
  return {
    text:       (data?.text || '').trim(),
    confidence: typeof data?.confidence === 'number' ? data.confidence / 100 : null,
    provider:   'tesseract',
  };
}

// ── AWS Textract (lazy) ───────────────────────────────────────────────────────

let _textract = null;
let _textractLib = null;
function _loadTextract() {
  if (_textract && _textractLib) return { client: _textract, lib: _textractLib };
  try {
    _textractLib = require('@aws-sdk/client-textract'); // eslint-disable-line global-require
    _textract = new _textractLib.TextractClient({ region: process.env.AWS_REGION || 'us-east-1' });
    return { client: _textract, lib: _textractLib };
  } catch (err) {
    const e = new Error("OCR_PROVIDER=textract but '@aws-sdk/client-textract' is not installed.");
    e.cause = err;
    throw e;
  }
}

async function _textractExtract({ buffer }) {
  const { client, lib } = _loadTextract();
  const cmd = new lib.DetectDocumentTextCommand({ Document: { Bytes: buffer } });
  const out = await client.send(cmd);
  const blocks = out.Blocks || [];
  const lines  = blocks.filter(b => b.BlockType === 'LINE').map(b => b.Text);
  const text   = lines.join('\n').trim();
  const conf   = blocks.length
    ? blocks.reduce((s, b) => s + (b.Confidence || 0), 0) / blocks.length / 100
    : null;
  return { text, confidence: conf, provider: 'textract' };
}

// ── Public API ────────────────────────────────────────────────────────────────

async function extractText({ buffer, mimeType, lang } = {}) {
  if (!buffer) throw new Error('extractText requires a buffer');
  if (PROVIDER === 'none') return null;
  // Only attempt OCR on images + PDFs.
  const mt = (mimeType || '').toLowerCase();
  if (!mt.startsWith('image/') && mt !== 'application/pdf') return null;

  try {
    if (PROVIDER === 'tesseract') return _tesseractExtract({ buffer, lang });
    if (PROVIDER === 'textract')  return _textractExtract({ buffer });
    logger.warn({ provider: PROVIDER }, 'ocrService: unknown provider');
    return null;
  } catch (err) {
    logger.warn({ err: err.message, provider: PROVIDER }, 'OCR extraction failed');
    return null;
  }
}

module.exports = { PROVIDER, isEnabled, extractText };
