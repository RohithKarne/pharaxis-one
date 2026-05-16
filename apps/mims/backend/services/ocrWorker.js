'use strict';

/**
 * ocrWorker.js — registers the 'ocr' job queue handler.
 *
 * Wave 0 piece #6 (wiring). Called from server.js boot.
 * Pulls an attachment by id, runs OCR, persists ocr_text + ocr_status.
 */

const pool    = require('../database/db');
const storage = require('./fileStorageService');
const ocr     = require('./ocrService');
const jobs    = require('./jobQueueService');
const { logger } = require('./logger');

let _registered = false;

function start() {
  if (_registered) return;
  _registered = true;

  jobs.register('ocr', async ({ attachmentId }, ctx) => {
    if (!ocr.isEnabled()) {
      await pool.execute(
        "UPDATE attachments SET ocr_status='skipped', ocr_completed_at=NOW() WHERE id=?",
        [attachmentId]
      );
      return;
    }
    const [[a]] = await pool.execute(
      'SELECT org_id, storage_key, mime_type FROM attachments WHERE id=? AND deleted_at IS NULL',
      [attachmentId]
    );
    if (!a) return;
    try {
      const { stream } = await storage.get({ orgId: a.org_id, key: a.storage_key });
      const chunks = []; for await (const c of stream) chunks.push(c);
      const buf = Buffer.concat(chunks);
      const out = await ocr.extractText({ buffer: buf, mimeType: a.mime_type });
      const text = out?.text || null;
      await pool.execute(
        "UPDATE attachments SET ocr_text=?, ocr_status='done', ocr_completed_at=NOW() WHERE id=?",
        [text, attachmentId]
      );
      ctx.log(`OCR done: ${text ? text.length + ' chars' : 'no text'}`);
    } catch (err) {
      logger.warn({ err: err.message, attachmentId }, 'OCR job failed');
      await pool.execute(
        "UPDATE attachments SET ocr_status='failed', ocr_completed_at=NOW() WHERE id=?",
        [attachmentId]
      );
    }
  }, { concurrency: 2, retries: 1 });

  logger.info({ provider: ocr.PROVIDER, driver: jobs.DRIVER }, 'ocrWorker: ready');
}

module.exports = { start };
